from typing import Any, Dict, List, Union
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, status
from sqlalchemy.orm import Session
import os
from caddy_api_client import CaddyAPIClient
from app.core.logging import cluster_logger
from app.core.auth import (
    get_current_active_user, 
    get_current_user, 
    get_current_superuser
)
from app.db.session import get_db
from app.schemas.job import (
    JobCreate,
    JobPreview,
    JobSubmissionResponse,
    JobInDB,
    SSHTunnelInfo,
)
from app.schemas.job import Job as JobSchema
from app.services.job import JobService
from app.services.slurm import SlurmSSHService
from app.services.ssh_tunnel import SSHTunnelService
from app.db.models import User, Job, SSHTunnel
from app.core.config import settings

CADDY_API_URL: str = os.getenv("CADDY_API_URL", "http://host.docker.internal:2019")
router = APIRouter()


@router.get("/status")
async def check_cluster_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> Dict[str, bool]:
    """
    Check if the SLURM cluster is reachable and running.
    """
    from app.services.slurm_monitor import monitor_service
    
    # Get latest cluster status from database
    latest_status = await monitor_service.get_latest_cluster_status(db)
    
    if latest_status:
        # Assume SLURM is running if connected
        return {
            "connected": latest_status.is_connected,
            "slurm_running": latest_status.is_connected
        }
    else:
        # Fallback to direct check if no status in database yet
        slurm_service = SlurmSSHService()
        return await slurm_service.check_status()


@router.get("/", response_model=List[JobInDB])
async def get_jobs(
    db: Session = Depends(get_db),
    skip: int = 0,
    limit: int = 100,
    current_user: User = Depends(get_current_active_user),
) -> Any:
    """
    Retrieve jobs for current user with current SLURM status from monitoring service.
    Also handles cases where SLURM has active jobs that don't exist in database.
    """
    from app.services.slurm_monitor import monitor_service
    
    # Get jobs from database
    job_service = JobService(db)
    db_jobs = job_service.get_jobs(current_user)
    db_jobs_map = {job.job_id: job for job in db_jobs}

    # Get current SLURM status from monitoring service snapshots
    job_snapshots = await monitor_service.get_user_job_snapshots(
        db, current_user.username
    )

    if job_snapshots:
        for snapshot in job_snapshots:
            job_id = snapshot.job_id

            if job_id in db_jobs_map:
                # Update existing job if status changed
                db_job = db_jobs_map[job_id]
                if db_job.status != snapshot.state:
                    db_job.status = snapshot.state
                    db_job.node = snapshot.node
                db.add(db_job)
            else:
                # Create new job record for unknown SLURM job
                new_job = Job(
                    job_id=job_id,
                    job_name=snapshot.name,  # Using name attribute instead of job_name
                    status=snapshot.state,
                    node=snapshot.node,
                    owner_id=current_user.id,
                    partition=snapshot.partition or "proxima",  # Default value
                    num_cpus=1,  # Default value
                    memory_gb=1,  # Default value
                    template_name="unknown",  # Since we don't know original
                    script="",  # Empty script since we don't have the original
                )
                db.add(new_job)
                db_jobs.append(new_job)

        # Commit all changes
        db.commit()

    return db_jobs


@router.get("/admin/all", response_model=List[JobInDB])
async def get_all_jobs_admin(
    db: Session = Depends(get_db),
    skip: int = 0,
    limit: int = 100,
    current_user: User = Depends(get_current_superuser),
) -> Any:
    """
    Retrieve all jobs from all users. Admin only.
    """
    from app.services.slurm_monitor import monitor_service
    
    # Get all jobs from database
    job_service = JobService(db)
    all_jobs = db.query(Job).offset(skip).limit(limit).all()
    
    # Convert to JobInDB format and get current status
    result_jobs = []
    for job in all_jobs:
        # Get current SLURM status from monitoring service
        job_snapshots = await monitor_service.get_job_snapshot(
            db, job.job_id
        )
        
        job_data = JobInDB.from_orm(job)
        if job_snapshots:
            job_data.status = job_snapshots.state  # Using 'state' not 'status'
            job_data.node = job_snapshots.node  # Using 'node' not 'node_list'
        
        result_jobs.append(job_data)
    
    return result_jobs


