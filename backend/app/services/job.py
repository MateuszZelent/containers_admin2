from typing import List, Optional
import os
import random
import socket
import asyncio
import re
import glob
from datetime import datetime, timedelta
import asyncssh

from sqlalchemy.orm import Session
from fastapi import HTTPException

from app.db.models import Job, User
from app.schemas.job import JobCreate, JobUpdate
from app.services.slurm import SlurmSSHService
from app.services.ssh_tunnel import SSHTunnelService
from app.services.caddy_api import CaddyAPIClient
from app.core.logging import (
    slurm_logger,
    cluster_logger,
    log_slurm_job,
    log_cluster_operation,
)
from app.core.config import settings


class JobService:
    def __init__(self, db: Session):
        self.db = db
        self.ssh_tunnel_service = SSHTunnelService(db)

    @staticmethod
    def sanitize_container_name_for_domain(container_name: str) -> str:
        """
        Sanitize container name to be domain-safe.
        Converts underscores and other invalid characters to hyphens.
        """
        if not container_name:
            return ""

        # Convert to lowercase and replace invalid domain characters
        # Valid domain characters: a-z, 0-9, and hyphens
        # Convert underscores to hyphens since they're not allowed in domains
        sanitized = container_name.lower()
        sanitized = re.sub(r"[^a-zA-Z0-9\-]", "-", sanitized)

        # Replace multiple consecutive hyphens with single hyphen
        sanitized = re.sub(r"-+", "-", sanitized)

        # Remove leading/trailing hyphens
        sanitized = sanitized.strip("-")

        return sanitized

    def _find_free_port(self) -> int:
        """Find a free port between 8600 and 8700 from active jobs only"""
        
        # Only check ports from ACTIVE jobs (PENDING, RUNNING, CONFIGURING)
        used_ports = set(
            job.port for job in self.db.query(Job)
            .filter(Job.port.isnot(None))
            .filter(Job.status.in_(["PENDING", "RUNNING", "CONFIGURING"]))
            .all()
        )
        
        max_attempts = 3  # Prevent infinite loop
        attempts = 0
        
        while attempts < max_attempts:
            attempts += 1
            port = random.randint(8600, 8700)
            
            # Skip if port is registered in active jobs
            if port in used_ports:
                continue
                
            # Check if port is actually free in the system
            try:
                with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                    s.settimeout(1)
                    result = s.connect_ex(('127.0.0.1', port))
                    if result == 0:
                        # Port is in use by some process
                        continue
                    
                # Port is free - return it
                return port
                
            except Exception:
                # If we can't check the port, skip it
                continue
        
        # If we couldn't find a free port, raise an exception
        raise HTTPException(
            status_code=500,
            detail=f"Could not find a free port after {max_attempts} attempts. "
                   f"All ports between 8600-8700 seem to be in use."
        )

    def _get_template_content(self, template_name: str) -> str:
        template_path = os.path.join(settings.TEMPLATE_DIR, template_name)
        with open(template_path, "r") as f:
            return f.read()

    def get_job(self, job_id: int) -> Optional[Job]:
        """Get a job by its ID."""
        return self.db.query(Job).filter(Job.id == job_id).first()

    def get_jobs(self, user: User) -> List[Job]:
        """Get all jobs for a user."""
        jobs = self.db.query(Job).filter(Job.owner_id == user.id).all()

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
        db: Session, owner_id: int, skip: int = 0, limit: int = 100
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
        db: Session, job_in: JobCreate, user_id: int, job_id: str, script: str
    ) -> Job:
        """Create a new job record."""
        cluster_logger.debug(f"Creating new job record for user {user_id}")
        job_data = job_in.dict(exclude={"preview"})

        job = Job(
            **job_data,
            job_id=job_id,
            status="PENDING",
            node=None,
            owner_id=user_id,
            script=script,
        )
        db.add(job)
        db.commit()
        db.refresh(job)

        log_cluster_operation(
            "Job Created",
            {
                "job_id": str(job_id),
                "user_id": user_id,
                "status": "PENDING",
                "name": job_in.job_name,
            },
        )
        return job

    @staticmethod
    def update(db: Session, db_job: Job, job_update: JobUpdate) -> Job:
        """Update a job record."""
        update_data = job_update.dict(exclude_unset=True)
        msg = f"Updating job {str(db_job.job_id)} data: {update_data}"
        slurm_logger.debug(msg)

        for field, value in update_data.items():
            setattr(db_job, field, value)

        setattr(db_job, "updated_at", datetime.utcnow())
        db.add(db_job)
        db.commit()
        db.refresh(db_job)

        log_slurm_job(
            str(db_job.job_id),
            str(db_job.status),
            {
                "node": str(db_job.node or "Not assigned"),
                "updated_at": db_job.updated_at.isoformat(),
            },
        )
        return db_job

    async def delete_job(self, job: Job) -> bool:
        """Delete job, cancel in SLURM, cleanup tunnels and Caddy config."""
        try:
            # First try to cancel the job in SLURM
            if job.job_id and job.status not in ["COMPLETED", "FAILED", "CANCELLED"]:
                try:
                    slurm_service = SlurmSSHService()
                    await slurm_service.cancel_job(job.job_id)
                except Exception as e:
                    # Handle SLURM cancel errors - it may not exist anymore
                    # This allows deleting from the database even if SLURM fails
                    err = str(e).replace("[", "«").replace("]", "»")
                    cluster_logger.warning(f"Could not cancel job in SLURM: {err}")

            # Clean up Caddy configuration
            try:
                self._cleanup_caddy_for_job(job)
            except Exception as e:
                # Handle Caddy cleanup errors
                err = str(e).replace("[", "«").replace("]", "»")
                cluster_logger.warning(f"Error during Caddy cleanup: {err}")

            # Close any active SSH tunnels
            tunnel_id = getattr(job, "id", None)
            if tunnel_id is not None:
                try:
                    await self.ssh_tunnel_service.close_job_tunnels(int(tunnel_id))
                except Exception as e:
                    # Handle tunnel closing errors
                    err = str(e).replace("[", "«").replace("]", "»")
                    cluster_logger.warning(f"Error closing tunnels: {err}")

            # Delete from database
            self.db.delete(job)
            self.db.commit()
            return True
        except Exception as e:
            # Use safe formatting to avoid Rich markup errors
            job_id_val = getattr(job, "job_id", "unknown")
            err_msg = str(e).replace("[", "«").replace("]", "»")
            cluster_logger.error(f"Error deleting job {job_id_val}: {err_msg}")
            return False

    @staticmethod
    async def monitor_job_status(
        db: Session,
        slurm_service: SlurmSSHService,
        job_id: str,
        user: User,
        initial_check_interval: int = 2,
        max_monitoring_time: int = 86400,  # 24 hours max monitoring time
    ) -> None:
        """Asynchronously monitor the status of a SLURM job."""
        cluster_logger.debug(f"Starting job monitoring for job {job_id}")
        
        monitoring_start_time = datetime.now()
        max_monitoring_duration = timedelta(seconds=max_monitoring_time)

        # Ensure we start with a clean database session
        try:
            db.rollback()  # Clear any pending transactions
        except Exception:
            pass  # Ignore any error from rollback
            
        # Get job using instance method through a temporary instance
        job_service = JobService(db)
        db_job = job_service.get_job_by_slurm_id(job_id)

        if not db_job:
            cluster_logger.error(f"Job {job_id} not found in database")
            return

        check_interval = initial_check_interval
        tunnel_service = SSHTunnelService(db)
        
        # Add counters for retry limits
        connection_attempts = 0
        max_connection_attempts = 10  # Increased from 3 for better resilience
        ssh_failure_count = 0
        max_ssh_failures = 8  # Increased from 5 for better resilience
        consecutive_not_found = 0
        max_consecutive_not_found = 3  # Stop if job not found 3 times in a row

        try:
            while True:
                # Check maximum monitoring time
                if datetime.now() - monitoring_start_time > max_monitoring_duration:
                    cluster_logger.warning(
                        f"Maximum monitoring time ({max_monitoring_time}s) exceeded for job {job_id}, stopping"
                    )
                    break
                
                # Check if we've exceeded our retry limits
                if connection_attempts >= max_connection_attempts:
                    cluster_logger.warning(
                        f"Exceeded max connection attempts ({max_connection_attempts}) "
                        f"for job {job_id}, stopping monitoring"
                    )
                    break
                    
                if ssh_failure_count >= max_ssh_failures:
                    cluster_logger.warning(
                        f"Exceeded max SSH failures ({max_ssh_failures}) "
                        f"for job {job_id}, stopping monitoring"
                    )
                    break
                
                if consecutive_not_found >= max_consecutive_not_found:
                    cluster_logger.info(
                        f"Job {job_id} not found in SLURM {max_consecutive_not_found} times, "
                        f"assuming completed, stopping monitoring"
                    )
                    break
                
                connection_attempts += 1
                cluster_logger.debug(
                    f"Checking status for job {job_id} (attempt {connection_attempts})"
                )
                
                # Refresh job from database to check if it still exists
                db.expire(db_job)
                db_job = job_service.get_job_by_slurm_id(job_id)
                if not db_job:
                    cluster_logger.warning(f"Job {job_id} no longer exists in database, stopping monitoring")
                    break
                
                # Check if job is already in a final state
                current_status = str(db_job.status)
                completed_states = ["COMPLETED", "FAILED", "CANCELLED"]
                if current_status in completed_states:
                    cluster_logger.info(f"Job {job_id} already in final state: {current_status}, stopping monitoring")
                    break
                
                jobs = await slurm_service.get_active_jobs()
                job_info = next((j for j in jobs if j["job_id"] == job_id), None)

                if job_info:
                    # Reset counters on success
                    connection_attempts = 0
                    ssh_failure_count = 0
                    consecutive_not_found = 0
                    
                    state = job_info["state"]
                    log_slurm_job(str(job_id), str(state), job_info)

                    # Map SLURM state to full status name
                    from app.services.task_queue import TaskQueueService
                    
                    mapped_status_enum = TaskQueueService.SLURM_STATE_MAPPING.get(
                        state, "UNKNOWN"
                    )
                    # Convert enum to string for database storage
                    if hasattr(mapped_status_enum, 'value'):
                        mapped_status = mapped_status_enum.value
                    else:
                        mapped_status = str(mapped_status_enum)

                    if str(db_job.status) != mapped_status:
                        old_status = str(db_job.status)
                        msg = f"Job {job_id}: {old_status} → {mapped_status}"
                        cluster_logger.info(msg)

                        # Handle PENDING to RUNNING transition
                        if old_status == "PENDING" and mapped_status == "RUNNING":
                            node = job_info.get(
                                "node"
                            ) or await slurm_service.get_job_node(job_id)

                            if node and node != "(None)":
                                msg = f"Job {job_id} on node: {node}"
                                cluster_logger.info(msg)
                                setattr(db_job, "node", str(node))

                                # Create SSH tunnel
                                tunnel = await tunnel_service.create_tunnel(db_job)
                                if tunnel:
                                    msg = f"Created tunnel: {job_id}"
                                    cluster_logger.info(msg)
                                else:
                                    msg = f"Failed tunnel: {job_id}"
                                    cluster_logger.warning(msg)

                        # Update status
                        setattr(db_job, "status", mapped_status)
                        db.commit()

                        # Check if this is a final state - if so, stop monitoring
                        if mapped_status in completed_states:
                            cluster_logger.info(f"Job {job_id} reached final state: {mapped_status}, stopping monitoring")
                            # Close tunnels and cleanup
                            try:
                                await tunnel_service.close_job_tunnels(int(db_job.id))
                            except Exception as e:
                                err = str(e).replace("[", "«").replace("]", "»")
                                cluster_logger.warning(f"Error closing tunnels for job {job_id}: {err}")
                            job_service._cleanup_caddy_for_job(db_job)
                            break

                        # Adjust check interval
                        if mapped_status == "RUNNING" and check_interval != 20:
                            cluster_logger.info(
                                f"Job {job_id}: increase interval to 20s"
                            )
                            check_interval = 20
                        elif mapped_status in ["PENDING", "CONFIGURING"]:
                            if check_interval != 2:
                                cluster_logger.info(f"Job {job_id}: short interval")
                                check_interval = 2

                else:
                    # Job not found in SLURM active jobs
                    consecutive_not_found += 1
                    cluster_logger.debug(f"Job {job_id} not found in active jobs (count: {consecutive_not_found})")
                    
                    # If job was not found multiple times, assume it's completed
                    if consecutive_not_found >= max_consecutive_not_found:
                        completed_states = ["COMPLETED", "FAILED", "CANCELLED"]
                        if str(db_job.status) not in completed_states:
                            msg = f"Job {job_id}: marking as completed (not found in SLURM)"
                            cluster_logger.info(msg)
                            
                            # Check if job still exists in DB before updating
                            try:
                                # Refresh the job from database to ensure it's still there
                                job_check = db.query(Job).filter(Job.job_id == job_id).first()
                                if job_check:
                                    setattr(db_job, "status", "COMPLETED")
                                    db.commit()
                                    
                                    # Close tunnels and cleanup Caddy
                                    try:
                                        await tunnel_service.close_job_tunnels(int(db_job.id))
                                    except Exception as e:
                                        err = str(e).replace("[", "«").replace("]", "»")
                                        cluster_logger.warning(
                                            f"Error closing tunnels for job {job_id}: {err}"
                                        )
                                    job_service._cleanup_caddy_for_job(db_job)
                                else:
                                    cluster_logger.warning(
                                        f"Job {job_id} no longer exists in database"
                                    )
                                    db.rollback()  # Rollback any pending changes
                            except Exception as db_err:
                                cluster_logger.error(
                                    f"Database error checking job {job_id}: {str(db_err)}"
                                )
                                db.rollback()  # Always rollback on error
                        # Will break in next iteration due to consecutive_not_found limit
                        
                await asyncio.sleep(check_interval)

        except asyncssh.Error as ssh_err:
            ssh_failure_count += 1
            msg = f"SSH error job {job_id}: {str(ssh_err)}"
            cluster_logger.error(msg)
        except Exception as e:
            msg = f"Error monitoring job {job_id}: {str(e)}"
            cluster_logger.error(msg)
        finally:
            # Ensure cleanup happens even if there are errors
            try:
                # Final check of job status
                db.expire(db_job)
                final_job = job_service.get_job_by_slurm_id(job_id)
                if final_job:
                    final_status = str(final_job.status)
                    completed_states = ["COMPLETED", "FAILED", "CANCELLED"]
                    if final_status in completed_states:
                        cluster_logger.info(f"Job {job_id} monitoring ended, final status: {final_status}")
                        # Final cleanup
                        try:
                            await tunnel_service.close_job_tunnels(int(final_job.id))
                        except Exception:
                            pass
                        try:
                            job_service._cleanup_caddy_for_job(final_job)
                        except Exception:
                            pass
                    else:
                        cluster_logger.warning(f"Job {job_id} monitoring ended but job not in final state: {final_status}")
            except Exception as final_err:
                cluster_logger.error(f"Error in final cleanup for job {job_id}: {str(final_err)}")
            
            cluster_logger.info(f"Job monitoring for {job_id} stopped")

    def has_container_with_name(self, user: User, container_name: str) -> bool:
        """Check if user already has an ACTIVE container with the given name."""
        # The job_name pattern is: container_{username}_{container_name}
        expected_job_name = f"container_{user.username}_{container_name}"

        # Only check for ACTIVE jobs (PENDING, RUNNING, CONFIGURING)
        # Completed/Failed/Cancelled jobs should not block new containers
        existing_job = (
            self.db.query(Job)
            .filter(Job.owner_id == user.id)
            .filter(Job.job_name == expected_job_name)
            .filter(Job.status.in_(["PENDING", "RUNNING", "CONFIGURING"]))
            .first()
        )

        return existing_job is not None

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

        # Extract container name from job_name
        # (format: container_{username}_{container_name})
        container_name = job_name.replace(f"container_{user.username}_", "", 1)

        # Check if user already has a container with this name
        if self.has_container_with_name(user, container_name):
            error_msg = (
                f"A container with the name '{container_name}' already "
                "exists. Please choose a different name."
            )
            raise HTTPException(status_code=400, detail=error_msg)

        # Only assign a port, but do not create SSH tunnel yet
        port = self._find_free_port()

        # Generuj hasło dla VS Code
        if user and user.code_server_password:
            password = user.code_server_password
        else:
            # Default or placeholder password
            password = "defaultpassword"

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
            "loginname": user.username,  # Dla kompatybilności
            # Dodatkowe parametry wymagane przez szablon
            "partition": "proxima",  # Domyślna partycja
            "num_nodes": 1,  # Domyślna liczba węzłów
            "tasks_per_node": 1,  # Domyślna liczba zadań na węzeł
            "NEW_PORT": port,  # Ten sam port dla VS Code
            "NEW_PASSWORD": password,  # Wygenerowane hasło dla VS Code
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
            password=password,  # Zapisz hasło do późniejszego użycia
        )
        self.db.add(db_job)
        self.db.commit()
        self.db.refresh(db_job)

        log_cluster_operation(
            "Job Submitted",
            {
                "job_id": job_id,
                "user_id": user.id,
                "job_name": job_name,
                "template": template_name,
            },
        )

        return db_job

    async def update_job_status(self, job_id: str, new_status: str):
        """Update job status and handle status changes."""
        db_job = self.db.query(Job).filter(Job.job_id == job_id).first()
        if not db_job:
            return

        setattr(db_job, "status", str(new_status))

        # SSH tunnel będzie tworzony automatycznie przez monitor
        self.db.commit()

    def create_job(self, job_data: JobCreate, user: User) -> Job:
        """Create a new job in the database."""
        cluster_logger.debug(
            f"Creating job record for {user.username}: {job_data.job_name}"
        )

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
            partition=job_data.partition
            if hasattr(job_data, "partition")
            else "proxima",
        )

        self.db.add(db_job)
        self.db.commit()
        self.db.refresh(db_job)

        return db_job

    @staticmethod
    def get(db: Session, job_id: int) -> Optional[Job]:
        """Get a job by its database ID."""
        return db.query(Job).filter(Job.id == job_id).first()

    def _cleanup_caddy_for_job(self, job: Job) -> bool:
        """Helper method to clean up Caddy configuration for a job."""
        try:
            if not job.job_name or not job.owner:
                return False

            # Extract container name from job_name for Caddy cleanup
            container_name = job.job_name.replace(
                f"container_{job.owner.username}_", "", 1
            )

            # Sanitize container name for domain using centralized method
            safe_container_name = self.sanitize_container_name_for_domain(
                container_name
            )
            if not safe_container_name:
                safe_container_name = f"job{job.id}"

            # Generate domain using consistent pattern
            domain = f"{job.owner.username}-{safe_container_name}.orion.zfns.eu.org"

            # Remove domain from Caddy
            caddy_api_url = os.getenv(
                "CADDY_API_URL", "http://host.docker.internal:2020"
            )
            caddy_client = CaddyAPIClient(caddy_api_url)
            caddy_success = caddy_client.remove_domain(domain)

            if caddy_success:
                cluster_logger.info(f"Cleaned up Caddy domain {domain}")
            else:
                cluster_logger.warning(f"Failed to cleanup Caddy domain {domain}")

            return caddy_success
        except Exception as e:
            cluster_logger.error(f"Error cleaning up Caddy for job {job.id}: {str(e)}")
            return False

    def _find_log_file(self, job_id: str, log_type: str = "out") -> Optional[str]:
        """Find log file for a job based on job_id and log type."""
        
        # Base paths for logs and errors
        logs_base_path = "/mnt/storage_3/home/kkingstoun/pl0095-01/scratch/zelent/amucontainers"
        
        if log_type == "out":
            search_path = f"{logs_base_path}/logs"
        elif log_type == "err":
            search_path = f"{logs_base_path}/errors"
        else:
            return None
            
        # Search for files containing the job_id in the filename
        # Pattern: *{job_id}*.{log_type}
        pattern = f"{search_path}/*{job_id}*.{log_type}"
        
        try:
            matching_files = glob.glob(pattern)
            if matching_files:
                # Return the first match (there should be only one)
                return matching_files[0]
            return None
        except Exception as e:
            cluster_logger.error(f"Error searching for log file {pattern}: {str(e)}")
            return None

    def get_job_log(self, job_id: str, log_type: str = "out") -> Optional[str]:
        """Get log content for a job."""
        log_file_path = self._find_log_file(job_id, log_type)
        
        if not log_file_path:
            cluster_logger.warning(f"Log file not found for job {job_id} (type: {log_type})")
            return None
            
        try:
            with open(log_file_path, 'r', encoding='utf-8') as f:
                content = f.read()
            return content
        except FileNotFoundError:
            cluster_logger.warning(f"Log file not found: {log_file_path}")
            return None
        except PermissionError:
            cluster_logger.error(f"Permission denied reading log file: {log_file_path}")
            return None
        except UnicodeDecodeError:
            # Try with different encoding if UTF-8 fails
            try:
                with open(log_file_path, 'r', encoding='latin-1') as f:
                    content = f.read()
                return content
            except Exception as e:
                cluster_logger.error(f"Error reading log file with fallback encoding: {str(e)}")
                return None
        except Exception as e:
            cluster_logger.error(f"Error reading log file {log_file_path}: {str(e)}")
            return None

    def get_job_error(self, job_id: str) -> Optional[str]:
        """Get error log content for a job."""
        return self.get_job_log(job_id, "err")

    def update_domain_ready_status(self, job_id: int, ready: bool = True) -> bool:
        """Update the domain_ready status for a job."""
        try:
            job = self.db.query(Job).filter(Job.id == job_id).first()
            if not job:
                cluster_logger.error(f"Job with ID {job_id} not found")
                return False
            
            job.domain_ready = ready
            self.db.commit()
            self.db.refresh(job)
            
            cluster_logger.info(f"Domain ready status updated for job {job_id}: {ready}")
            return True
            
        except Exception as e:
            cluster_logger.error(f"Error updating domain ready status for job {job_id}: {str(e)}")
            self.db.rollback()
            return False
    
    def is_domain_ready(self, job_id: int) -> bool:
        """Check if domain is ready for a job."""
        try:
            job = self.db.query(Job).filter(Job.id == job_id).first()
            if not job:
                return False
            return job.domain_ready
        except Exception as e:
            cluster_logger.error(f"Error checking domain ready status for job {job_id}: {str(e)}")
            return False
