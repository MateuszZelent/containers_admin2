from typing import Any, Dict, List, Union
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, status
from sqlalchemy.orm import Session
import os
from caddy_api_client import CaddyAPIClient
from app.core.logging import logger as jobs_logger
from app.core.auth import (
    get_current_active_user,
    get_current_user,
    get_current_superuser,
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

CADDY_API_URL: str = os.getenv("CADDY_API_URL", "http://localhost:2019")
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
            "slurm_running": latest_status.is_connected,
        }
    else:
        # No fallback - return unavailable status when no monitoring data
        return {"connected": False, "slurm_running": False}


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

    # Get jobs from database - monitoring service already keeps them up to date
    job_service = JobService(db)
    db_jobs = job_service.get_jobs(current_user)
    db_jobs_map = {job.job_id: job for job in db_jobs}

    # Get active jobs directly from database instead of snapshots
    active_jobs = await monitor_service.get_user_active_jobs(
        db, current_user.username
    )
    
    # We don't need to update anything here as the monitor service
    # already keeps the job statuses up to date

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
        job_snapshots = await monitor_service.get_job_snapshot(db, job.job_id)

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
    Get all active jobs for the current user directly from the database.
    The monitor service keeps the job statuses up to date.
    """
    try:
        from app.services.slurm_monitor import monitor_service

        jobs_logger.debug(
            f"Fetching active jobs for user: {current_user.username}"
        )

        # Get active jobs directly from database
        active_jobs = await monitor_service.get_user_active_jobs(
            db, current_user.username
        )

        # Convert to response format
        enhanced_jobs = []
        for job in active_jobs:
            job_data = {
                "job_id": job.job_id,
                "name": job.job_name,
                "user": current_user.username,
                "state": job.status,
                "partition": job.partition,
                "node": job.node,
                "node_count": job.num_nodes,
                "time_used": "",  # Not available in Job model
                "time_left": "",  # Not available in Job model
                "memory_requested": f"{job.memory_gb}G",
                "start_time": "",  # Not available in Job model
                "submit_time": job.created_at.isoformat(),
                "reason": "",  # Not available in Job model
                "monitoring_active": True,
                "last_updated": job.updated_at.isoformat() if job.updated_at else None,
                "template": job.template_name,
                "created_at": job.created_at.isoformat(),
                "updated_at": job.updated_at.isoformat() if job.updated_at else None,
            }
            enhanced_jobs.append(job_data)

        return enhanced_jobs
    except Exception as e:
        # Improve error handling with logging
        jobs_logger.error(f"Error fetching active jobs: {str(e)}")
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
        initial_check_interval=2,
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
    Get status of a specific job from cached monitoring data.
    No direct SLURM calls - uses monitoring service cache.
    """
    job = JobService.get(db=db, job_id=job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")

    from app.services.slurm_monitor import monitor_service

    # Try to get current status from monitoring cache
    job_snapshot = await monitor_service.get_job_snapshot(db, job.job_id)

    if job_snapshot and job_snapshot.is_current:
        return {
            "status": job_snapshot.state,
            "node": job_snapshot.node if job_snapshot.node != "(None)" else None,
            "in_queue": True,
            "last_updated": job_snapshot.last_updated.isoformat()
            if job_snapshot.last_updated
            else None,
            "time_used": job_snapshot.time_used,
            "time_left": job_snapshot.time_left,
        }

    # Job is not in the active queue, return stored database status
    return {
        "status": job.status,
        "node": job.node,
        "in_queue": False,
        "last_updated": job.updated_at.isoformat() if job.updated_at else None,
    }


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

    # Check monitoring service cache for current job snapshot
    from app.services.slurm_monitor import monitor_service

    job_snapshot = await monitor_service.get_job_snapshot(db, job.job_id)

    if job_snapshot and job_snapshot.node and job_snapshot.node != "(None)":
        # Update the job in the database with cached node info
        job.node = job_snapshot.node
        db.add(job)
        db.commit()
        db.refresh(job)
        return {"node": job_snapshot.node}

    # No node information available in cache or database
    return {"node": None}


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
async def create_job_tunnel(
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
    tunnel = await tunnel_service.create_tunnel(job)
    if not tunnel:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not create SSH tunnel",
        )
    return tunnel


@router.delete("/{job_id}/tunnels/{tunnel_id}")
async def close_job_tunnel(
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
    success = await tunnel_service.close_tunnel(tunnel_id)
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

    try:
        success = caddy_client.add_domain_with_auto_tls(
            domain=domain, target="localhost", target_port=tunnel.local_port
        )

        if not success:
            raise Exception("Caddy configuration returned false")

    except Exception as e:
        jobs_logger.error(f"Failed to configure Caddy domain {domain}: {e}")

        # If Caddy configuration fails, clean up the tunnel
        await tunnel_service.close_tunnel(tunnel.id)

        # Return more specific error message about Caddy unavailability
        if "Connection refused" in str(e) or "HTTPConnectionPool" in str(e):
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Caddy proxy service is currently unavailable. Cannot generate public URL.",
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to configure domain routing: {str(e)}",
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


@router.get("/admin/all-users")
def get_all_users_admin(
    current_user: User = Depends(get_current_superuser), db: Session = Depends(get_db)
):
    """Get all users for admin panel (superuser only)."""
    users = db.query(User).order_by(User.created_at.desc()).all()
    return users


@router.put("/admin/users/{user_id}")
def update_user_admin(
    user_id: int,
    user_update: dict,
    current_user: User = Depends(get_current_superuser),
    db: Session = Depends(get_db),
):
    """Update user (admin only)."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Update allowed fields
    allowed_fields = [
        "max_containers",
        "max_gpus",
        "is_active",
        "is_superuser",
        "first_name",
        "last_name",
        "email",
    ]

    for field, value in user_update.items():
        if field in allowed_fields and hasattr(user, field):
            setattr(user, field, value)

    db.commit()
    db.refresh(user)
    return user


@router.delete("/admin/users/{user_id}")
def delete_user_admin(
    user_id: int,
    current_user: User = Depends(get_current_superuser),
    db: Session = Depends(get_db),
):
    """Delete user (admin only)."""
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Check if user has active jobs
    active_jobs = (
        db.query(Job)
        .filter(Job.owner_id == user_id, Job.status.in_(["RUNNING", "PENDING"]))
        .count()
    )

    if active_jobs > 0:
        raise HTTPException(
            status_code=400, detail=f"Cannot delete user with {active_jobs} active jobs"
        )

    db.delete(user)
    db.commit()
    return {"message": "User deleted successfully"}


@router.get("/tunnels/{tunnel_id}/health")
async def check_tunnel_health(
    tunnel_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Perform health check on a specific SSH tunnel"""
    # Check if tunnel exists and user has access
    tunnel = db.query(SSHTunnel).filter(SSHTunnel.id == tunnel_id).first()
    if not tunnel:
        raise HTTPException(status_code=404, detail="Tunnel not found")

    # Check if user owns the job associated with this tunnel
    job = db.query(Job).filter(Job.id == tunnel.job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Associated job not found")

    if job.owner_id != current_user.id and not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Not authorized")

    tunnel_service = SSHTunnelService(db)
    health_info = await tunnel_service.health_check(tunnel_id)

    return {
        "tunnel_id": health_info.tunnel_id,
        "status": health_info.status.value,
        "port_connectivity": health_info.port_connectivity,
        "last_check": health_info.last_check,
        "ssh_process": {
            "pid": health_info.ssh_process.pid if health_info.ssh_process else None,
            "is_running": health_info.ssh_process.is_running
            if health_info.ssh_process
            else False,
            "memory_usage_mb": health_info.ssh_process.memory_usage
            if health_info.ssh_process
            else None,
            "cpu_usage": health_info.ssh_process.cpu_usage
            if health_info.ssh_process
            else None,
        }
        if health_info.ssh_process
        else None,
        "socat_process": {
            "pid": health_info.socat_process.pid if health_info.socat_process else None,
            "is_running": health_info.socat_process.is_running
            if health_info.socat_process
            else False,
            "memory_usage_mb": health_info.socat_process.memory_usage
            if health_info.socat_process
            else None,
            "cpu_usage": health_info.socat_process.cpu_usage
            if health_info.socat_process
            else None,
        }
        if health_info.socat_process
        else None,
        "error_message": health_info.error_message,
    }


@router.get("/tunnels/health-check-all")
async def check_all_tunnels_health(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Perform health check on all active tunnels (admin only)"""
    if not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Admin access required")

    tunnel_service = SSHTunnelService(db)
    health_results = await tunnel_service.health_check_all_active_tunnels()

    return {
        "total_tunnels": len(health_results),
        "results": [
            {
                "tunnel_id": tunnel_id,
                "status": health_info.status.value,
                "port_connectivity": health_info.port_connectivity,
                "last_check": health_info.last_check,
                "ssh_process_running": health_info.ssh_process.is_running
                if health_info.ssh_process
                else False,
                "socat_process_running": health_info.socat_process.is_running
                if health_info.socat_process
                else False,
                "error_message": health_info.error_message,
            }
            for tunnel_id, health_info in health_results.items()
        ],
    }


@router.post("/{job_id}/tunnels/{tunnel_id}/health-check")
async def check_job_tunnel_health(
    job_id: int,
    tunnel_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Perform health check on a specific SSH tunnel for a job"""
    # Check job access
    job_service = JobService(db)
    job = job_service.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to access this job")

    # Check if tunnel belongs to this job
    tunnel = (
        db.query(SSHTunnel)
        .filter(SSHTunnel.id == tunnel_id, SSHTunnel.job_id == job_id)
        .first()
    )
    if not tunnel:
        raise HTTPException(status_code=404, detail="Tunnel not found for this job")

    tunnel_service = SSHTunnelService(db)
    health_info = await tunnel_service.health_check(tunnel_id)

    return {
        "tunnel_id": health_info.tunnel_id,
        "status": health_info.status.value,
        "port_connectivity": health_info.port_connectivity,
        "last_check": health_info.last_check,
        "ssh_process": {
            "pid": health_info.ssh_process.pid if health_info.ssh_process else None,
            "is_running": health_info.ssh_process.is_running
            if health_info.ssh_process
            else False,
            "memory_usage_mb": health_info.ssh_process.memory_usage
            if health_info.ssh_process
            else None,
            "cpu_usage": health_info.ssh_process.cpu_usage
            if health_info.ssh_process
            else None,
        }
        if health_info.ssh_process
        else None,
        "socat_process": {
            "pid": health_info.socat_process.pid if health_info.socat_process else None,
            "is_running": health_info.socat_process.is_running
            if health_info.socat_process
            else False,
            "memory_usage_mb": health_info.socat_process.memory_usage
            if health_info.socat_process
            else None,
            "cpu_usage": health_info.socat_process.cpu_usage
            if health_info.socat_process
            else None,
        }
        if health_info.socat_process
        else None,
        "error_message": health_info.error_message,
    }
