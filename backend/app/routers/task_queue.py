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
