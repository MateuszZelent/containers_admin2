from typing import List, Optional, Dict, Any, Union, Tuple
from datetime import datetime, timedelta, timezone
import uuid
import json
import asyncio
import os
from pathlib import Path
import logging
from enum import Enum
import traceback
from concurrent.futures import ThreadPoolExecutor

from sqlalchemy.orm import Session
from sqlalchemy import func, desc, asc
from fastapi import HTTPException, BackgroundTasks, status
from pydantic import UUID4, ValidationError

from app.db.models import TaskQueueJob, User
from app.schemas.task_queue import (
    TaskQueueJobCreate,
    TaskQueueJobUpdate,
    TaskQueueStatus,
    SimulationResult,
)
from app.services.slurm import SlurmSSHService
from app.core.logging import cluster_logger, slurm_logger
from app.core.config import settings


class TaskStatus(str, Enum):
    """Enumeration of possible task statuses."""

    PENDING = "PENDING"  # Initial state, job is queued locally
    CONFIGURING = "CONFIGURING"  # Job submitted to SLURM, waiting for resources
    RUNNING = "RUNNING"  # Job is actively running on SLURM
    COMPLETED = "COMPLETED"  # Job finished successfully
    ERROR = "ERROR"  # Job failed
    ERROR_RETRY_1 = "ERROR_RETRY_1"  # Job failed, first retry
    ERROR_RETRY_2 = "ERROR_RETRY_2"  # Job failed, second retry
    ERROR_RETRY_3 = "ERROR_RETRY_3"  # Job failed, third retry
    CANCELLED = "CANCELLED"  # Job was cancelled by user
    TIMEOUT = "TIMEOUT"  # Job exceeded time limit
    UNKNOWN = "UNKNOWN"  # Unknown or unrecognized state


