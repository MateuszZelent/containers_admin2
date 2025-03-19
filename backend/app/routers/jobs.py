from typing import Any, Dict, List, Union
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, status
from sqlalchemy.orm import Session

from app.core.auth import get_current_active_user, get_current_user
from app.db.session import get_db
from app.schemas.job import Job, JobCreate, JobPreview, JobSubmissionResponse, JobInDB, SSHTunnelInfo
from app.services.job import JobService
from app.services.slurm import SlurmSSHService
from app.services.ssh_tunnel import SSHTunnelService
from app.db.models import User as UserModel, User, Job as JobModel

router = APIRouter()

@router.get("/status")
async def check_cluster_status(
    current_user: UserModel = Depends(get_current_active_user),
) -> Dict[str, bool]:
    """
    Check if the SLURM cluster is reachable and running.
    """
    slurm_service = SlurmSSHService()
    return await slurm_service.check_status()


@router.get("/", response_model=List[Job])
def get_jobs(
    db: Session = Depends(get_db),
    skip: int = 0,
    limit: int = 100,
    current_user: UserModel = Depends(get_current_active_user),
) -> Any:
    """
    Retrieve jobs for current user.
    """
    jobs = JobService.get_multi_by_owner(
        db=db, owner_id=current_user.id, skip=skip, limit=limit
    )
    return jobs


@router.get("/active-jobs")
async def get_active_jobs(
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_active_user),
) -> List[Dict[str, Any]]:
    """
    Get active jobs from SLURM for current user with extended status information.
    """
    slurm_service = SlurmSSHService()
    active_jobs = await slurm_service.get_active_jobs()
    
    # Get all jobs from database for the current user
    db_jobs = JobService.get_multi_by_owner(db=db, owner_id=current_user.id)
    db_jobs_map = {job.job_id: job for job in db_jobs}
    
    # Enhance active jobs with database information
    enhanced_jobs = []
    for job_info in active_jobs:
        job_id = job_info["job_id"]
        if job_id in db_jobs_map:
            db_job = db_jobs_map[job_id]
            enhanced_jobs.append({
                **job_info,
                "name": db_job.job_name,
                "template": db_job.template_name,
                "created_at": db_job.created_at.isoformat(),
                "updated_at": db_job.updated_at.isoformat() if db_job.updated_at else None,
                "monitoring_active": True
            })
    
    return enhanced_jobs


@router.get("/templates")
async def get_templates(
    current_user: UserModel = Depends(get_current_active_user),
) -> List[str]:
    """
    Get available job templates.
    """
    slurm_service = SlurmSSHService()
    return await slurm_service.get_available_templates()


@router.post("/", response_model=Union[JobSubmissionResponse, JobPreview])
async def create_job(
    *,
    db: Session = Depends(get_db),
    job_in: JobCreate,
    background_tasks: BackgroundTasks,
    current_user: UserModel = Depends(get_current_active_user),
) -> Any:
    """
    Create new job by submitting a template-based job to SLURM.
    If preview=True, returns the filled template without submitting the job.
    """
    slurm_service = SlurmSSHService()
    job_service = JobService(db)
    
    # Submit job to SLURM or preview template
    if job_in.preview:
        # Just fill the template and return it without submitting
        params = {
            "job_name": job_in.job_name,
            "num_cpus": job_in.num_cpus,
            "memory_gb": job_in.memory_gb,
            "num_gpus": job_in.num_gpus,
            "time_limit": job_in.time_limit,
            "partition": getattr(job_in, "partition", "standard"),
            "num_nodes": getattr(job_in, "num_nodes", 1),
            "tasks_per_node": getattr(job_in, "tasks_per_node", 1),
        }
        script_content = await slurm_service.fill_template(job_in.template_name, params)
        return JobPreview(script=script_content)
    
    # Submit the job
    job = await job_service.submit_job(
        job_name=job_in.job_name,
        template_name=job_in.template_name,
        num_cpus=job_in.num_cpus,
        memory_gb=job_in.memory_gb,
        num_gpus=job_in.num_gpus,
        time_limit=job_in.time_limit,
        user=current_user
    )
    
    # Start background job monitoring
    background_tasks.add_task(
        job_service.monitor_job_status,
        db=db,
        slurm_service=slurm_service,
        job_id=job.job_id,
        user=current_user
    )
    
    return JobSubmissionResponse(
        message=f"Success! Your job has been submitted with ID {job.job_id}",
        job_id=job.job_id,
        job=job
    )


@router.get("/{job_id}", response_model=Job)
def get_job(
    *,
    db: Session = Depends(get_db),
    job_id: int,
    current_user: UserModel = Depends(get_current_active_user),
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
    current_user: UserModel = Depends(get_current_active_user),
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
            "in_queue": True
        }
    
    # Job is not in the queue, return stored status
    return {
        "status": job.status,
        "node": job.node,
        "in_queue": False
    }


@router.get("/{job_id}/node")
async def get_job_node(
    *,
    db: Session = Depends(get_db),
    job_id: int,
    current_user: UserModel = Depends(get_current_active_user),
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
    current_user: User = Depends(get_current_user)
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
    current_user: User = Depends(get_current_user)
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
            detail="Could not create SSH tunnel"
        )
    return tunnel


@router.delete("/{job_id}/tunnels/{tunnel_id}")
def close_job_tunnel(
    job_id: int,
    tunnel_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
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
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not close SSH tunnel"
        )
    return {"message": "Tunnel closed successfully"}


@router.delete("/{job_id}")
def delete_job(
    job_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Delete a job"""
    job_service = JobService(db)
    job = job_service.get_job(job_id)
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job not found"
        )
    if job.owner_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions"
        )
    job_service.delete_job(job)
    return {"message": "Job deleted successfully"}