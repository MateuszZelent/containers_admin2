from typing import Any, List, Optional, Union, Dict
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, status
from sqlalchemy.orm import Session

from app.core.auth import get_current_active_user
from app.db.session import get_db
from app.db.models import User
from app.schemas.task_queue import (
    TaskQueueJobCreate,
    TaskQueueJobUpdate,
    TaskQueueJobInDB,
    TaskQueueStatus,
    SimulationResult,
)
from app.services.task_queue import TaskQueueService, TaskStatus

router = APIRouter()


@router.get("/", response_model=List[TaskQueueJobInDB])
def get_tasks(
    db: Session = Depends(get_db),
    status: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    current_user: User = Depends(get_current_active_user),
) -> Any:
    """
    Get all tasks in the queue for the current user, optionally filtered by status.
    """
    task_service = TaskQueueService(db)
    return task_service.get_tasks(current_user.id, status, skip, limit)


@router.post("/", response_model=TaskQueueJobInDB)
def create_task(
    *,
    db: Session = Depends(get_db),
    task_in: TaskQueueJobCreate,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_active_user),
) -> Any:
    """
    Create a new task in the simulation queue.
    """
    task_service = TaskQueueService(db)
    task = task_service.create_task(task_in, current_user.id)

    # Start the queue processor in the background if needed
    background_tasks.add_task(task_service._process_queue_once)

    return task


@router.get("/status", response_model=TaskQueueStatus)
def get_queue_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> Any:
    """
    Get the current status of the task queue for the current user.
    """
    task_service = TaskQueueService(db)
    return task_service.get_queue_status(current_user.id)


@router.get("/{task_id}", response_model=TaskQueueJobInDB)
def get_task(
    *,
    db: Session = Depends(get_db),
    task_id: str,  # Always a string from path parameter
    current_user: User = Depends(get_current_active_user),
) -> Any:
    """
    Get details of a specific task.
    """
    task_service = TaskQueueService(db)

    # Try to convert to integer if it's a numeric string
    parsed_id = task_id
    if task_id.isdigit():
        parsed_id = int(task_id)

    task = task_service.get_task(parsed_id)

    if not task:
        raise HTTPException(status_code=404, detail=f"Task with ID {task_id} not found")
    if task.owner_id != current_user.id:
        raise HTTPException(
            status_code=403, detail="Not authorized to access this task"
        )

    return task


@router.put("/{task_id}", response_model=TaskQueueJobInDB)
def update_task(
    *,
    db: Session = Depends(get_db),
    task_id: str,  # Always a string from path parameter
    task_update: TaskQueueJobUpdate,
    current_user: User = Depends(get_current_active_user),
) -> Any:
    """
    Update a task in the queue.
    """
    task_service = TaskQueueService(db)

    # Try to convert to integer if it's a numeric string
    parsed_id = task_id
    if task_id.isdigit():
        parsed_id = int(task_id)

    task = task_service.get_task(parsed_id)

    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if task.owner_id != current_user.id:
        raise HTTPException(
            status_code=403, detail="Not authorized to modify this task"
        )

    updated_task = task_service.update_task(parsed_id, task_update)
    if not updated_task:
        raise HTTPException(status_code=500, detail="Failed to update task")

    return updated_task


@router.delete("/{task_id}")
def delete_task(
    *,
    db: Session = Depends(get_db),
    task_id: Union[str, int],
    current_user: User = Depends(get_current_active_user),
) -> Dict[str, str]:
    """
    Delete a task from the queue.
    """
    task_service = TaskQueueService(db)
    success = task_service.delete_task(task_id, current_user.id)

    if not success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete task",
        )

    return {"message": "Task deleted successfully"}


@router.get("/{task_id}/results", response_model=SimulationResult)
async def get_task_results(
    *,
    db: Session = Depends(get_db),
    task_id: Union[str, int],
    current_user: User = Depends(get_current_active_user),
) -> Any:
    """
    Get results for a completed task.
    """
    task_service = TaskQueueService(db)
    task = task_service.get_task(task_id)

    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if task.owner_id != current_user.id:
        raise HTTPException(
            status_code=403, detail="Not authorized to access this task"
        )

    results = await task_service.get_task_results(task)
    return results