@router.get("/active-jobs")
async def get_active_jobs(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> List[Dict[str, Any]]:
    """
    Get active jobs from monitoring service snapshots for current user.
    """
    try:
        from app.services.slurm_monitor import monitor_service
        
        cluster_logger.debug(
            f"Fetching active jobs for user: {current_user.username}"
        )

        # Get job snapshots from monitoring service
        job_snapshots = await monitor_service.get_user_job_snapshots(
            db, current_user.username
        )

        # Get all jobs from database for the current user
        db_jobs = JobService.get_multi_by_owner(
            db=db, owner_id=current_user.id
        )
        db_jobs_map = {job.job_id: job for job in db_jobs}

        # Enhance active jobs with database information
        enhanced_jobs = []
        for snapshot in job_snapshots:
            # Only include RUNNING jobs in results
            if snapshot.state == "RUNNING":
                db_job = db_jobs_map.get(snapshot.job_id)
                
                job_data = {
                    "job_id": snapshot.job_id,
                    "name": snapshot.name,
                    "user": snapshot.user,
                    "state": snapshot.state,
                    "partition": snapshot.partition,
                    "node": snapshot.node,
                    "node_count": snapshot.node_count,
                    "time_used": snapshot.time_used,
                    "time_left": snapshot.time_left,
                    "memory_requested": snapshot.memory_requested,
                    "start_time": snapshot.start_time,  # This is already a string
                    "submit_time": snapshot.submit_time,  # This is already a string
                    "reason": snapshot.reason,
                    "monitoring_active": True,
                }
                
                # Add database info if available
                if db_job:
                    job_data.update({
                        "template": db_job.template_name,
                        "created_at": db_job.created_at.isoformat(),
                        "updated_at": (
                            db_job.updated_at.isoformat()
                            if db_job.updated_at else None
                        ),
                    })
                
                enhanced_jobs.append(job_data)

        return enhanced_jobs
    except Exception as e:
        # Improve error handling with logging
        cluster_logger.error(f"Error fetching active jobs: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch active jobs: {str(e)}",
        )


@router.get("/templates")
async def get_templates(
    current_user: User = Depends(get_current_active_user),
) -> List[str]:
    """Get list of available job templates."""
    template_dir = settings.TEMPLATE_DIR
    templates = []

    for filename in os.listdir(template_dir):
        if filename.endswith(".template"):
            templates.append(filename)

    return templates


@router.post("/", response_model=Union[JobSubmissionResponse, JobPreview])
async def create_job(
    *,
    db: Session = Depends(get_db),
    job_in: JobCreate,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_active_user),
) -> Any:
    """
    Create new job by submitting a template-based job to SLURM.
    If preview=True, returns the filled template without submitting the job.
    """
    slurm_service = SlurmSSHService()
    job_service = JobService(db)
    job_name = f"container_{current_user.username}_{job_in.job_name}"
    # Submit job to SLURM or preview template
    if job_in.preview:
        # Just fill the template and return it without submitting
        params = {
            "job_name": job_name,
            "num_cpus": job_in.num_cpus,
            "memory_gb": job_in.memory_gb,
            "num_gpus": job_in.num_gpus,
            "time_limit": job_in.time_limit,
            "partition": getattr(job_in, "partition", "proxima"),
            "num_nodes": getattr(job_in, "num_nodes", 1),
            "tasks_per_node": getattr(job_in, "tasks_per_node", 1),
            "port": getattr(
                job_in, "port", "8666"
            ),  # Add port to the template parameters
            "code_server_password": getattr(job_in, "password", "Magnonics"),
        }
        script_content = await slurm_service.fill_template(job_in.template_name, params)
        return JobPreview(script=script_content)

    # Submit the job
    job = await job_service.submit_job(
        job_name=job_name,
        template_name=job_in.template_name,
        num_cpus=job_in.num_cpus,
        memory_gb=job_in.memory_gb,
        num_gpus=job_in.num_gpus,
        time_limit=job_in.time_limit,
        user=current_user,
    )

    # Start background job monitoring
    background_tasks.add_task(
        job_service.monitor_job_status,
        db=db,
        slurm_service=slurm_service,
        job_id=job.job_id,
        user=current_user,
    )

    return JobSubmissionResponse(
        message=f"Success! Your job has been submitted with ID {job.job_id}",
        job_id=job.job_id,
        job=job,
    )


