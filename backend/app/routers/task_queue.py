from typing import Any, List, Optional, Union, Dict
from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    BackgroundTasks,
    status,
    UploadFile,
    File,
    Form,
)
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
    FileValidationRequest,
)
from app.services.task_queue import TaskQueueService, TaskStatus
from app.core.logging import cluster_logger

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


@router.post("/upload-mx3", response_model=Union[TaskQueueJobInDB, Dict[str, Any]])
async def upload_mx3_with_optional_task(
    *,
    db: Session = Depends(get_db),
    file: UploadFile = File(...),
    task_name: str = Form(...),
    auto_start: bool = Form(False),
    partition: str = Form("proxima"),
    num_cpus: int = Form(5),
    memory_gb: int = Form(24),
    num_gpus: int = Form(1),
    time_limit: str = Form("24:00:00"),
    priority: int = Form(0),
    original_path: str = Form(None),
    original_md5: str = Form(None),
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_active_user),
) -> Any:
    """
    Upload MX3 file with optional automatic task creation.
    Jeśli klient przesłał oryginalną ścieżkę i serwer ma dostęp do pliku,
    oraz suma md5 się zgadza, uruchom symulację w folderze oryginalnym.
    """
    import os
    import hashlib
    import uuid

    # Validate file extension
    if not file.filename or not file.filename.endswith(".mx3"):
        raise HTTPException(status_code=400, detail="File must have .mx3 extension")

    # Check file size (limit to 50MB)
    content = await file.read()
    if len(content) > 50 * 1024 * 1024:  # 50MB
        raise HTTPException(status_code=413, detail="File too large (max 50MB)")

    # Calculate MD5
    file_md5 = hashlib.md5(content).hexdigest()

    # Domyślnie używamy tymczasowego folderu
    job_key = str(uuid.uuid4())[:8]
    user_dir_path = f"/mnt/storage_2/scratch/pl0095-01/zelent/tmp/mx3jobs/{current_user.username}_{job_key}"
    file_path = os.path.join(user_dir_path, file.filename)
    use_original = False

    # Sprawdź czy klient przesłał oryginalną ścieżkę i md5
    if original_path and original_md5:
        task_service = TaskQueueService(db)
        host_path = task_service._translate_path(original_path)
        if os.path.exists(host_path):
            try:
                with open(host_path, "rb") as f:
                    local_md5 = hashlib.md5(f.read()).hexdigest()
                if local_md5 == original_md5 and local_md5 == file_md5:
                    # Plik lokalny jest identyczny, użyj oryginalnej ścieżki
                    file_path = host_path
                    use_original = True
            except Exception as e:
                cluster_logger.warning(f"MD5 check failed for {host_path}: {e}")

    try:
        if not use_original:
            # Create directory and save file
            os.makedirs(user_dir_path, exist_ok=True)
            with open(file_path, "wb") as f:
                f.write(content)
            # Verify file integrity
            with open(file_path, "rb") as f:
                saved_md5 = hashlib.md5(f.read()).hexdigest()
            if saved_md5 != file_md5:
                os.remove(file_path)
                os.rmdir(user_dir_path)
                raise HTTPException(
                    status_code=500, detail="File integrity check failed"
                )
        # Jeśli auto_start == False, zwróć info o pliku
        if not auto_start:
            return {
                "job_key": job_key,
                "file_path": file_path,
                "original_filename": file.filename,
                "file_md5": file_md5,
                "file_size": len(content),
                "auto_start": False,
                "used_original": use_original,
                "message": "File uploaded. Create task manually via POST /tasks/",
                "next_steps": [
                    f"POST /tasks/ with simulation_file: {file_path}",
                    "Monitor via GET /tasks/{task_id}",
                    "Download via GET /tasks/{task_id}/download",
                ],
            }
        # Jeśli auto_start == True, utwórz TaskQueueJob
        task_service = TaskQueueService(db)
        from app.schemas.task_queue import TaskQueueJobCreate

        prefixed_task_name = f"amumax_{task_name}"
        task_data = TaskQueueJobCreate(
            name=prefixed_task_name,
            simulation_file=file_path,
            partition=partition,
            num_cpus=num_cpus,
            memory_gb=memory_gb,
            num_gpus=num_gpus,
            time_limit=time_limit,
            priority=priority,
            parameters={
                "uploaded_file": file.filename,
                "file_md5": file_md5,
                "file_size": len(content),
                "job_key": job_key,
                "upload_method": "api_auto_start",
                "used_original": use_original,
                "original_path": original_path,
                "original_md5": original_md5,
            },
        )
        task = task_service.create_task(task_data, current_user.id)
        background_tasks.add_task(task_service._process_queue_once)
        return task
    except Exception as e:
        # Cleanup on error
        if "file_path" in locals() and os.path.exists(file_path) and not use_original:
            os.remove(file_path)
        if (
            "user_dir_path" in locals()
            and os.path.exists(user_dir_path)
            and not use_original
        ):
            try:
                os.rmdir(user_dir_path)
            except OSError:
                pass
        if isinstance(e, HTTPException):
            raise
        raise HTTPException(
            status_code=500, detail=f"Error processing upload: {str(e)}"
        )


