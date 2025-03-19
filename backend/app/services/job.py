from typing import List, Optional
import os
import random
import asyncio
from datetime import datetime

from sqlalchemy.orm import Session
from fastapi import HTTPException

from app.db.models import Job, User
from app.schemas.job import JobCreate, JobUpdate
from app.services.slurm import SlurmSSHService
from app.services.ssh_tunnel import SSHTunnelService
from app.core.logging import (
    slurm_logger,
    cluster_logger,
    log_slurm_job,
    log_cluster_operation
)
from app.core.config import settings


class JobService:
    def __init__(self, db: Session):
        self.db = db
        self.ssh_tunnel_service = SSHTunnelService(db)

    def _find_free_port(self) -> int:
        """Find a free port between 8600 and 8700"""
        used_ports = set(
            job.port for job in self.db.query(Job)
            .filter(Job.port.isnot(None))
            .all()
        )
        while True:
            port = random.randint(8600, 8700)
            if port not in used_ports:
                return port

    def _get_template_content(self, template_name: str) -> str:
        template_path = os.path.join(
            settings.TEMPLATE_DIR,
            template_name
        )
        with open(template_path, "r") as f:
            return f.read()

    def get_job(self, job_id: int) -> Optional[Job]:
        """Get a job by its ID."""
        return self.db.query(Job).filter(Job.id == job_id).first()

    def get_jobs(self, user: User) -> List[Job]:
        """Get all jobs for a user."""
        jobs = (
            self.db.query(Job)
            .filter(Job.owner_id == user.id)
            .all()
        )
        
        # Ensure script field is populated
        for job in jobs:
            if job.script is None:
                job.script = ""
                self.db.add(job)
        
        self.db.commit()
        return jobs

    def get_job_by_slurm_id(self, slurm_job_id: str) -> Optional[Job]:
        """Get a job by its SLURM job ID."""
        return self.db.query(Job).filter(Job.job_id == slurm_job_id).first()

    @staticmethod
    def get_multi_by_owner(
        db: Session,
        owner_id: int,
        skip: int = 0,
        limit: int = 100
    ) -> List[Job]:
        """Get multiple jobs for an owner with pagination."""
        slurm_logger.debug(
            f"Fetching jobs for owner {owner_id} (skip={skip}, limit={limit})"
        )
        return (
            db.query(Job)
            .filter(Job.owner_id == owner_id)
            .offset(skip)
            .limit(limit)
            .all()
        )

    @staticmethod
    def create(
        db: Session,
        job_in: JobCreate,
        user_id: int,
        job_id: str,
        script: str
    ) -> Job:
        """Create a new job record."""
        cluster_logger.debug(f"Creating new job record for user {user_id}")
        job_data = job_in.dict(exclude={'preview'})
        
        job = Job(
            **job_data,
            job_id=job_id,
            status="PENDING",
            node=None,
            owner_id=user_id,
            script=script
        )
        db.add(job)
        db.commit()
        db.refresh(job)
        
        log_cluster_operation("Job Created", {
            "job_id": str(job_id),
            "user_id": user_id,
            "status": "PENDING",
            "name": job_in.job_name
        })
        return job

    @staticmethod
    def update(db: Session, db_job: Job, job_update: JobUpdate) -> Job:
        """Update a job record."""
        update_data = job_update.dict(exclude_unset=True)
        msg = f"Updating job {str(db_job.job_id)} data: {update_data}"
        slurm_logger.debug(msg)
        
        for field, value in update_data.items():
            setattr(db_job, field, value)
        
        setattr(db_job, 'updated_at', datetime.utcnow())
        db.add(db_job)
        db.commit()
        db.refresh(db_job)
        
        log_slurm_job(str(db_job.job_id), str(db_job.status), {
            "node": str(db_job.node or "Not assigned"),
            "updated_at": db_job.updated_at.isoformat()
        })
        return db_job

    async def delete_job(self, job: Job) -> bool:
        """Delete a job and close its tunnels. Also cancels the job in SLURM if it's still running."""
        try:
            # First try to cancel the job in SLURM
            if job.job_id and job.status not in ["COMPLETED", "FAILED", "CANCELLED"]:
                slurm_service = SlurmSSHService()
                await slurm_service.cancel_job(job.job_id)

            # Close any active SSH tunnels
            tunnel_id = getattr(job, 'id', None)
            if tunnel_id is not None:
                self.ssh_tunnel_service.close_job_tunnels(int(tunnel_id))

            # Delete from database
            self.db.delete(job)
            self.db.commit()
            return True
        except Exception as e:
            cluster_logger.error(f"Error deleting job {job.job_id}: {str(e)}")
            return False

    @staticmethod
    async def monitor_job_status(
        db: Session,
        slurm_service: SlurmSSHService,
        job_id: str,
        user: User,
        initial_check_interval: int = 2
    ) -> None:
        """Asynchronously monitor the status of a SLURM job."""
        cluster_logger.debug(f"Starting job monitoring for job {job_id}")
        
        # Get job using instance method through a temporary instance
        job_service = JobService(db)
        db_job = job_service.get_job_by_slurm_id(job_id)
        
        if not db_job:
            cluster_logger.error(f"Job {job_id} not found in database")
            return
        
        check_interval = initial_check_interval
        tunnel_service = SSHTunnelService(db)
        
        while True:
            try:
                cluster_logger.debug(f"Checking status for job {job_id}")
                jobs = await slurm_service.get_active_jobs()
                
                job_info = next(
                    (j for j in jobs if j["job_id"] == job_id),
                    None
                )
                
                if job_info:
                    state = job_info["state"]
                    log_slurm_job(str(job_id), str(state), job_info)
                    
                    if str(db_job.status) != state:
                        old_status = str(db_job.status)
                        msg = f"Job {job_id}: {old_status} → {state}"
                        cluster_logger.info(msg)
                        
                        # Handle PENDING to RUNNING transition
                        if old_status == "PENDING" and state == "RUNNING":
                            node = (
                                job_info.get("node")
                                or await slurm_service.get_job_node(job_id)
                            )
                            
                            if node and node != "(None)":
                                msg = f"Job {job_id} on node: {node}"
                                cluster_logger.info(msg)
                                setattr(db_job, 'node', str(node))
                                
                                # Create SSH tunnel
                                tunnel = tunnel_service.create_tunnel(db_job)
                                if tunnel:
                                    msg = f"Created tunnel: {job_id}"
                                    cluster_logger.info(msg)
                                else:
                                    msg = f"Failed tunnel: {job_id}"
                                    cluster_logger.warning(msg)
                        
                        # Update status
                        setattr(db_job, 'status', str(state))
                        db.commit()
                        
                        # Adjust check interval
                        if state == "RUNNING" and check_interval != 20:
                            cluster_logger.info(
                                f"Job {job_id}: increase interval to 20s"
                            )
                            check_interval = 20
                        elif state in ["PENDING", "CONFIGURING"]:
                            if check_interval != 2:
                                cluster_logger.info(
                                    f"Job {job_id}: short interval"
                                )
                                check_interval = 2
                    
                else:
                    completed_states = ["COMPLETED", "FAILED", "CANCELLED"]
                    if str(db_job.status) not in completed_states:
                        msg = f"Job {job_id}: completed"
                        cluster_logger.info(msg)
                        setattr(db_job, 'status', "COMPLETED")
                        db.commit()
                        
                        # Close tunnels
                        tunnel_service.close_job_tunnels(int(db_job.id))
                    break
                        
            except Exception as e:
                msg = f"Error job {job_id}: {str(e)}"
                cluster_logger.error(msg)
            
            completed_states = ["COMPLETED", "FAILED", "CANCELLED"]
            if str(db_job.status) in completed_states:
                cluster_logger.info(
                    f"Job {job_id} done: {str(db_job.status)}"
                )
                # Close tunnels
                tunnel_service.close_job_tunnels(int(db_job.id))
                break
                
            await asyncio.sleep(check_interval)

    async def submit_job(
        self,
        job_name: str,
        template_name: str,
        num_cpus: int,
        memory_gb: int,
        num_gpus: int,
        time_limit: str,
        user: User,
    ) -> Job:
        """Submit a new job to SLURM."""
        cluster_logger.info(f"Preparing to submit new job: {job_name}")
        
        # Only assign a port, but do not create SSH tunnel yet
        port = self._find_free_port()
        
        # Generuj hasło dla VS Code
        import secrets
        import string
        password_chars = string.ascii_letters + string.digits
        password = ''.join(secrets.choice(password_chars) for _ in range(12))
        
        # Przygotowanie parametrów do wypełnienia szablonu
        slurm_service = SlurmSSHService()
        params = {
            "job_name": job_name,
            "num_cpus": num_cpus,
            "memory_gb": memory_gb,
            "num_gpus": num_gpus,
            "time_limit": time_limit,
            "port": port,
            "loggin_name": user.username,
            "loginname": user.username,  # Dla kompatybilności z różnymi szablonami
            
            # Dodatkowe parametry wymagane przez szablon
            "partition": "proxima",     # Domyślna partycja
            "num_nodes": 1,              # Domyślna liczba węzłów
            "tasks_per_node": 1,         # Domyślna liczba zadań na węzeł
            "NEW_PORT": port,            # Ten sam port dla VS Code
            "NEW_PASSWORD": password      # Wygenerowane hasło dla VS Code
        }
        
        # Wypełnienie szablonu parametrami
        script_content = await slurm_service.fill_template(template_name, params)
        
        # Wysłanie skryptu do SLURM
        job_id = await slurm_service.submit_job(script_content, user.username)
        
        if not job_id:
            cluster_logger.error("Failed to get job ID from SLURM submission")
            raise HTTPException(status_code=500, detail="Failed to submit job to SLURM")
        
        # Utworzenie i zapisanie rekordu zadania
        db_job = Job(
            job_id=job_id,
            job_name=job_name,
            template_name=template_name,
            num_cpus=num_cpus,
            memory_gb=memory_gb,
            num_gpus=num_gpus,
            time_limit=time_limit,
            owner=user,
            port=port,
            status="PENDING",
            partition="proxima",  # Domyślna partycja
            password=password      # Zapisz hasło do późniejszego użycia
        )
        self.db.add(db_job)
        self.db.commit()
        self.db.refresh(db_job)
        
        log_cluster_operation("Job Submitted", {
            "job_id": job_id,
            "user_id": user.id,
            "job_name": job_name,
            "template": template_name
        })
        
        return db_job

    async def update_job_status(self, job_id: str, new_status: str):
        """Update job status and handle status changes."""
        db_job = self.db.query(Job).filter(Job.job_id == job_id).first()
        if not db_job:
            return
            
        old_status = str(db_job.status)
        setattr(db_job, 'status', str(new_status))
        
        # Nie tworzymy tunelu SSH tutaj - to będzie robione automatycznie przez monitor
        self.db.commit()

    def create_job(self, job_data: JobCreate, user: User) -> Job:
        """Create a new job in the database."""
        cluster_logger.debug(f"Creating job record for {user.username}: {job_data.job_name}")
        
        # Przydzielenie portu
        port = self._find_free_port()
        
        # Create job object
        db_job = Job(
            job_name=job_data.job_name,
            template_name=job_data.template_name,
            num_cpus=job_data.num_cpus,
            memory_gb=job_data.memory_gb,
            num_gpus=job_data.num_gpus,
            time_limit=job_data.time_limit,
            owner=user,
            port=port,
            status="PENDING",
            partition=job_data.partition if hasattr(job_data, "partition") else "proxima"
        )
        
        self.db.add(db_job)
        self.db.commit()
        self.db.refresh(db_job)
        
        return db_job

    @staticmethod
    def get(db: Session, job_id: int) -> Optional[Job]:
        """Get a job by its database ID."""
        return db.query(Job).filter(Job.id == job_id).first()