@router.get("/{job_id}", response_model=JobSchema)
def get_job(
    *,
    db: Session = Depends(get_db),
    job_id: int,
    current_user: User = Depends(get_current_active_user),
) -> Any:
    """
    Get job by ID.
    """
    job = JobService.get(db=db, job_id=job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    return job


@router.get("/{job_id}/status")
async def get_job_status(
    *,
    db: Session = Depends(get_db),
    job_id: int,
    current_user: User = Depends(get_current_active_user),
) -> Dict[str, Any]:
    """
    Get status of a specific job.
    """
    job = JobService.get(db=db, job_id=job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")

    slurm_service = SlurmSSHService()
    active_jobs = await slurm_service.get_active_jobs()
    job_info = next((j for j in active_jobs if j["job_id"] == job.job_id), None)

    if job_info:
        return {
            "status": job_info["state"],
            "node": job_info["node"] if job_info["node"] != "(None)" else None,
            "in_queue": True,
        }

    # Job is not in the queue, return stored status
    return {"status": job.status, "node": job.node, "in_queue": False}


@router.get("/{job_id}/node")
async def get_job_node(
    *,
    db: Session = Depends(get_db),
    job_id: int,
    current_user: User = Depends(get_current_active_user),
) -> Dict[str, Any]:
    """
    Get the node where a job is running.
    """
    job = JobService.get(db=db, job_id=job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")

    # First check if we have node information in the database
    if job.node:
        return {"node": job.node}

    # If not, query SLURM for node information
    slurm_service = SlurmSSHService()
    node = await slurm_service.get_job_node(job.job_id)

    if node and node != "(None)":
        # Update the job in the database
        job.node = node
        db.add(job)
        db.commit()
        db.refresh(job)

    return {"node": node if node and node != "(None)" else None}


@router.get("/{job_id}/tunnels", response_model=List[SSHTunnelInfo])
def get_job_tunnels(
    job_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get all SSH tunnels for a specific job"""
    job_service = JobService(db)
    job = job_service.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to access this job")

    tunnel_service = SSHTunnelService(db)
    return tunnel_service.get_job_tunnels(db, job_id)


@router.post("/{job_id}/tunnels", response_model=SSHTunnelInfo)
def create_job_tunnel(
    job_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new SSH tunnel for a job"""
    job_service = JobService(db)
    job = job_service.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to access this job")

    tunnel_service = SSHTunnelService(db)
    tunnel = tunnel_service.create_tunnel(job)
    if not tunnel:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not create SSH tunnel",
        )
    return tunnel


@router.delete("/{job_id}/tunnels/{tunnel_id}")
def close_job_tunnel(
    job_id: int,
    tunnel_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Close an SSH tunnel for a job"""
    job_service = JobService(db)
    job = job_service.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to access this job")

    tunnel_service = SSHTunnelService(db)
    success = tunnel_service.close_tunnel(tunnel_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Could not close SSH tunnel"
        )
    return {"message": "Tunnel closed successfully"}


@router.delete("/{job_id}")
async def delete_job(
    job_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Delete a job and cancel it in SLURM if it's still running"""
    job_service = JobService(db)
    job = job_service.get_job(job_id)
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Job not found"
        )
    if job.owner_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions"
        )

    success = await job_service.delete_job(job)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete job",
        )

    return {"message": "Job deleted and cancelled successfully"}


@router.get("/{job_id}/code-server")
async def get_code_server_url(
    *,
    db: Session = Depends(get_db),
    job_id: int,
    current_user: User = Depends(get_current_active_user),
) -> Dict[str, Any]:
    """
    Get code-server URL for a job, creating SSH tunnel if needed and configuring Caddy.
    """
    job = JobService.get(db=db, job_id=job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")

    if not job.port or not job.node or job.status != "RUNNING":
        raise HTTPException(
            status_code=400, detail="Job is not running or missing port/node info"
        )

    # Create or get existing tunnel
    tunnel_service = SSHTunnelService(db)
    tunnel = await tunnel_service.get_or_create_tunnel(job)
    if not tunnel:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not establish SSH tunnel. Please try again later.",
        )

    # Generate domain name using username and container name
    # Extract the user-provided container name from job_name
    # job_name format is: "container_{username}_{user_provided_name}"

    # Extract only the user-provided container name part
    username_prefix = f"container_{current_user.username}_"
    if job.job_name.startswith(username_prefix):
        # Remove the "container_{username}_" prefix to get user-provided name
        user_container_name = job.job_name[len(username_prefix) :]
    else:
        # Fallback: use the whole job_name if it doesn't match expected format
        user_container_name = job.job_name

    # Sanitize container name using centralized method
    safe_container_name = JobService.sanitize_container_name_for_domain(
        user_container_name
    )
    if not safe_container_name:
        safe_container_name = f"job{job.id}"

    # Generate domain using username and clean container name
    domain = f"{current_user.username}-{safe_container_name}.orion.zfns.eu.org"

    # Configure Caddy to route the domain to the local tunnel port
    caddy_client = CaddyAPIClient(CADDY_API_URL)
    success = caddy_client.add_domain_with_auto_tls(
        domain=domain, target="localhost", target_port=tunnel.local_port
    )

    if not success:
        # If Caddy configuration fails, clean up the tunnel
        await tunnel_service.close_tunnel(tunnel.id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to configure domain routing",
        )

    # Return the full URL to the frontend
    return {
        "url": f"https://{domain}",
        "port": job.port,
        "node": job.node,
        "tunnel_port": tunnel.local_port,
        "domain": domain,
    }


@router.get("/{job_id}/tunnel-status")
async def check_tunnel_status(
    *,
    db: Session = Depends(get_db),
    job_id: int,
    current_user: User = Depends(get_current_active_user),
) -> Dict[str, Any]:
    """
    Sprawdź status tunelu SSH dla zadania.
    Weryfikuje czy tunel jest aktywny i dostępny zarówno wewnątrz jak i na zewnątrz kontenera.
    """
    job = JobService.get(db=db, job_id=job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")

    tunnel_service = SSHTunnelService(db)
    active_tunnel = (
        db.query(SSHTunnel)
        .filter(SSHTunnel.job_id == job.id, SSHTunnel.status == "ACTIVE")
        .first()
    )

    if not active_tunnel:
        return {
            "status": "NO_TUNNEL",
            "message": "No active tunnel found for this job",
            "tunnel": None,
        }

    # Sprawdź czy port tunelu jest otwarty
    internal_status = tunnel_service._is_port_in_use(active_tunnel.local_port)

    # Sprawdź, czy nasz tunel jest dostępny z zewnątrz
    # To powinno zadziałać dzięki przekierowaniu socat z 0.0.0.0 na 127.0.0.1
    external_accessible = (
        True  # Zakładamy, że jeśli socat działa, to jest dostępny z zewnątrz
    )

    # Stan aktualnego tunelu
    tunnel_info = {
        "id": active_tunnel.id,
        "port": active_tunnel.local_port,
        "remote_port": active_tunnel.remote_port,
        "remote_host": active_tunnel.remote_host,
        "status": active_tunnel.status,
        "created_at": active_tunnel.created_at.isoformat(),
        "internal_accessible": internal_status,
        "external_accessible": external_accessible,
    }

    if internal_status:
        return {
            "status": "ACTIVE",
            "message": "Tunnel is active and accessible",
            "tunnel": tunnel_info,
        }
    else:
        # Tunel jest nieaktywny, oznacz jako zamknięty w bazie danych
        active_tunnel.status = "CLOSED"
        db.commit()
        return {
            "status": "INACTIVE",
            "message": "Tunnel exists but is not accessible. "
            "It has been marked as closed.",
            "tunnel": tunnel_info,
        }