@router.post("/validate")
def validate_file(
    *,
    db: Session = Depends(get_db),
    request: FileValidationRequest,
    current_user: User = Depends(get_current_active_user),
) -> Dict[str, Any]:
    """
    Validate a simulation file before creating a task.

    This endpoint works for all file types (.mx3, .py, etc.)
    Returns detailed validation info including file content for preview.
    """
    task_service = TaskQueueService(db)

    validation_result = task_service.validate_file(request.file_path)

    return validation_result


@router.get("/file-content")
def get_file_content(
    *,
    db: Session = Depends(get_db),
    file_path: str,
    current_user: User = Depends(get_current_active_user),
) -> Dict[str, Any]:
    """
    Get full content of a simulation file for preview.

    This endpoint returns the complete file content with syntax highlighting.
    """
    task_service = TaskQueueService(db)

    try:
        # Translate to host path
        host_path = task_service._translate_path(file_path)

        # Detect file type for syntax highlighting
        file_type = "text"
        if file_path.endswith(".mx3"):
            file_type = "go"  # MX3 uses Go-like syntax
        elif file_path.endswith(".py"):
            file_type = "python"
        elif file_path.endswith(".sh"):
            file_type = "bash"
        elif file_path.endswith(".cpp") or file_path.endswith(".c"):
            file_type = "cpp"
        elif file_path.endswith(".js") or file_path.endswith(".ts"):
            file_type = "javascript"

        # Check if file exists and read content
        from pathlib import Path

        if not Path(host_path).exists():
            raise HTTPException(status_code=404, detail=f"File not found: {file_path}")

        # Read full file content (with reasonable limit)
        file_size = Path(host_path).stat().st_size
        if file_size > 1024 * 1024:  # 1MB limit
            raise HTTPException(
                status_code=413, detail="File too large for preview (max 1MB)"
            )

        with open(host_path, "r", encoding="utf-8", errors="ignore") as f:
            content = f.read()

        return {
            "file_path": file_path,
            "content": content,
            "file_type": file_type,
            "file_size": file_size,
            "lines": len(content.splitlines()),
        }

    except HTTPException:
        raise
    except Exception as e:
        cluster_logger.error(f"Error reading file {file_path}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error reading file: {str(e)}")


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
async def delete_task(
    *,
    db: Session = Depends(get_db),
    task_id: str,  # Always a string from path parameter
    current_user: User = Depends(get_current_active_user),
) -> Dict[str, str]:
    """
    Delete a task from the queue.
    """
    task_service = TaskQueueService(db)

    # Try to convert to integer if it's a numeric string
    parsed_id: Union[str, int] = task_id
    if task_id.isdigit():
        parsed_id = int(task_id)

    # Service handles all exceptions internally and raises HTTPException
    await task_service.delete_task(parsed_id, current_user.id)
    return {"message": "Task deleted successfully"}


@router.get("/{task_id}/results", response_model=SimulationResult)
async def get_task_results(
    *,
    db: Session = Depends(get_db),
    task_id: str,  # Always a string from path parameter
    current_user: User = Depends(get_current_active_user),
) -> Any:
    """
    Get results for a completed task.
    """
    task_service = TaskQueueService(db)

    # Try to convert to integer if it's a numeric string
    parsed_id: Union[str, int] = task_id
    if task_id.isdigit():
        parsed_id = int(task_id)

    task = task_service.get_task(parsed_id)

    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if task.owner_id != current_user.id:
        raise HTTPException(
            status_code=403, detail="Not authorized to access this task"
        )

    results = await task_service.get_task_results(task)
    return results


