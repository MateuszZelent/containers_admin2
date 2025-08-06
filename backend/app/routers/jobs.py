from typing import Any, Dict, List, Union
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, status
from sqlalchemy.orm import Session
import os
import httpx
import ssl
import asyncio
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
from app.services.tunnels.enums import TunnelStatus
from app.db.models import User, Job, SSHTunnel
from app.core.config import settings

router = APIRouter()

# Configuration
CADDY_API_URL: str = os.getenv("CADDY_API_URL", "http://host.docker.internal:2020")


async def verify_domain_accessibility(url: str, timeout: int = 10) -> bool:
    """
    Verify if a domain is accessible by making an HTTP request.
    Returns True if domain responds (any HTTP status), False otherwise.
    """
    try:
        async with httpx.AsyncClient(
            timeout=timeout,
            verify=False,  # Skip SSL verification for self-signed certs
            follow_redirects=True
        ) as client:
            response = await client.get(url)
            jobs_logger.info(f"Domain {url} responded with status {response.status_code}")
            return True  # Any response means domain is accessible
    except httpx.TimeoutException:
        jobs_logger.warning(f"Domain {url} timed out after {timeout}s")
        return False
    except httpx.ConnectError:
        jobs_logger.warning(f"Domain {url} connection failed")
        return False
    except Exception as e:
        jobs_logger.warning(f"Domain {url} verification failed: {str(e)}")
        return False


