from typing import List, Optional, Dict, Any, Union, Tuple
from datetime import datetime, timedelta
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
        # Configuring states
        "PD": TaskStatus.CONFIGURING,  # Pending
        "CF": TaskStatus.CONFIGURING,  # Configuring
        "ST": TaskStatus.CONFIGURING,  # Starting
        "S": TaskStatus.CONFIGURING,  # Suspended
        # Running states
        "R": TaskStatus.RUNNING,  # Running
        "CG": TaskStatus.RUNNING,  # Completing
        # Completed states
        "CD": TaskStatus.COMPLETED,  # Completed
        "F": TaskStatus.ERROR,  # Failed
        "CA": TaskStatus.CANCELLED,  # Cancelled
        "TO": TaskStatus.TIMEOUT,  # Timeout
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
        host_prefix = "/storage_2/scratch/pl0095-01/zelent/mannga"

        # Check if this is a container path that needs translation
        if filepath and filepath.startswith(
            "/mnt/local/kkingstoun/admin/pcss_storage/mannga"
        ):
            # Replace the prefix with the host prefix
            translated_path = filepath.replace(
                "/mnt/local/kkingstoun/admin/pcss_storage/mannga",
                "/storage_2/scratch/pl0095-01/zelent/mannga",
                1,  # Replace only the first occurrence
            )
            cluster_logger.debug(f"Translated path: {filepath} -> {translated_path}")
            return translated_path

        return filepath

    def create_task(self, data: TaskQueueJobCreate, owner_id: int) -> TaskQueueJob:
        """Create a new task in the queue."""
        try:
            # Check for duplicate task names for this user
            existing_task = (
                self.db.query(TaskQueueJob)
                .filter(
                    TaskQueueJob.name == data.name,
                    TaskQueueJob.owner_id == owner_id
                )
                .first()
            )
            
            if existing_task:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Zadanie o nazwie '{data.name}' już istnieje. "
                           f"Wybierz inną nazwę.",
                )

            # Generate unique task ID
            task_id = f"task_{uuid.uuid4().hex[:8]}"

            # Create output directory path based on username and task ID
            user = self.db.query(User).filter(User.id == owner_id).first()
            if not user:
                raise ValueError(f"Owner ID {owner_id} not found")

            username = user.username
            output_dir = os.path.join(settings.SIMULATION_OUTPUT_DIR, username, task_id)

            # Store the original simulation file path from container
            original_sim_file = data.simulation_file

            # Translate the path for host filesystem operations
            host_sim_file = self._translate_path(original_sim_file)

            # Create task object - store both original and host paths
            task = TaskQueueJob(
                task_id=task_id,
                name=data.name or f"Simulation_{task_id}",
                simulation_file=original_sim_file,  # Store original path for container use
                host_file_path=host_sim_file,  # Store host path for filesystem operations
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
            # Apply updates
            update_dict = update_data.dict(exclude_unset=True)
            for key, value in update_dict.items():
                setattr(task, key, value)

            # Handle status change timestamps
            if "status" in update_dict:
                new_status = update_dict["status"]
                if new_status == TaskStatus.RUNNING and not task.started_at:
                    task.started_at = datetime.utcnow()
                elif new_status in [
                    TaskStatus.COMPLETED,
                    TaskStatus.ERROR,
                    TaskStatus.ERROR_RETRY_3,
                    TaskStatus.CANCELLED,
                ]:
                    task.finished_at = datetime.utcnow()

            # Update the task
            self.db.add(task)
            self.db.commit()
            self.db.refresh(task)

            # Log update
            cluster_logger.info(f"Task {task.task_id} updated: {update_dict}")

            return task

        except Exception as e:
            self.db.rollback()
            cluster_logger.error(f"Error updating task {task_id}: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Error updating task: {str(e)}",
            )

    def delete_task(self, task_id: Union[str, int], owner_id: int) -> bool:
        """Delete a task from the queue if it's not running."""
        task = self.get_task(task_id)
        if not task:
            return False

        # Check ownership
        if task.owner_id != owner_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized to delete this task",
            )

        # Cancel running task if needed
        if (
            task.status in [TaskStatus.CONFIGURING, TaskStatus.RUNNING]
            and task.slurm_job_id
        ):
            try:
                asyncio.create_task(self.slurm_service.cancel_job(task.slurm_job_id))
            except Exception as e:
                cluster_logger.warning(
                    f"Error cancelling task {task.task_id} in SLURM: {str(e)}"
                )

        try:
            # Delete from database
            self.db.delete(task)
            self.db.commit()
            cluster_logger.info(f"Task {task.task_id} deleted by user {owner_id}")
            return True
        except Exception as e:
            self.db.rollback()
            cluster_logger.error(f"Error deleting task {task_id}: {str(e)}")
            return False

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
            now = datetime.utcnow()
            for task in pending_tasks:
                wait_time = (now - task.created_at).total_seconds()
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
            task.submitted_at = datetime.utcnow()
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
        """Generate a SLURM submission script for a Mumax3 simulation."""
        # Read the amumax template
        template_path = os.path.join(settings.TEMPLATE_DIR, "amumax.template")
        with open(template_path, "r") as f:
            template_content = f.read()

        # Prepare parameters for the template - use the original simulation file path
        # since that's the path that will be valid inside the container
        params = {
            "job_name": f"sim_{task.task_id}",
            "num_cpus": task.num_cpus,
            "memory_gb": task.memory_gb,
            "num_gpus": task.num_gpus,
            "time_limit": task.time_limit,
            "partition": task.partition,
            "simulation_file": task.simulation_file,  # Use container path for SLURM script
            "output_dir": task.output_dir,
        }

        # Fill the template
        return await self.slurm_service.fill_template("amumax.template", params)

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
        now = datetime.utcnow()
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
                TaskQueueJob.next_retry_at <= now,
            )
            .all()
        )

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
                        "timestamp": datetime.utcnow().isoformat(),
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

            cluster_logger.info(
                f"Task {task.task_id} scheduled for retry (attempt {task.retry_count})"
            )

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
                jobs = await self.slurm_service.get_active_jobs()

                # Find this job in the active jobs
                job_info = next((j for j in jobs if j["job_id"] == slurm_job_id), None)

                if job_info:
                    # Job is still active in SLURM
                    slurm_state = job_info["state"]

                    # Map SLURM state to our task state
                    new_status = self.SLURM_STATE_MAPPING.get(
                        slurm_state, TaskStatus.UNKNOWN
                    )

                    # Calculate progress if possible (implementation dependent)
                    progress = self._estimate_progress(task, job_info)

                    # Update node info if available
                    node = job_info.get("node")

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
                            next_retry_at = datetime.utcnow() + delay

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

        # Calculate based on elapsed time vs time limit
        elapsed = (datetime.utcnow() - task.started_at).total_seconds()

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
                    status=TaskStatus.CANCELLED, finished_at=datetime.utcnow()
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