@router.get("/{task_id}/download")
async def download_task_results(
    *,
    db: Session = Depends(get_db),
    task_id: str,
    current_user: User = Depends(get_current_active_user),
) -> Any:
    """
    Download packaged results for a completed task as ZIP archive.

    Returns a downloadable ZIP file containing all simulation results
    with MD5 verification.
    """
    from fastapi.responses import FileResponse
    import zipfile
    import tempfile
    import hashlib
    import os
    from pathlib import Path

    task_service = TaskQueueService(db)

    # Try to convert to integer if it's a numeric string
    parsed_id: Union[str, int] = task_id
    if task_id.isdigit():
        parsed_id = int(task_id)

    task = task_service.get_task(parsed_id)

    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if task.owner_id != current_user.id:
        raise HTTPException(
            status_code=403, detail="Not authorized to access this task"
        )

    if task.status != "COMPLETED":
        raise HTTPException(
            status_code=400, detail=f"Task not completed (status: {task.status})"
        )

    # Check if output directory exists (translate path if needed)
    output_dir = task.output_dir
    if not output_dir:
        raise HTTPException(
            status_code=404, detail="Results not found - no output directory configured"
        )

    # Translate path for host filesystem access
    host_output_dir = task_service._translate_path(output_dir)
    if not os.path.exists(host_output_dir):
        raise HTTPException(
            status_code=404, detail="Results not found or have been cleaned up"
        )

    try:
        # Create temporary ZIP file
        with tempfile.NamedTemporaryFile(delete=False, suffix=".zip") as temp_zip:
            with zipfile.ZipFile(temp_zip.name, "w", zipfile.ZIP_DEFLATED) as zf:
                # Add all files from output directory (use translated path)
                output_path = Path(host_output_dir)
                for file_path in output_path.rglob("*"):
                    if file_path.is_file():
                        # Create relative path within ZIP
                        arc_name = file_path.relative_to(output_path)
                        zf.write(file_path, arc_name)

                # Add metadata file
                metadata = {
                    "task_id": task.task_id,
                    "task_name": task.name,
                    "simulation_file": task.simulation_file,
                    "status": task.status,
                    "created_at": task.created_at.isoformat(),
                    "completed_at": task.finished_at.isoformat()
                    if task.finished_at
                    else None,
                    "parameters": task.parameters,
                }

                import json

                zf.writestr("task_metadata.json", json.dumps(metadata, indent=2))

        # Calculate MD5 of the ZIP file
        with open(temp_zip.name, "rb") as f:
            zip_md5 = hashlib.md5(f.read()).hexdigest()

        # Create filename
        safe_task_name = "".join(
            c for c in task.name if c.isalnum() or c in (" ", "-", "_")
        ).strip()
        safe_task_name = safe_task_name.replace(" ", "_")
        filename = f"{safe_task_name}_{task.task_id}_results.zip"

        # Return file with MD5 in headers
        return FileResponse(
            temp_zip.name,
            media_type="application/zip",
            filename=filename,
            headers={
                "X-File-MD5": zip_md5,
                "X-Content-Length": str(os.path.getsize(temp_zip.name)),
            },
        )

    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error creating download archive: {str(e)}"
        )


@router.post("/{task_id}/cancel")
async def cancel_task(
    *,
    db: Session = Depends(get_db),
    task_id: str,  # Always a string from path parameter
    current_user: User = Depends(get_current_active_user),
) -> Dict[str, str]:
    """
    Cancel a task that is pending or running.
    """
    task_service = TaskQueueService(db)

    # Try to convert to integer if it's a numeric string
    parsed_id: Union[str, int] = task_id
    if task_id.isdigit():
        parsed_id = int(task_id)

    success = await task_service.cancel_task(parsed_id, current_user.id)

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