async def check_and_update_domain_status(db: Session, job_id: int) -> bool:
    """
    Check if a job's domain is accessible and update status accordingly.
    Returns True if domain is accessible, False otherwise.
    """
    try:
        job = db.query(Job).filter(Job.id == job_id).first()
        if not job or job.status != "RUNNING":
            return False
            
        # Get user info to generate domain
        user = db.query(User).filter(User.id == job.owner_id).first()
        if not user:
            return False
            
        # Generate domain name
        username_prefix = f"container_{user.username}_"
        if job.job_name.startswith(username_prefix):
            user_container_name = job.job_name[len(username_prefix) :]
        else:
            user_container_name = job.job_name

        safe_container_name = JobService.sanitize_container_name_for_domain(
            user_container_name
        )
        if not safe_container_name:
            safe_container_name = f"job{job.id}"

        domain = f"{user.username}-{safe_container_name}.orion.zfns.eu.org"
        url = f"https://{domain}"
        
        # Check accessibility
        is_accessible = await verify_domain_accessibility(url, timeout=5)
        
        # Update domain_ready status if needed
        job_service = JobService(db)
        if is_accessible and not job.domain_ready:
            job_service.update_domain_ready_status(job_id, True)
            jobs_logger.info(f"Domain {domain} now accessible, marked as ready")
        elif not is_accessible and job.domain_ready:
            job_service.update_domain_ready_status(job_id, False)
            jobs_logger.warning(f"Domain {domain} no longer accessible")
            
        return is_accessible
        
    except Exception as e:
        jobs_logger.error(f"Error checking domain status for job {job_id}: {e}")
        return False


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
    active_jobs = await monitor_service.get_user_active_jobs(db, current_user.username)

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
    Get real-time status of user's active jobs from SLURM.
    This endpoint provides time_left and other real-time SLURM data.
    """
    try:
        from app.services.slurm_monitor import monitor_service

        jobs_logger.debug(f"Fetching active jobs for user: {current_user.username}")

        # Get active jobs from database
        active_jobs = await monitor_service.get_user_active_jobs(
            db, current_user.username
        )

        if not active_jobs:
            return []

        # Zwracaj tylko dane z bazy, bez pobierania z SLURM
        jobs_data = []
        for job in active_jobs:
            job_data = {
                "job_id": job.job_id,
                "name": job.job_name,
                "user": current_user.username,
                "state": job.status,
                "partition": job.partition,
                "node": job.node,
                "node_count": job.num_nodes,
                "time_used": job.time_used or "",
                "time_left": job.time_left or "",
                "memory_requested": f"{job.memory_gb}G",
                "start_time": None,  # Możesz dodać jeśli chcesz
                "submit_time": job.created_at.isoformat(),
                "reason": "",  # Możesz dodać jeśli chcesz
                "monitoring_active": True,
                "last_updated": job.updated_at.isoformat() if job.updated_at else None,
                "template": job.template_name,
                "created_at": job.created_at.isoformat(),
                "updated_at": job.updated_at.isoformat() if job.updated_at else None,
            }
            jobs_data.append(job_data)
        return jobs_data
    except Exception as e:
        # Improve error handling with logging
        jobs_logger.error(f"Error fetching active jobs: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch active jobs: {str(e)}",
        )
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
        if not filename.endswith(".template"):
            continue
        if (
            current_user.allowed_templates is not None
            and filename not in current_user.allowed_templates
        ):
            continue
        templates.append(filename)

    return templates


async def _check_user_limits(db: Session, user: User, job_in: JobCreate) -> None:
    """
    Check if user can create new job based on their limits.
    Raises HTTPException if limits are exceeded.
    """
    # Check template permissions
    if (
        user.allowed_templates is not None
        and job_in.template_name not in user.allowed_templates
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User not allowed to use this template",
        )

    # Get all user's active jobs
    active_jobs = (
        db.query(Job)
        .filter(
            Job.owner_id == user.id,
            Job.status.in_(["RUNNING", "PENDING", "CONFIGURING"]),
        )
        .all()
    )

    # Check max containers limit
    if user.max_containers is not None:
        active_jobs_count = len(active_jobs)

        if active_jobs_count >= user.max_containers:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"❌ Przekroczono limit kontenerów!\n"
                f"🔸 Maksymalna liczba: {user.max_containers}\n"
                f"🔸 Aktualnie aktywnych: {active_jobs_count}\n"
                f"💡 Usuń nieużywane kontenery, aby zwolnić miejsce.",
            )

    # Check per-job GPU limit
    if user.max_gpus_per_job is not None and job_in.num_gpus > user.max_gpus_per_job:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"❌ Limit GPU na jeden kontener przekroczony!\n"
                f"🔸 Dozwolone GPU na kontener: {user.max_gpus_per_job}\n"
                f"🔸 Żądane GPU: {job_in.num_gpus}"
            ),
        )

    # Check max GPUs limit
    if user.max_gpus is not None and job_in.num_gpus > 0:
        total_gpus_used = sum([job.num_gpus or 0 for job in active_jobs])

        if total_gpus_used + job_in.num_gpus > user.max_gpus:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"❌ Przekroczono limit kart graficznych!\n"
                f"🔸 Maksymalna liczba GPU: {user.max_gpus}\n"
                f"🔸 Aktualnie używanych: {total_gpus_used}\n"
                f"🔸 Żądanych dla nowego joba: {job_in.num_gpus}\n"
                f"🔸 Po utworzeniu wykorzystanie: "
                f"{total_gpus_used + job_in.num_gpus}\n"
                f"💡 Usuń kontenery używające GPU lub zmniejsz liczbę GPU.",
            )

    # Check max job time limit
    if user.max_time_limit_hours is not None:
        try:
            hours, minutes, seconds = [
                int(part) for part in job_in.time_limit.split(":")
            ]
            requested_hours = hours + minutes / 60 + seconds / 3600
        except Exception:
            requested_hours = 0

        if requested_hours > user.max_time_limit_hours:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"❌ Przekroczono maksymalny czas życia kontenera!\n"
                    f"🔸 Dozwolone godzin: {user.max_time_limit_hours}\n"
                    f"🔸 Żądane: {requested_hours:.2f}"
                ),
            )

    # Check max CPU cores limit (if exists)
    if hasattr(user, "max_cpu_cores") and user.max_cpu_cores is not None:
        total_cpus_used = sum([job.num_cpus or 0 for job in active_jobs])

        if total_cpus_used + job_in.num_cpus > user.max_cpu_cores:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"❌ Przekroczono limit rdzeni CPU!\n"
                f"🔸 Maksymalna liczba rdzeni: {user.max_cpu_cores}\n"
                f"🔸 Aktualnie używanych: {total_cpus_used}\n"
                f"🔸 Żądanych dla nowego joba: {job_in.num_cpus}\n"
                f"🔸 Po utworzeniu wykorzystanie: "
                f"{total_cpus_used + job_in.num_cpus}\n"
                f"💡 Usuń kontenery lub zmniejsz liczbę rdzeni CPU.",
            )

    # Check max memory limit (if exists)
    if hasattr(user, "max_memory_gb") and user.max_memory_gb is not None:
        total_memory_used = sum([job.memory_gb or 0 for job in active_jobs])

        if total_memory_used + job_in.memory_gb > user.max_memory_gb:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"❌ Przekroczono limit pamięci RAM!\n"
                f"🔸 Maksymalna pamięć: {user.max_memory_gb} GB\n"
                f"🔸 Aktualnie używana: {total_memory_used} GB\n"
                f"🔸 Żądana dla nowego joba: {job_in.memory_gb} GB\n"
                f"🔸 Po utworzeniu wykorzystanie: "
                f"{total_memory_used + job_in.memory_gb} GB\n"
                f"💡 Usuń kontenery lub zmniejsz ilość pamięci RAM.",
            )

    # Check max nodes limit (if exists)
    if hasattr(user, "max_nodes") and user.max_nodes is not None:
        active_nodes = set()
        for job in active_jobs:
            if job.node:
                active_nodes.add(job.node)

        # Assume new job will use 1 node if not specified
        requested_nodes = getattr(job_in, "num_nodes", 1)

        if len(active_nodes) + requested_nodes > user.max_nodes:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"❌ Przekroczono limit węzłów obliczeniowych!\n"
                f"🔸 Maksymalna liczba węzłów: {user.max_nodes}\n"
                f"🔸 Aktualnie używanych węzłów: {len(active_nodes)}\n"
                f"🔸 Żądanych dla nowego joba: {requested_nodes}\n"
                f"💡 Usuń kontenery z innych węzłów.",
            )


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
    # Check user limits and permissions
    await _check_user_limits(db, current_user, job_in)

    from app.services.slurm import SlurmSSHService

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


@router.get("/{job_id}/log")
async def get_job_log(
    *,
    db: Session = Depends(get_db),
    job_id: int,
    current_user: User = Depends(get_current_active_user),
) -> Dict[str, Any]:
    """Get log content for a job."""
    # Check if job belongs to user
    job = JobService.get(db=db, job_id=job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")

    try:
        job_service = JobService(db)
        log_content = job_service.get_job_log(job.job_id, "out")

        if log_content is None:
            return {
                "job_id": job_id,
                "slurm_job_id": job.job_id,
                "log_content": "",
                "message": "Log file not found or not yet created",
                "has_content": False,
            }

        return {
            "job_id": job_id,
            "slurm_job_id": job.job_id,
            "log_content": log_content,
            "message": "Log retrieved successfully",
            "has_content": True,
            "content_length": len(log_content),
        }

    except Exception as e:
        jobs_logger.error(f"Error getting log for job {job_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to retrieve job log")


@router.get("/{job_id}/error")
async def get_job_error(
    *,
    db: Session = Depends(get_db),
    job_id: int,
    current_user: User = Depends(get_current_active_user),
) -> Dict[str, Any]:
    """Get error log content for a job."""
    # Check if job belongs to user
    job = JobService.get(db=db, job_id=job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")

    try:
        job_service = JobService(db)
        error_content = job_service.get_job_error(job.job_id)

        if error_content is None:
            return {
                "job_id": job_id,
                "slurm_job_id": job.job_id,
                "error_content": "",
                "message": "Error file not found or not yet created",
                "has_content": False,
            }

        return {
            "job_id": job_id,
            "slurm_job_id": job.job_id,
            "error_content": error_content,
            "message": "Error log retrieved successfully",
            "has_content": True,
            "content_length": len(error_content),
        }

    except Exception as e:
        jobs_logger.error(f"Error getting error log for job {job_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to retrieve job error log")


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

    from app.dependencies.tunnel_service import get_tunnel_service
    tunnel_service = get_tunnel_service()
    return tunnel_service.get_job_tunnels(job_id, db)


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

    from app.dependencies.tunnel_service import get_tunnel_service
    tunnel_service = get_tunnel_service()
    tunnel = await tunnel_service.get_or_create_tunnel(job_id, db)
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

    from app.dependencies.tunnel_service import get_tunnel_service
    tunnel_service = get_tunnel_service()
    success = await tunnel_service.close_tunnel(tunnel_id, db)
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
    jobs_logger.info(
        f"🚀 CODE-SERVER REQUEST: Starting for job_id={job_id}, "
        f"user={current_user.username}"
    )

    job = JobService.get(db=db, job_id=job_id)
    if not job:
        jobs_logger.error(f"❌ CODE-SERVER: Job {job_id} not found")
        raise HTTPException(status_code=404, detail="Job not found")

    jobs_logger.info(
        f"✅ CODE-SERVER: Job {job_id} found - status={job.status}, "
        f"port={job.port}, node={job.node}"
    )
    if job.owner_id != current_user.id:
        jobs_logger.error(
            f"❌ CODE-SERVER: Access denied for job {job_id}, "
            f"owner_id={job.owner_id}, user_id={current_user.id}"
        )
        raise HTTPException(status_code=403, detail="Not enough permissions")

    if not job.port or not job.node or job.status != "RUNNING":
        jobs_logger.error(
            f"❌ CODE-SERVER: Job {job_id} not ready - "
            f"status={job.status}, port={job.port}, node={job.node}"
        )
        raise HTTPException(
            status_code=400, detail="Job is not running or missing port/node info"
        )

    jobs_logger.info(f"🔀 CODE-SERVER: Starting tunnel creation for job {job_id}")
    # Create or get existing tunnel
    from app.dependencies.tunnel_service import get_tunnel_service
    tunnel_service = get_tunnel_service()
    tunnel = await tunnel_service.get_or_create_tunnel(job_id, db)

    if not tunnel:
        jobs_logger.error(f"❌ CODE-SERVER: Tunnel creation failed for job {job_id}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not establish SSH tunnel. Please try again later.",
        )

    jobs_logger.info(
        f"✅ CODE-SERVER: Tunnel created/found for job {job_id} - "
        f"tunnel_id={tunnel.id}, local_port={tunnel.local_port}, "
        f"status={tunnel.status}"
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

    jobs_logger.info(
        f"🌐 CODE-SERVER: Configuring Caddy for domain={domain}, "
        f"target_port={tunnel.local_port}"
    )

    # Configure Caddy to route the domain to the local tunnel port
    caddy_client = CaddyAPIClient(CADDY_API_URL)

    try:
        jobs_logger.info(f"🔧 CODE-SERVER: Calling Caddy API for domain {domain}")
        success = caddy_client.add_domain_with_auto_tls(
            domain=domain, target="localhost", target_port=tunnel.local_port
        )
        jobs_logger.info(f"📋 CODE-SERVER: Caddy API response: {success}")

        if not success:
            jobs_logger.error(f"❌ CODE-SERVER: Caddy returned false for {domain}")
            raise Exception("Caddy configuration returned false")

        jobs_logger.info(f"✅ CODE-SERVER: Caddy configured successfully for {domain}")

        # Verify domain is actually responding before marking as ready
        jobs_logger.info(f"🔍 CODE-SERVER: Verifying domain accessibility for {domain}")
        domain_url = f"https://{domain}"
        domain_accessible = await verify_domain_accessibility(domain_url)
        
        if domain_accessible:
            # Mark domain as ready after successful verification
            job_service = JobService(db)
            job_service.update_domain_ready_status(job.id, True)
            jobs_logger.info(
                f"✅ CODE-SERVER: Domain {domain} verified and marked as ready for job {job.id}"
            )
        else:
            jobs_logger.warning(
                f"⚠️ CODE-SERVER: Domain {domain} configured in Caddy but not yet accessible. "
                f"Client should poll domain-status endpoint."
            )
            # Don't mark as ready yet - let the polling handle it

    except Exception as e:
        jobs_logger.error(
            f"❌ CODE-SERVER: Caddy configuration failed for {domain}: {e}"
        )

        # If Caddy configuration fails, clean up the tunnel
        jobs_logger.info(f"🧹 CODE-SERVER: Cleaning up tunnel {tunnel.id}")
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

    from app.dependencies.tunnel_service import get_tunnel_service
    tunnel_service = get_tunnel_service()
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
        active_tunnel.status = TunnelStatus.CLOSED.value
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

    from app.dependencies.tunnel_service import get_tunnel_service
    tunnel_service = get_tunnel_service()
    health_info = await tunnel_service.health_check(tunnel_id, db)
    
    if not health_info:
        raise HTTPException(status_code=404, detail="Tunnel not found")

    return {
        "tunnel_id": tunnel_id,
        "status": health_info.health_status.value,
        "port_connectivity": health_info.port_connectivity,
        "last_check": health_info.last_test,
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

    from app.dependencies.tunnel_service import get_tunnel_service
    tunnel_service = get_tunnel_service()
    # TODO: Implement health_check_all_active_tunnels method in new service
    health_results = []  # await tunnel_service.health_check_all_active_tunnels()

    return {
        "total_tunnels": len(health_results),
        "results": [
            {
                "tunnel_id": tunnel_id,
                "status": health_info.health_status.value,
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

    from app.dependencies.tunnel_service import get_tunnel_service
    tunnel_service = get_tunnel_service()
    health_info = await tunnel_service.health_check(tunnel_id, db)
    
    if not health_info:
        raise HTTPException(status_code=404, detail="Tunnel health check failed")

    return {
        "tunnel_id": health_info.tunnel_id,
        "status": health_info.health_status.value,
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


@router.get("/active-all")
async def get_active_all_jobs(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> List[Dict[str, Any]]:
    """
    Get real-time status of user's active jobs from both containers and task_queue.
    This endpoint provides unified view of all active jobs (containers + amumax tasks).
    """
    try:
        from app.services.slurm_monitor import monitor_service

        jobs_logger.debug(f"Fetching all active jobs for user: {current_user.username}")

        # Get all active jobs (containers + task_queue) from monitoring service
        all_active_jobs = await monitor_service.get_user_all_active_jobs(
            db, current_user.username
        )

        if not all_active_jobs:
            return []

        # Format data for frontend consistency
        jobs_data = []
        for job in all_active_jobs:
            job_data = {
                "id": job["id"],
                "job_id": job["job_id"],
                "name": job["name"],
                "type": job["type"],  # 'container' or 'task_queue'
                "user": current_user.username,
                "state": job["status"],
                "partition": job["partition"],
                "node": job.get("node"),
                "node_count": 1,  # Default for task_queue
                "time_used": job.get("time_used", ""),
                "time_left": job.get("time_left", ""),
                "memory_requested": f"{job['memory_gb']}G",
                "start_time": None,
                "submit_time": job["created_at"].isoformat(),
                "reason": "",
                "monitoring_active": True,
                "last_updated": (
                    job["updated_at"].isoformat() if job["updated_at"] else None
                ),
                "template": job.get("template_name", "unknown"),
                "created_at": job["created_at"].isoformat(),
                "updated_at": (
                    job["updated_at"].isoformat() if job["updated_at"] else None
                ),
                # Additional fields for task_queue
                "simulation_file": job.get("simulation_file"),
                "progress": job.get("progress", 0),
                "num_cpus": job["num_cpus"],
                "memory_gb": job["memory_gb"],
                "num_gpus": job["num_gpus"],
            }
            jobs_data.append(job_data)

        jobs_logger.info(
            f"Found {len(jobs_data)} active jobs for user {current_user.username}"
        )
        return jobs_data

    except Exception as e:
        jobs_logger.error(f"Error fetching all active jobs: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch all active jobs: {str(e)}",
        )


@router.post("/{job_id}/domain-ready")
async def mark_domain_ready(
    job_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> Dict[str, Any]:
    """Mark a job's domain as ready (called by Caddy or monitoring system)."""

    try:
        job = db.query(Job).filter(Job.id == job_id).first()
        if not job:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Job with ID {job_id} not found",
            )

        # Check if user owns the job or is superuser
        if job.owner_id != current_user.id and not current_user.is_superuser:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not enough permissions to update this job",
            )

        # Update domain_ready status
        job.domain_ready = True
        db.commit()
        db.refresh(job)

        jobs_logger.info(f"Domain marked as ready for job {job_id}")

        return {
            "message": f"Domain marked as ready for job {job_id}",
            "job_id": job.id,
            "domain_ready": job.domain_ready,
        }

    except HTTPException:
        raise
    except Exception as e:
        jobs_logger.error(f"Error marking domain ready for job {job_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to mark domain ready: {str(e)}",
        )


