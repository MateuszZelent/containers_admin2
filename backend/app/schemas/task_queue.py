from pydantic import BaseModel, Field, validator
from typing import Optional, Dict, Any, List, Union
from datetime import datetime
import uuid


class TaskQueueJobBase(BaseModel):
    """Base schema for task queue jobs."""

    name: str = Field(..., description="Task name")
    simulation_file: str = Field(
        ..., description="Path to .mx3 simulation file"
    )
    partition: str = Field("proxima", description="SLURM partition")
    num_cpus: int = Field(5, description="Number of CPU cores")
    memory_gb: int = Field(24, description="Memory in GB")
    num_gpus: int = Field(1, description="Number of GPUs")
    time_limit: str = Field("24:00:00", description="Time limit (HH:MM:SS)")
    priority: int = Field(0, description="Task priority (higher = more important)")
    parameters: Optional[Dict[str, Any]] = Field(
        None, description="Simulation parameters"
    )

    @validator("time_limit")
    def validate_time_limit(cls, v):
        """Validate time limit format (HH:MM:SS)."""
        parts = v.split(":")
        if len(parts) != 3:
            raise ValueError("time_limit must be in format HH:MM:SS")
        try:
            hours, minutes, seconds = map(int, parts)
            if hours < 0 or minutes < 0 or seconds < 0 or minutes > 59 or seconds > 59:
                raise ValueError("Invalid time values")
        except ValueError:
            raise ValueError("time_limit must contain valid integers")
        return v


class TaskQueueJobCreate(TaskQueueJobBase):
    """Schema for creating a new task."""

    pass


class TaskQueueJobUpdate(BaseModel):
    """Schema for updating an existing task."""

    name: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[int] = None
    parameters: Optional[Dict[str, Any]] = None
    progress: Optional[int] = None
    node: Optional[str] = None
    error_message: Optional[str] = None
    exit_code: Optional[int] = None
    next_retry_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None


class TaskQueueJobInDB(TaskQueueJobBase):
    """Schema for task data from database."""

    id: int
    task_id: str
    slurm_job_id: Optional[str] = None
    status: str
    retry_count: int = 0
    progress: int = 0
    created_at: datetime
    queued_at: datetime
    submitted_at: Optional[datetime] = None
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    next_retry_at: Optional[datetime] = None
    owner_id: int
    estimated_duration: Optional[int] = None
    estimated_completion_time: Optional[datetime] = None
    error_message: Optional[str] = None
    exit_code: Optional[int] = None
    previous_attempts: Optional[List[Dict[str, Any]]] = None

    class Config:
        orm_mode = True


class TaskQueueStatus(BaseModel):
    """Schema for queue status information."""

    total_tasks: int
    status_counts: Dict[str, int]
    avg_wait_time: Optional[float] = None
    next_task_id: Optional[str] = None
    active_worker_count: int


class SimulationResult(BaseModel):
    """Schema for simulation results."""

    task_id: str
    status: str
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    elapsed_time: Optional[float] = None
    output_dir: Optional[str] = None
    results_file: Optional[str] = None
    output_files: Optional[List[str]] = None
    results_data: Optional[Any] = None
    error_message: Optional[str] = None
    exit_code: Optional[int] = None
    retry_count: Optional[int] = None
    previous_attempts: Optional[List[Dict[str, Any]]] = None


class TaskQueueJobWithResults(TaskQueueJobInDB):
    """Schema for task with its results."""

    results: Optional[SimulationResult] = None


class AmumaxTaskCreate(BaseModel):
    """Schema for creating an Amumax micromagnetic simulation task."""

    task_name: str = Field(..., description="Name for the simulation task")
    mx3_file_path: str = Field(..., description="Path to .mx3 simulation file")
    partition: str = Field("proxima", description="SLURM partition")
    num_cpus: int = Field(5, description="Number of CPU cores")
    memory_gb: int = Field(24, description="Memory in GB")
    num_gpus: int = Field(1, description="Number of GPUs")
    time_limit: str = Field("24:00:00", description="Time limit (HH:MM:SS)")
    priority: int = Field(0, description="Task priority (higher = more important)")
    auto_submit: bool = Field(True, description="Submit immediately to SLURM")
    parameters: Optional[Dict[str, Any]] = Field(
        None, description="Additional simulation parameters"
    )

    @validator("mx3_file_path")
    def validate_mx3_extension(cls, v):
        """Validate that the file has .mx3 extension."""
        if not v.endswith('.mx3'):
            raise ValueError("Simulation file must have .mx3 extension")
        return v

    @validator("time_limit")
    def validate_time_limit(cls, v):
        """Validate time limit format (HH:MM:SS)."""
        parts = v.split(":")
        if len(parts) != 3:
            raise ValueError("time_limit must be in format HH:MM:SS")
        try:
            hours, minutes, seconds = map(int, parts)
            if hours < 0 or minutes < 0 or seconds < 0 or minutes > 59 or seconds > 59:
                raise ValueError("Invalid time values")
        except ValueError:
            raise ValueError("time_limit must contain valid integers")
        return v


class AmumaxTaskResult(BaseModel):
    """Schema for Amumax simulation results."""

    task_id: str
    status: str
    simulation_type: str = "amumax"
    mx3_file: str
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    elapsed_time: Optional[float] = None
    output_dir: Optional[str] = None
    
    # Amumax-specific result files
    table_files: Optional[List[str]] = None
    ovf_files: Optional[List[str]] = None
    zarr_files: Optional[List[str]] = None
    log_files: Optional[List[str]] = None
    energy_files: Optional[List[str]] = None
    field_files: Optional[List[str]] = None
    
    # Parsed data from table files
    main_table_data: Optional[Dict[str, Any]] = None
    
    # Error information if applicable
    error_message: Optional[str] = None
    exit_code: Optional[int] = None


class FileValidationResult(BaseModel):
    """Schema for file validation results."""
    
    file_path: str
    is_valid: bool
    message: str