@router.post("/{task_id}/cancel")
async def cancel_task(
    *,
    db: Session = Depends(get_db),
    task_id: Union[str, int],
    current_user: User = Depends(get_current_active_user),
) -> Dict[str, str]:
    """
    Cancel a task that is pending or running.
    """
    task_service = TaskQueueService(db)
    success = await task_service.cancel_task(task_id, current_user.id)

    if not success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to cancel task",
        )

    return {"message": "Task cancelled successfully"}


@router.post("/process")
async def process_queue(
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> Dict[str, str]:
    """
    Manually trigger queue processing (admin only).
    """
    if not current_user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only administrators can trigger queue processing",
        )

    task_service = TaskQueueService(db)
    return await task_service.start_queue_processor(background_tasks)


@router.post("/amumax", response_model=TaskQueueJobInDB)
async def create_amumax_task(
    *,
    db: Session = Depends(get_db),
    mx3_file_path: str,
    task_name: str,
    partition: str = "proxima",
    num_cpus: int = 5,
    memory_gb: int = 24,
    num_gpus: int = 1,
    time_limit: str = "24:00:00",
    priority: int = 0,
    auto_submit: bool = True,
    current_user: User = Depends(get_current_active_user),
) -> Any:
    """
    Create and optionally submit an Amumax micromagnetic simulation task.

    Args:
        mx3_file_path: Path to the .mx3 simulation file (container path)
        task_name: Name for the simulation task
        partition: SLURM partition (default: proxima)
        num_cpus: Number of CPU cores (default: 5)
        memory_gb: Memory in GB (default: 24)
        num_gpus: Number of GPUs (default: 1)
        time_limit: Time limit in HH:MM:SS format (default: 24:00:00)
        priority: Task priority (default: 0)
        auto_submit: Whether to submit immediately to SLURM (default: True)

    Returns:
        The created TaskQueueJob
    """
    task_service = TaskQueueService(db)

    return await task_service.submit_amumax_task(
        mx3_file_path=mx3_file_path,
        task_name=task_name,
        owner_id=current_user.id,
        partition=partition,
        num_cpus=num_cpus,
        memory_gb=memory_gb,
        num_gpus=num_gpus,
        time_limit=time_limit,
        priority=priority,
        auto_submit=auto_submit,
    )


@router.get("/amumax", response_model=List[TaskQueueJobInDB])
def get_amumax_tasks(
    db: Session = Depends(get_db),
    skip: int = 0,
    limit: int = 100,
    current_user: User = Depends(get_current_active_user),
) -> Any:
    """
    Get all Amumax simulation tasks for the current user.

    This endpoint filters tasks to only return Amumax simulations
    (those with .mx3 files).
    """
    task_service = TaskQueueService(db)
    return task_service.get_amumax_tasks(current_user.id, skip, limit)


@router.get("/{task_id}/amumax-results")
async def get_amumax_results(
    *,
    db: Session = Depends(get_db),
    task_id: Union[str, int],
    current_user: User = Depends(get_current_active_user),
) -> Dict[str, Any]:
    """
    Get specialized results for a completed Amumax simulation task.

    This endpoint provides Amumax-specific result parsing including
    table files, OVF files, and magnetic field data.
    """
    task_service = TaskQueueService(db)
    task = task_service.get_task(task_id)

    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if task.owner_id != current_user.id:
        raise HTTPException(
            status_code=403, detail="Not authorized to access this task"
        )

    # Verify this is an Amumax task
    if not task.simulation_file.endswith(".mx3"):
        raise HTTPException(
            status_code=400, detail="This task is not an Amumax simulation"
        )

    results = await task_service.get_amumax_results(task)
    return results


@router.post("/amumax/validate")
def validate_mx3_file(
    *,
    db: Session = Depends(get_db),
    file_path: str,
    current_user: User = Depends(get_current_active_user),
) -> Dict[str, Any]:
    """
    Validate an .mx3 file before creating a task.

    This endpoint checks if the specified .mx3 file exists and is accessible.
    """
    task_service = TaskQueueService(db)

    is_valid = task_service.validate_mx3_file(file_path)

    return {
        "file_path": file_path,
        "is_valid": is_valid,
        "message": (
            "File is valid and accessible" if is_valid else
            "File is not accessible or not a valid .mx3 file"
        ),
    }