@router.get("/active", response_model=List[TaskQueueJobInDB])
def get_active_tasks(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> Any:
    """
    Get active tasks (PENDING, CONFIGURING, RUNNING) for the current user.
    This endpoint is equivalent to /jobs/active-jobs but for task_queue.
    """
    task_service = TaskQueueService(db)
    active_statuses = ["PENDING", "CONFIGURING", "RUNNING"]

    # Get tasks with active status
    active_tasks = []
    for status_filter in active_statuses:
        tasks = task_service.get_tasks(
            current_user.id, status=status_filter, skip=0, limit=100
        )
        active_tasks.extend(tasks)

    cluster_logger.debug(
        f"Found {len(active_tasks)} active tasks for user {current_user.username}"
    )

    return active_tasks


@router.post("/{task_id}/refresh-details")
async def refresh_task_details(
    *,
    db: Session = Depends(get_db),
    task_id: str,
    current_user: User = Depends(get_current_active_user),
) -> Any:
    """
    Refresh SLURM details for a specific task on demand.
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

    if not task.slurm_job_id:
        raise HTTPException(status_code=400, detail="Task has no SLURM job ID")

    try:
        from app.services.slurm_detail_fetcher import get_slurm_detail_fetcher

        detail_fetcher = get_slurm_detail_fetcher()
        await detail_fetcher.trigger_immediate_fetch(
            task.slurm_job_id, task.task_id, "on_demand_api"
        )

        # Refresh task from database to get updated logs
        db.refresh(task)

        return {
            "message": "Details refresh triggered successfully",
            "task_id": task.task_id,
            "slurm_job_id": task.slurm_job_id,
            "logs_updated": bool(task.logs),
        }

    except Exception as e:
        cluster_logger.error(f"Error refreshing details for task {task_id}: {e}")
        raise HTTPException(
            status_code=500, detail=f"Error refreshing task details: {str(e)}"
        )


@router.get("/{task_id}/output")
async def get_task_output(
    *,
    db: Session = Depends(get_db),
    task_id: str,  # Always a string from path parameter
    current_user: User = Depends(get_current_active_user),
) -> Dict[str, Any]:
    """
    Get SLURM output logs for a task.
    """
    task_service = TaskQueueService(db)

    # Try to convert to integer if it's a numeric string
    parsed_id: Union[str, int] = task_id
    if task_id.isdigit():
        parsed_id = int(task_id)

    return await task_service.get_task_output(parsed_id, current_user.id)


@router.get("/{task_id}/log")
async def get_task_log(
    *,
    db: Session = Depends(get_db),
    task_id: str,
    current_user: User = Depends(get_current_active_user),
) -> Dict[str, Any]:
    """Get log content for a task."""
    task_service = TaskQueueService(db)

    # Try to convert to integer if it's a numeric string
    parsed_id: Union[str, int] = task_id
    if task_id.isdigit():
        parsed_id = int(task_id)

    task = task_service.get_task_by_id(parsed_id, current_user.id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    try:
        # Use slurm_job_id if available, otherwise use task_id
        lookup_id = task.slurm_job_id if task.slurm_job_id else str(task.id)

        if not lookup_id:
            return {
                "task_id": task_id,
                "internal_id": task.id,
                "slurm_job_id": task.slurm_job_id,
                "log_content": "",
                "message": "No SLURM job ID available for this task",
                "has_content": False,
            }

        log_content = task_service.get_task_log(lookup_id, "out")

        if log_content is None:
            return {
                "task_id": task_id,
                "internal_id": task.id,
                "slurm_job_id": task.slurm_job_id,
                "log_content": "",
                "message": "Log file not found or not yet created",
                "has_content": False,
            }

        return {
            "task_id": task_id,
            "internal_id": task.id,
            "slurm_job_id": task.slurm_job_id,
            "log_content": log_content,
            "message": "Log retrieved successfully",
            "has_content": True,
            "content_length": len(log_content),
        }

    except Exception as e:
        cluster_logger.error(f"Error getting log for task {task_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to retrieve task log")


@router.get("/{task_id}/error")
async def get_task_error(
    *,
    db: Session = Depends(get_db),
    task_id: str,
    current_user: User = Depends(get_current_active_user),
) -> Dict[str, Any]:
    """Get error log content for a task."""
    task_service = TaskQueueService(db)

    # Try to convert to integer if it's a numeric string
    parsed_id: Union[str, int] = task_id
    if task_id.isdigit():
        parsed_id = int(task_id)

    task = task_service.get_task_by_id(parsed_id, current_user.id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    try:
        # Use slurm_job_id if available, otherwise use task_id
        lookup_id = task.slurm_job_id if task.slurm_job_id else str(task.id)

        if not lookup_id:
            return {
                "task_id": task_id,
                "internal_id": task.id,
                "slurm_job_id": task.slurm_job_id,
                "error_content": "",
                "message": "No SLURM job ID available for this task",
                "has_content": False,
            }

        error_content = task_service.get_task_error(lookup_id)

        if error_content is None:
            return {
                "task_id": task_id,
                "internal_id": task.id,
                "slurm_job_id": task.slurm_job_id,
                "error_content": "",
                "message": "Error file not found or not yet created",
                "has_content": False,
            }

        return {
            "task_id": task_id,
            "internal_id": task.id,
            "slurm_job_id": task.slurm_job_id,
            "error_content": error_content,
            "message": "Error log retrieved successfully",
            "has_content": True,
            "content_length": len(error_content),
        }

    except Exception as e:
        cluster_logger.error(f"Error getting error log for task {task_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to retrieve task error log")