class TaskQueueService:
    """Service for managing simulation task queue and SLURM job submissions."""

    # Mapping from SLURM job states to our task states
    SLURM_STATE_MAPPING = {
        # Pending states - waiting in queue
        "PD": TaskStatus.PENDING,  # Pending (waiting in queue)
        "PENDING": TaskStatus.PENDING,  # Full name version
        # Configuring states - resources allocated, preparing to run
        "CF": TaskStatus.CONFIGURING,  # Configuring
        "CONFIGURING": TaskStatus.CONFIGURING,  # Full name version
        "ST": TaskStatus.CONFIGURING,  # Starting
        "S": TaskStatus.CONFIGURING,  # Suspended
        # Running states
        "R": TaskStatus.RUNNING,  # Running
        "RUNNING": TaskStatus.RUNNING,  # Full name version
        "CG": TaskStatus.RUNNING,  # Completing
        # Completed states
        "CD": TaskStatus.COMPLETED,  # Completed
        "COMPLETED": TaskStatus.COMPLETED,  # Full name version
        "F": TaskStatus.ERROR,  # Failed
        "FAILED": TaskStatus.ERROR,  # Full name version
        "CA": TaskStatus.CANCELLED,  # Cancelled
        "CANCELLED": TaskStatus.CANCELLED,  # Full name version
        "TO": TaskStatus.TIMEOUT,  # Timeout
        "TIMEOUT": TaskStatus.TIMEOUT,  # Full name version
    }

    # Time to wait before retrying a failed job
    RETRY_DELAYS = [
        timedelta(minutes=5),  # First retry after 5 minutes
        timedelta(minutes=30),  # Second retry after 30 minutes
        timedelta(hours=2),  # Third retry after 2 hours
    ]

    def __init__(self, db: Session):
        """Initialize task queue service with database session."""
        self.db = db
        self.slurm_service = SlurmSSHService()
        self._executor = ThreadPoolExecutor(max_workers=5)
        self._monitor_lock = None  # Initialize as None, create lazily when needed
        self._is_monitoring = False
        self._job_monitors = {}  # Track individual job monitors
        self._detail_fetcher = None  # Will be set after initialization

    def set_detail_fetcher(self, detail_fetcher):
        """Set the SLURM detail fetcher reference."""
        self._detail_fetcher = detail_fetcher

    def _get_monitor_lock(self):
        """Get the monitor lock lazily, only when needed in an async context."""
        if self._monitor_lock is None:
            try:
                # Only create the lock when we're in an async context
                loop = asyncio.get_running_loop()
                self._monitor_lock = asyncio.Lock()
            except RuntimeError:
                # We're not in an async context, so we'll handle this case
                # by returning None and checking for it later
                pass
        return self._monitor_lock

    def get_task(self, task_id: Union[str, int]) -> Optional[TaskQueueJob]:
        """Get a task by ID or task_id."""
        if isinstance(task_id, int):
            return (
                self.db.query(TaskQueueJob).filter(TaskQueueJob.id == task_id).first()
            )
        return (
            self.db.query(TaskQueueJob).filter(TaskQueueJob.task_id == task_id).first()
        )

    def get_tasks(
        self,
        owner_id: int,
        status: Optional[str] = None,
        skip: int = 0,
        limit: int = 100,
    ) -> List[TaskQueueJob]:
        """Get tasks for a user, optionally filtered by status."""
        query = self.db.query(TaskQueueJob).filter(TaskQueueJob.owner_id == owner_id)

        if status:
            query = query.filter(TaskQueueJob.status == status)

        return (
            query.order_by(TaskQueueJob.priority.desc(), TaskQueueJob.created_at.asc())
            .offset(skip)
            .limit(limit)
            .all()
        )

    def _translate_path(self, filepath: str) -> str:
        """
        Translate container paths to host filesystem paths.

        This handles the virtual mount mapping differences between container and host.
        """
        # Define the path prefix mapping
        container_prefix = "/mnt/local/kkingstoun/admin/pcss_storage/mannga"
        host_prefix = "/mnt/storage_2/scratch/pl0095-01/zelent/mannga"

        # Check if this is a container path that needs translation
        if filepath and filepath.startswith(
            "/mnt/local/kkingstoun/admin/pcss_storage/mannga"
        ):
            # Replace the prefix with the host prefix
            translated_path = filepath.replace(
                "/mnt/local/kkingstoun/admin/pcss_storage/mannga",
                "/mnt/storage_2/scratch/pl0095-01/zelent/mannga",
                1,  # Replace only the first occurrence
            )
            cluster_logger.debug(f"Translated path: {filepath} -> {translated_path}")
            return translated_path

        return filepath

    def _detect_task_type(self, simulation_file: str) -> str:
        """
        Detect task type based on simulation file extension.
        
        Args:
            simulation_file: Path to the simulation file
            
        Returns:
            str: Task type ('amumax' for .mx3 files, 'general' for others)
        """
        if simulation_file.endswith('.mx3'):
            return 'amumax'
        return 'general'

    def _validate_task_by_type(self, task_type: str, simulation_file: str) -> None:
        """
        Validate task based on its type.
        
        Args:
            task_type: Type of task ('amumax' or 'general')
            simulation_file: Path to simulation file
            
        Raises:
            HTTPException: If validation fails
        """
        if task_type == 'amumax':
            if not simulation_file.endswith('.mx3'):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Amumax tasks require .mx3 simulation files"
                )

    def validate_file(self, file_path: str) -> Dict[str, Any]:
        """
        Validate if the simulation file is properly formatted and accessible.
        
        Args:
            file_path: Path to the simulation file
            
        Returns:
            Dict with validation results including file type, existence, content
        """
        try:
            # Translate to host path for validation
            host_path = self._translate_path(file_path)
            
            # Detect file type
            file_type = "other"
            if file_path.endswith('.mx3'):
                file_type = "amumax"
            elif file_path.endswith('.py'):
                file_type = "python"
            
            # Check if file exists and is readable
            file_exists = False
            file_content = None
            file_size = None
            
            try:
                if Path(host_path).exists():
                    file_exists = True
                    file_size = Path(host_path).stat().st_size
                    
                    # Read file content for preview (limit to 5000 chars)
                    with open(
                        host_path, 'r', encoding='utf-8', errors='ignore'
                    ) as f:
                        file_content = f.read(5000)
                        
            except Exception as read_error:
                cluster_logger.warning(
                    f"Error reading file {host_path}: {str(read_error)}"
                )
            
            # Basic validation based on file type
            is_valid = file_exists
            validation_message = "File is valid and accessible"
            
            if not file_exists:
                validation_message = "File not found"
                is_valid = False
            elif file_type == "amumax" and file_content :
                # Basic Amumax file validation
                required_keywords = ['setgridsize', 'setcellsize', 'run']
                if not any(kw in file_content.lower() for kw in required_keywords):
                    validation_message = (
                        "File may not be a valid Amumax script "
                        "(missing basic commands)"
                    )
                    is_valid = False
            elif file_type == "python" and file_content:
                # Basic Python file validation
                if not file_content.strip():
                    validation_message = "Python file appears to be empty"
                    is_valid = False
            
            return {
                "is_valid": is_valid,
                "message": validation_message,
                "file_type": file_type,
                "file_exists": file_exists,
                "file_size": file_size,
                "file_content": file_content[:2000] if file_content else None,
                "file_path": file_path,
                "host_path": host_path
            }
            
        except Exception as e:
            cluster_logger.warning(
                f"Error validating file {file_path}: {str(e)}"
            )
            return {
                "is_valid": False,
                "message": f"Error validating file: {str(e)}",
                "file_type": "unknown",
                "file_exists": False,
                "file_size": None,
                "file_content": None,
                "file_path": file_path,
                "host_path": None
            }

    def create_task(
        self, data: TaskQueueJobCreate, owner_id: int
    ) -> TaskQueueJob:
        """Create a new task in the queue."""
        try:
            # Detect task type based on simulation file
            task_type = self._detect_task_type(data.simulation_file)
            
            # Validate task based on its type
            self._validate_task_by_type(task_type, data.simulation_file)

            # Generate unique task ID
            task_id = f"task_{uuid.uuid4().hex[:8]}"

            # Create output directory path based on username and task ID
            user = self.db.query(User).filter(User.id == owner_id).first()
            if not user:
                raise ValueError(f"Owner ID {owner_id} not found")

            username = user.username
            output_dir = os.path.join(
                settings.SIMULATION_OUTPUT_DIR, username, task_id
            )

            # Store the original simulation file path from container
            original_sim_file = data.simulation_file

            # Translate the path for host filesystem operations
            host_sim_file = self._translate_path(original_sim_file)

            # Create task object - store both original and host paths
            task = TaskQueueJob(
                task_id=task_id,
                name=data.name or f"Simulation_{task_id}",
                # Store original path for container use
                simulation_file=original_sim_file,
                # Store host path for filesystem operations
                host_file_path=host_sim_file,
                parameters=data.parameters,
                status=TaskStatus.PENDING,
                partition=data.partition,
                num_cpus=data.num_cpus,
                memory_gb=data.memory_gb,
                num_gpus=data.num_gpus,
                time_limit=data.time_limit,
                output_dir=output_dir,
                priority=data.priority,
                owner_id=owner_id,
            )

            # Save to database
            self.db.add(task)
            self.db.commit()
            self.db.refresh(task)

            # Log task creation
            cluster_logger.info(
                f"Task created: {task_id} for user {username} with priority {data.priority}"
            )

            return task

        except Exception as e:
            self.db.rollback()
            cluster_logger.error(f"Error creating task: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Error creating task: {str(e)}",
            )

    def update_task(
        self, task_id: Union[str, int], update_data: TaskQueueJobUpdate
    ) -> Optional[TaskQueueJob]:
        """Update task information."""
        task = self.get_task(task_id)
        if not task:
            return None

        try:
            # Store old status for state change detection
            old_status = task.status.value if task.status else None
            
            # Apply updates
            update_dict = update_data.dict(exclude_unset=True)
            for key, value in update_dict.items():
                setattr(task, key, value)

            # Handle status change timestamps
            if "status" in update_dict:
                new_status = update_dict["status"]
                if new_status == TaskStatus.RUNNING and not task.started_at:
                    task.started_at = datetime.now(timezone.utc)
                elif new_status in [
                    TaskStatus.COMPLETED,
                    TaskStatus.ERROR,
                    TaskStatus.ERROR_RETRY_3,
                    TaskStatus.CANCELLED,
                ]:
                    task.finished_at = datetime.now(timezone.utc)

            # Update the task
            self.db.add(task)
            self.db.commit()
            self.db.refresh(task)

            # Log update
            cluster_logger.info(f"Task {task.task_id} updated: {update_dict}")

            # Trigger detail fetcher on status change if available
            if "status" in update_dict and self._detail_fetcher:
                new_status = update_dict["status"]
                if new_status != old_status:
                    try:
                        # Run the state change handler asynchronously
                        import asyncio
                        loop = asyncio.get_event_loop()
                        if loop.is_running():
                            asyncio.create_task(
                                self._detail_fetcher.on_job_state_change(
                                    task.task_id, old_status, new_status.value
                                )
                            )
                        else:
                            # If no event loop is running, schedule for later
                            cluster_logger.debug(
                                f"No event loop running, "
                                f"detail fetch skipped for task {task.task_id}"
                            )
                    except Exception as e:
                        cluster_logger.warning(
                            f"Error triggering detail fetch "
                            f"for task {task.task_id}: {e}"
                        )

            return task

        except Exception as e:
            self.db.rollback()
            cluster_logger.error(f"Error updating task {task_id}: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Error updating task: {str(e)}",
            )

    async def delete_task(self, task_id: Union[str, int], owner_id: int) -> None:
        """Delete a task from the queue."""
        try:
            task = self.get_task(task_id)
            if not task:
                cluster_logger.warning(f"Task {task_id} not found for deletion")
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Task not found"
                )

            # Check ownership
            if task.owner_id != owner_id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Not authorized to delete this task",
                )

            # For running tasks, cancel them first in SLURM
            if task.status in [TaskStatus.CONFIGURING, TaskStatus.RUNNING]:
                cluster_logger.info(
                    f"Deleting running task {task.task_id} - cancelling in SLURM first"
                )
                try:
                    # Cancel in SLURM if job_id exists
                    if task.slurm_job_id:
                        cancel_success = await self.slurm_service.cancel_job(task.slurm_job_id)
                        if cancel_success:
                            cluster_logger.info(f"Successfully cancelled SLURM job {task.slurm_job_id}")
                        else:
                            cluster_logger.warning(f"Failed to cancel SLURM job {task.slurm_job_id}")
                    
                    # Update status to cancelled
                    task.status = TaskStatus.CANCELLED
                    task.finished_at = datetime.now(timezone.utc)
                    self.db.commit()
                except Exception as e:
                    self.db.rollback()
                    cluster_logger.error(
                        f"Error cancelling task in SLURM before deletion: {str(e)}"
                    )
                    # Continue with deletion even if SLURM cancel fails

            # Delete from database
            self.db.delete(task)
            self.db.commit()
            cluster_logger.info(
                f"Task {task.task_id} deleted by user {owner_id}"
            )
            
        except HTTPException:
            # Re-raise HTTP exceptions
            raise
        except Exception as e:
            self.db.rollback()
            cluster_logger.error(f"Error deleting task {task_id}: {str(e)}")
            cluster_logger.error(f"Traceback: {traceback.format_exc()}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to delete task: {str(e)}"
            )

    def get_queue_status(self, owner_id: Optional[int] = None) -> TaskQueueStatus:
        """Get the current status of the task queue."""
        query = self.db.query(TaskQueueJob)

        if owner_id:
            query = query.filter(TaskQueueJob.owner_id == owner_id)

        # Count tasks by status
        status_counts = {}
        for status_enum in TaskStatus:
            count = query.filter(TaskQueueJob.status == status_enum).count()
            status_counts[status_enum.value] = count

        # Get total count
        total_count = sum(status_counts.values())

        # Calculate average wait time for pending tasks
        pending_tasks = query.filter(TaskQueueJob.status == TaskStatus.PENDING).all()

        avg_wait_time = None
        if pending_tasks:
            wait_times = []
            now = datetime.now(timezone.utc)
            for task in pending_tasks:
                # Handle both timezone-aware and timezone-naive datetimes
                created_at = task.created_at
                if created_at.tzinfo is None:
                    # If timezone-naive, assume UTC
                    created_at = created_at.replace(tzinfo=timezone.utc)
                
                wait_time = (now - created_at).total_seconds()
                wait_times.append(wait_time)
            avg_wait_time = sum(wait_times) / len(wait_times) if wait_times else 0

        # Get the next task to be processed
        next_task = (
            query.filter(TaskQueueJob.status == TaskStatus.PENDING)
            .order_by(TaskQueueJob.priority.desc(), TaskQueueJob.created_at.asc())
            .first()
        )

        return TaskQueueStatus(
            total_tasks=total_count,
            status_counts=status_counts,
            avg_wait_time=avg_wait_time,
            next_task_id=next_task.task_id if next_task else None,
            active_worker_count=len(self._job_monitors),
        )

    async def submit_task_to_slurm(self, task: TaskQueueJob) -> bool:
        """Submit a task to SLURM."""
        try:
            # Generate the SLURM submission script
            script_content = await self._generate_submission_script(task)

            # Get username for submission
            user = self.db.query(User).filter(User.id == task.owner_id).first()
            if not user:
                raise ValueError(f"Owner ID {task.owner_id} not found")

            # Submit to SLURM
            slurm_job_id = await self.slurm_service.submit_job(
                script_content, user.username
            )

            if not slurm_job_id:
                raise ValueError("Failed to get SLURM job ID")

            # Update task with SLURM job ID and status
            task.slurm_job_id = slurm_job_id
            task.status = TaskStatus.CONFIGURING
            task.submitted_at = datetime.now(timezone.utc)
            self.db.add(task)
            self.db.commit()

            # Log successful submission
            cluster_logger.info(
                f"Task {task.task_id} submitted to SLURM with job ID {slurm_job_id}"
            )

            # Start monitoring this specific job
            self._start_job_monitor(task.id, slurm_job_id)

            return True

        except Exception as e:
            # Log the error
            cluster_logger.error(
                f"Error submitting task {task.task_id} to SLURM: {str(e)}\n"
                f"{traceback.format_exc()}"
            )

            # Update task status to error
            task.status = TaskStatus.ERROR
            task.error_message = f"Submission error: {str(e)}"
            self.db.add(task)
            self.db.commit()

            return False

    async def _generate_submission_script(self, task: TaskQueueJob) -> str:
        """Generate a SLURM submission script for a simulation task."""
        try:
            # Get user info for loginname
            user = self.db.query(User).filter(User.id == task.owner_id).first()
            if not user:
                raise ValueError(f"Owner ID {task.owner_id} not found")

            # Validate the simulation file path
            if not task.simulation_file:
                raise ValueError("Simulation file path is required")

            # Detect task type and choose appropriate template
            task_type = self._detect_task_type(task.simulation_file)
            
            if task_type == 'amumax':
                template_name = "amumax.template"
                # Parameters for Amumax template
                params = {
                    "job_name": f"amumax_{task.task_id}_{user.username}",
                    "num_cpus": str(task.num_cpus),
                    "memory_gb": str(task.memory_gb),
                    "num_gpus": str(task.num_gpus),
                    "user": str(user.username),
                    "time_limit": task.time_limit,
                    "partition": task.partition,
                    # Required by template for container binds
                    "loginname": user.username,
                    # Compatibility with existing templates
                    "loggin_name": user.username,
                    # Path to .mx3 file inside container
                    "simulation_file": task.simulation_file,
                }
            else:
                # For general tasks, use a different template or default
                template_name = "general.template"  # Create this if needed
                params = {
                    "job_name": f"sim_{task.task_id}_{user.username}",
                    "num_cpus": str(task.num_cpus),
                    "memory_gb": str(task.memory_gb),
                    "num_gpus": str(task.num_gpus),
                    "user": str(user.username),
                    "time_limit": task.time_limit,
                    "partition": task.partition,
                    "loginname": user.username,
                    "simulation_file": task.simulation_file,
                }

            # Log the parameters for debugging
            cluster_logger.debug(
                f"Generating SLURM script for task {task.task_id} "
                f"(type: {task_type}) with parameters: {params}"
            )

            # Fill the template
            script_content = await self.slurm_service.fill_template(
                template_name, params
            )

            # Log successful script generation
            cluster_logger.info(
                f"Successfully generated SLURM script for Amumax "
                f"simulation task {task.task_id}"
            )

            return script_content

        except Exception as e:
            cluster_logger.error(
                f"Error generating submission script for task {task.task_id}: "
                f"{str(e)}\n{traceback.format_exc()}"
            )
            raise

    async def start_queue_processor(self, background_tasks: BackgroundTasks):
        """Start the queue processor in the background."""
        background_tasks.add_task(self._process_queue_continuously)
        return {"message": "Task queue processor started"}

    async def _process_queue_continuously(self):
        """Process the queue continuously in the background."""
        while True:
            try:
                # Get the lock safely
                lock = self._get_monitor_lock()
                if lock:
                    async with lock:
                        if not self._is_monitoring:
                            self._is_monitoring = True
                else:
                    # No lock available, use a simple flag instead
                    if not self._is_monitoring:
                        self._is_monitoring = True

                # Process the queue once
                await self._process_queue_once()

                # Process retries
                await self._process_retries()

                # Wait before next cycle
                await asyncio.sleep(60)  # Check queue every minute

            except Exception as e:
                cluster_logger.error(f"Error in queue processor: {str(e)}")
                await asyncio.sleep(30)  # Short sleep on error

            finally:
                self._is_monitoring = False

    async def _process_queue_once(self):
        """Process the queue once, submitting pending tasks to SLURM."""
        # Get pending tasks ordered by priority and creation time
        pending_tasks = (
            self.db.query(TaskQueueJob)
            .filter(TaskQueueJob.status == TaskStatus.PENDING)
            .order_by(TaskQueueJob.priority.desc(), TaskQueueJob.created_at.asc())
            .limit(10)
            .all()
        )  # Process 10 tasks at a time

        for task in pending_tasks:
            # Submit to SLURM
            success = await self.submit_task_to_slurm(task)
            if not success:
                # If submission failed, log and continue with next task
                cluster_logger.error(f"Failed to submit task {task.task_id}")
                continue

    async def _process_retries(self):
        """Process failed tasks that need to be retried."""
        # Get tasks that need retry and are past their retry time
        now = datetime.now(timezone.utc)
        retry_tasks = (
            self.db.query(TaskQueueJob)
            .filter(
                TaskQueueJob.status.in_(
                    [
                        TaskStatus.ERROR,
                        TaskStatus.ERROR_RETRY_1,
                        TaskStatus.ERROR_RETRY_2,
                    ]
                ),
                TaskQueueJob.next_retry_at.isnot(None),
            )
            .all()
        )
        
        # Filter tasks that are past their retry time, handling timezone issues
        filtered_retry_tasks = []
        for task in retry_tasks:
            if task.next_retry_at:
                next_retry_at = task.next_retry_at
                if next_retry_at.tzinfo is None:
                    # If timezone-naive, assume UTC
                    next_retry_at = next_retry_at.replace(tzinfo=timezone.utc)
                if next_retry_at <= now:
                    filtered_retry_tasks.append(task)
        
        retry_tasks = filtered_retry_tasks

        for task in retry_tasks:
            # Determine next retry status
            if task.status == TaskStatus.ERROR:
                next_status = TaskStatus.ERROR_RETRY_1
                delay_index = 0
            elif task.status == TaskStatus.ERROR_RETRY_1:
                next_status = TaskStatus.ERROR_RETRY_2
                delay_index = 1
            else:  # ERROR_RETRY_2
                next_status = TaskStatus.ERROR_RETRY_3
                delay_index = 2

            # Store previous attempt info if we have a SLURM job ID
            if task.slurm_job_id:
                previous_attempts = task.previous_attempts or []
                previous_attempts.append(
                    {
                        "slurm_job_id": task.slurm_job_id,
                        "status": task.status,
                        "error_message": task.error_message,
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    }
                )
                task.previous_attempts = previous_attempts

            # Reset for retry
            task.status = TaskStatus.PENDING
            task.slurm_job_id = None
            task.retry_count += 1
            task.error_message = None
            task.next_retry_at = None

            # Update in database
            self.db.add(task)
            self.db.commit()

            retry_msg = (
                f"Task {task.task_id} scheduled for retry "
                f"(attempt {task.retry_count})"
            )
            cluster_logger.info(retry_msg)

    def _start_job_monitor(self, task_id: int, slurm_job_id: str):
        """Start monitoring a specific job."""
        if slurm_job_id in self._job_monitors:
            return  # Already monitoring

        # Create task for monitoring this job
        monitor_task = asyncio.create_task(self._monitor_job(task_id, slurm_job_id))

        # Store reference to task
        self._job_monitors[slurm_job_id] = monitor_task

    async def _monitor_job(self, task_id: int, slurm_job_id: str):
        """Monitor a specific job until it completes."""
        try:
            check_interval = 30  # seconds
            task = self.get_task(task_id)

            if not task:
                cluster_logger.error(f"Task {task_id} not found for monitoring")
                return

            # Keep monitoring until job reaches a terminal state
            while True:
                # Use monitoring service instead of direct SLURM calls
                from app.services.slurm_monitor import monitor_service

                # Get job snapshot from monitoring service (cached data)
                job_snapshot = await monitor_service.get_job_snapshot(
                    self.db, slurm_job_id
                )

                if job_snapshot:
                    # Job is still active in SLURM (from cache)
                    if hasattr(job_snapshot, 'state'):
                        slurm_state = job_snapshot.state
                    else:
                        slurm_state = job_snapshot.get('state', 'UNKNOWN')

                    # Map SLURM state to our task state
                    new_status = self.SLURM_STATE_MAPPING.get(
                        slurm_state, TaskStatus.UNKNOWN
                    )

                    # Calculate progress if possible
                    progress = self._estimate_progress(
                        task,
                        {
                            "state": job_snapshot.state,
                            "node": job_snapshot.node,
                            "time_used": job_snapshot.time_used,
                            "time_left": job_snapshot.time_left,
                        },
                    )

                    # Update node info if available
                    node = job_snapshot.node

                    # Update task status
                    if task.status != new_status or (
                        progress is not None and task.progress != progress
                    ):
                        # Prepare update data
                        update_data = {"status": new_status}
                        if progress is not None:
                            update_data["progress"] = progress
                        if node and node != "(None)":
                            update_data["node"] = node

                        # Update task
                        self.update_task(task_id, TaskQueueJobUpdate(**update_data))

                        # Adjust check interval based on status
                        if new_status == TaskStatus.RUNNING:
                            check_interval = 60  # Check running jobs less frequently
                        else:
                            check_interval = (
                                30  # Check configuring jobs more frequently
                            )
                else:
                    # Job is no longer in SLURM's active jobs - need to check its final status
                    # This requires additional SLURM commands (sacct) to get completion info
                    exit_code, final_state = await self._get_job_final_status(
                        slurm_job_id
                    )

                    # Determine our status based on exit code and final state
                    if exit_code == 0 and final_state in ["COMPLETED", "CD"]:
                        new_status = TaskStatus.COMPLETED
                    else:
                        # Determine if we should retry
                        if task.retry_count < 3:
                            # Calculate next retry status
                            if task.retry_count == 0:
                                new_status = TaskStatus.ERROR
                            elif task.retry_count == 1:
                                new_status = TaskStatus.ERROR_RETRY_1
                            else:  # retry_count == 2
                                new_status = TaskStatus.ERROR_RETRY_2

                            # Set the next retry time
                            delay = self.RETRY_DELAYS[task.retry_count]
                            next_retry_at = datetime.now(timezone.utc) + delay

                            # Update task with error info and retry timing
                            self.update_task(
                                task_id,
                                TaskQueueJobUpdate(
                                    status=new_status,
                                    error_message=f"SLURM job failed with exit code {exit_code}, state {final_state}",
                                    exit_code=exit_code,
                                    next_retry_at=next_retry_at,
                                    progress=100
                                    if new_status == TaskStatus.COMPLETED
                                    else task.progress,
                                ),
                            )
                        else:
                            # No more retries
                            self.update_task(
                                task_id,
                                TaskQueueJobUpdate(
                                    status=TaskStatus.ERROR_RETRY_3,
                                    error_message=f"SLURM job failed with exit code {exit_code}, state {final_state} (no more retries)",
                                    exit_code=exit_code,
                                    progress=task.progress,
                                ),
                            )

                    # Monitoring complete
                    break

                # Wait before next check
                await asyncio.sleep(check_interval)

                # Refresh task data
                task = self.get_task(task_id)
                if not task:
                    break

        except Exception as e:
            cluster_logger.error(
                f"Error monitoring job {slurm_job_id} for task {task_id}: {str(e)}\n"
                f"{traceback.format_exc()}"
            )

            # Try to update task status to ERROR
            try:
                self.update_task(
                    task_id,
                    TaskQueueJobUpdate(
                        status=TaskStatus.ERROR,
                        error_message=f"Monitoring error: {str(e)}",
                    ),
                )
            except Exception:
                pass

        finally:
            # Remove from monitoring dict
            if slurm_job_id in self._job_monitors:
                del self._job_monitors[slurm_job_id]

    def _estimate_progress(
        self, task: TaskQueueJob, job_info: Dict[str, Any]
    ) -> Optional[int]:
        """Estimate task progress based on job info."""
        # This is an example - actual implementation will depend on how progress can be tracked
        # For Mumax3 simulations, we might:
        # 1. Parse log files for progress indicators
        # 2. Use time-based estimation (% of time limit used)
        # 3. Check output file growth

        # Placeholder implementation using time-based estimation
        if task.status != TaskStatus.RUNNING or not task.started_at:
            return None

        # Handle both timezone-aware and timezone-naive datetimes
        started_at = task.started_at
        if started_at.tzinfo is None:
            # If timezone-naive, assume UTC
            started_at = started_at.replace(tzinfo=timezone.utc)

        # Calculate based on elapsed time vs time limit
        elapsed = (datetime.now(timezone.utc) - started_at).total_seconds()

        # Parse time limit (format: HH:MM:SS)
        time_parts = task.time_limit.split(":")
        time_limit_seconds = (
            int(time_parts[0]) * 3600  # Hours
            + int(time_parts[1]) * 60  # Minutes
            + int(time_parts[2])  # Seconds
        )

        # Calculate percentage (cap at 99% since we can't be sure it's complete)
        progress = min(int((elapsed / time_limit_seconds) * 100), 99)
        return progress

    async def _get_job_final_status(
        self, slurm_job_id: str
    ) -> Tuple[Optional[int], Optional[str]]:
        """Get the final status of a completed SLURM job."""
        try:
            # Use sacct to get job completion info
            # This is a simplified example - actual implementation would need to parse sacct output
            cmd = f"sacct -j {slurm_job_id} -o State,ExitCode -n -P"
            output = await self.slurm_service._execute_async_command(cmd)

            if not output:
                return None, None

            # Parse the output (format: "STATE|EXITCODE")
            lines = output.strip().split("\n")
            if not lines:
                return None, None

            # Use the first line (should be the job step we're interested in)
            parts = lines[0].split("|")
            if len(parts) < 2:
                return None, None

            state = parts[0].strip()

            # Parse exit code (format: "0:0" meaning [return code]:[signal])
            exit_code_parts = parts[1].split(":")
            exit_code = int(exit_code_parts[0]) if exit_code_parts else None

            return exit_code, state

        except Exception as e:
            cluster_logger.error(
                f"Error getting final status for job {slurm_job_id}: {str(e)}"
            )
            return None, None

    async def get_task_results(self, task: TaskQueueJob) -> Dict[str, Any]:
        """Get results for a completed task."""
        if task.status not in [
            TaskStatus.COMPLETED,
            TaskStatus.ERROR,
            TaskStatus.ERROR_RETRY_1,
            TaskStatus.ERROR_RETRY_2,
            TaskStatus.ERROR_RETRY_3,
            TaskStatus.CANCELLED,
        ]:
            return {
                "task_id": task.task_id,
                "status": task.status,
                "message": "Task has not completed yet",
            }

        # Prepare basic result info
        result = {
            "task_id": task.task_id,
            "status": task.status,
            "started_at": task.started_at.isoformat() if task.started_at else None,
            "finished_at": task.finished_at.isoformat() if task.finished_at else None,
            "elapsed_time": None,
            "output_dir": task.output_dir,
            "results_file": task.results_file,
        }

        # Calculate elapsed time if possible
        if task.started_at and task.finished_at:
            elapsed = (task.finished_at - task.started_at).total_seconds()
            result["elapsed_time"] = elapsed

        # Include error information if task failed
        if task.status in [
            TaskStatus.ERROR,
            TaskStatus.ERROR_RETRY_1,
            TaskStatus.ERROR_RETRY_2,
            TaskStatus.ERROR_RETRY_3,
        ]:
            result["error_message"] = task.error_message
            result["exit_code"] = task.exit_code
            result["retry_count"] = task.retry_count
            result["previous_attempts"] = task.previous_attempts or []

        # Include output files if task completed successfully
        if task.status == TaskStatus.COMPLETED and task.output_dir:
            # Check if the output directory exists - use translated path if needed
            output_dir = self._translate_path(task.output_dir)
            if os.path.exists(output_dir):
                # List all files in the output directory
                output_files = [
                    str(path) for path in Path(output_dir).glob("*") if path.is_file()
                ]
                result["output_files"] = output_files

                # If results file is specified, read it - use translated path
                if task.results_file:
                    results_file = self._translate_path(task.results_file)
                    if os.path.exists(results_file):
                        try:
                            with open(results_file, "r") as f:
                                result["results_data"] = json.load(f)
                        except Exception as e:
                            result["results_error"] = (
                                f"Error reading results file: {str(e)}"
                            )
            else:
                result["output_dir_exists"] = False

        return result

    async def get_amumax_results(self, task: TaskQueueJob) -> Dict[str, Any]:
        """
        Get results for a completed Amumax simulation task.
        
        # This method provides specialized handling for Amumax simulation
        # results, including parsing output files, magnetic field data, and
        # energy plots.
        
        Args:
            task: The completed TaskQueueJob
            
        Returns:
            Dict containing simulation results and file paths
        """
        if task.status != TaskStatus.COMPLETED:
            return {
                "task_id": task.task_id,
                "status": task.status,
                "message": "Amumax simulation has not completed yet",
                "simulation_file": task.simulation_file
            }

        # Get basic results first
        basic_results = await self.get_task_results(task)
        
        # Enhance with Amumax-specific data
        amumax_results = {
            **basic_results,
            "simulation_type": "amumax",
            "mx3_file": task.simulation_file,
        }

        # Look for typical Amumax output files if output directory exists
        if task.output_dir and os.path.exists(self._translate_path(task.output_dir)):
            output_dir = self._translate_path(task.output_dir)
            
            # Common Amumax output file patterns
            output_patterns = {
                "table_files": "*.txt",      # Table files with scalar values
                "ovf_files": "*.ovf",        # OVF magnetization files  
                "zarr_files": "*.zarr",      # Zarr format files
                "log_files": "*.log",        # Log files
                "energy_files": "*energy*",  # Energy-related files
                "field_files": "*field*",    # Field-related files
            }
            
            for file_type, pattern in output_patterns.items():
                matching_files = list(Path(output_dir).glob(pattern))
                if matching_files:
                    amumax_results[file_type] = [
                        str(f) for f in matching_files
                    ]

            # Try to parse table files for key simulation parameters
            table_files = amumax_results.get("table_files", [])
            if table_files:
                # Parse the main table file (usually the first one)
                try:
                    main_table = table_files[0]
                    amumax_results["main_table_data"] = self._parse_amumax_table(
                        main_table
                    )
                except Exception as e:
                    cluster_logger.warning(
                        f"Could not parse Amumax table file: {str(e)}"
                    )

        return amumax_results

    def _parse_amumax_table(self, table_file_path: str) -> Dict[str, Any]:
        """
        Parse an Amumax table file to extract key simulation data.
        
        Args:
            table_file_path: Path to the .txt table file
            
        Returns:
            Dict containing parsed data
        """
        try:
            import pandas as pd
            
            # Read the table file (typically space-separated)
            df = pd.read_csv(table_file_path, sep=r'\s+', comment='#')
            
            # Extract basic statistics
            table_info = {
                "total_steps": len(df),
                "columns": list(df.columns),
                "time_range": {
                    "start": float(df.iloc[0, 0]) if len(df) > 0 else 0,
                    "end": float(df.iloc[-1, 0]) if len(df) > 0 else 0
                } if 't' in df.columns or df.columns[0].lower().startswith('t') else None,
                "final_values": {}
            }
            
            # Extract final values for each column
            if len(df) > 0:
                for col in df.columns:
                    try:
                        table_info["final_values"][col] = float(df[col].iloc[-1])
                    except (ValueError, TypeError):
                        table_info["final_values"][col] = str(df[col].iloc[-1])
            
            return table_info
            
        except ImportError:
            cluster_logger.warning(
                "pandas not available for parsing Amumax table files"
            )
            return {"error": "pandas not available for table parsing"}
        except Exception as e:
            cluster_logger.error(
                f"Error parsing Amumax table file {table_file_path}: {str(e)}"
            )
            return {"error": f"Failed to parse table file: {str(e)}"}

    async def cancel_task(self, task_id: Union[str, int], owner_id: int) -> bool:
        """Cancel a running task."""
        task = self.get_task(task_id)
        if not task:
            return False

        # Check ownership
        if task.owner_id != owner_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized to cancel this task",
            )

        # Can only cancel tasks that are PENDING, CONFIGURING, or RUNNING
        if task.status not in [
            TaskStatus.PENDING,
            TaskStatus.CONFIGURING,
            TaskStatus.RUNNING,
        ]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot cancel task with status {task.status}",
            )

        try:
            # If the task is already submitted to SLURM, cancel it there
            if task.slurm_job_id and task.status in [
                TaskStatus.CONFIGURING,
                TaskStatus.RUNNING,
            ]:
                await self.slurm_service.cancel_job(task.slurm_job_id)

            # Update task status
            self.update_task(
                task.id,
                TaskQueueJobUpdate(
                    status=TaskStatus.CANCELLED, finished_at=datetime.now(timezone.utc)
                ),
            )

            cluster_logger.info(f"Task {task.task_id} cancelled by user {owner_id}")
            return True

        except Exception as e:
            cluster_logger.error(f"Error cancelling task {task.task_id}: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Error cancelling task: {str(e)}",
            )

    def get_amumax_tasks(
        self, owner_id: int, skip: int = 0, limit: int = 100
    ) -> List[TaskQueueJob]:
        """
        Get Amumax simulation tasks for a user.
        
        This method filters tasks to only return those that are Amumax
        simulations (based on .mx3 file extension).
        
        Args:
            owner_id: ID of the task owner
            skip: Number of tasks to skip
            limit: Maximum number of tasks to return
            
        Returns:
            List of TaskQueueJob objects for Amumax simulations
        """
        query = (
            self.db.query(TaskQueueJob)
            .filter(TaskQueueJob.owner_id == owner_id)
            .filter(TaskQueueJob.simulation_file.like('%.mx3'))
        )
        
        return (
            query.order_by(
                TaskQueueJob.priority.desc(),
                TaskQueueJob.created_at.asc()
            )
            .offset(skip)
            .limit(limit)
            .all()
        )

    async def get_task_output(self, task_id: Union[str, int], owner_id: int) -> Dict[str, Any]:
        """Get SLURM output logs for a task."""
        task = self.get_task(task_id)
        if not task:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Task not found"
            )

        # Check ownership
        if task.owner_id != owner_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized to view this task",
            )

        output_content = ""
        output_file = None
        
        # If task has SLURM job ID, try to read output file
        if task.slurm_job_id:
            try:
                logs_dir = (
                    "/mnt/storage_2/scratch/pl0095-01/zelent/"
                    "amucontainers/logs"
                )
                import glob
                import os
                
                # Define patterns upfront
                relaxed_pattern = f"*.{task.slurm_job_id}.*.out"
                amumax_pattern = (
                    f"amumax_task_*_admin-"
                    f"amumax_task_*_admin.{task.slurm_job_id}.*.out"
                )
                
                # Use a relaxed pattern: any file with SLURM job ID and .out
                # For Amumax, the output file is named as:
                # amumax_task_<id>_admin-amumax_task_<id>_admin.<slurm_job_id>.<node>.out
                # Try to match this pattern first
                amumax_pattern_path = os.path.join(logs_dir, amumax_pattern)
                matching_files = glob.glob(amumax_pattern_path)
                
                # Fallback: match any file with the job id and .out
                if not matching_files:
                    pattern_path = os.path.join(logs_dir, relaxed_pattern)
                    matching_files = glob.glob(pattern_path)
                    
                if matching_files:
                    output_file = matching_files[0]
                    cluster_logger.info(
                        f"Found output file: {output_file}"
                    )
                    if os.path.exists(output_file):
                        with open(
                            output_file, 'r', encoding='utf-8', errors='ignore'
                        ) as f:
                            output_content = f.read()
                        cluster_logger.info(
                            f"Successfully read {len(output_content)} "
                            f"characters from output file"
                        )
                    else:
                        output_content = (
                            "Output file exists but cannot be read"
                        )
                else:
                    relaxed_pattern_path = os.path.join(
                        logs_dir, relaxed_pattern
                    )
                    cluster_logger.warning(
                        f"No output files found for patterns: "
                        f"{amumax_pattern_path} or {relaxed_pattern_path}"
                    )
                    output_content = (
                        f"Log file not found. Searched patterns: "
                        f"{amumax_pattern_path} and {relaxed_pattern_path}"
                    )
            except Exception as e:
                cluster_logger.error(
                    f"Error reading output file for task {task_id}: {str(e)}"
                )
                output_content = f"Error reading log file: {str(e)}"
        else:
            output_content = "Task not yet submitted to SLURM"

        return {
            "task_id": task.task_id,
            "status": task.status,
            "slurm_job_id": task.slurm_job_id,
            "output_file": output_file,
            "output_content": output_content,
            "node": task.node
        }