@router.get("/{job_id}/domain-status")
async def get_domain_status(
    job_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> Dict[str, Any]:
    """Get domain readiness status for a job."""

    try:
        job = db.query(Job).filter(Job.id == job_id).first()
        if not job:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Job with ID {job_id} not found",
            )

        # Check if user owns the job or is superuser
        if job.owner_id != current_user.id and not current_user.is_superuser:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not enough permissions to access this job",
            )

        # Generate URL if domain is ready
        url = None
        if job.domain_ready and job.status == "RUNNING":
            # Generate domain name using same logic as code-server endpoint
            username_prefix = f"container_{current_user.username}_"
            if job.job_name.startswith(username_prefix):
                user_container_name = job.job_name[len(username_prefix) :]
            else:
                user_container_name = job.job_name

            # Sanitize container name using centralized method
            safe_container_name = JobService.sanitize_container_name_for_domain(
                user_container_name
            )
            if not safe_container_name:
                safe_container_name = f"job{job.id}"

            # Generate domain using username and clean container name
            domain = f"{current_user.username}-{safe_container_name}.orion.zfns.eu.org"
            url = f"https://{domain}"
            
            # Verify domain is actually accessible
            domain_accessible = await verify_domain_accessibility(url, timeout=5)
            if not domain_accessible:
                # Domain was marked as ready but isn't accessible yet
                # Keep URL but don't mark as fully ready in response
                jobs_logger.warning(
                    f"Domain {domain} marked ready but not accessible "
                    f"for job {job_id}"
                )
                # Reset domain_ready flag until it's actually accessible
                job_service = JobService(db)
                job_service.update_domain_ready_status(job_id, False)
                url = None

        return {
            "job_id": job.id,
            "domain_ready": job.domain_ready,
            "status": job.status,
            "node": job.node,
            "port": job.port,
            "url": url,
        }

    except HTTPException:
        raise
    except Exception as e:
        jobs_logger.error(f"Error getting domain status for job {job_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get domain status: {str(e)}",
        )
