"""
Schemas for MX3 job management API
"""

from datetime import datetime
from typing import Optional, Dict, Any
from pydantic import BaseModel, field_validator
import os


class MX3JobCreate(BaseModel):
    """Schema for creating a new MX3 job"""
    original_filename: str
    simulation_params: Optional[Dict[str, Any]] = None
    estimated_duration: Optional[int] = None  # seconds
    
    @field_validator('original_filename')
    @classmethod
    def validate_filename(cls, v):
        if not v.endswith('.mx3'):
            raise ValueError('File must have .mx3 extension')
        # Remove any path components for security
        return os.path.basename(v)


class MX3JobResponse(BaseModel):
    """Schema for MX3 job response"""
    id: int
    job_key: str
    user_id: int
    original_filename: str
    file_size: int
    file_md5: str
    status: str
    created_at: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    
    # Task queue information
    task_queue_id: Optional[int] = None
    
    # Results information
    results_archive_size: Optional[int] = None
    results_archive_md5: Optional[str] = None
    
    # Error information
    error_message: Optional[str] = None
    
    # Timing
    estimated_duration: Optional[int] = None
    actual_duration: Optional[int] = None
    
    # Simulation parameters
    simulation_params: Optional[Dict[str, Any]] = None
    
    class Config:
        from_attributes = True


class MX3JobStatus(BaseModel):
    """Schema for MX3 job status"""
    job_key: str
    status: str
    progress: Optional[float] = None  # 0-100%
    estimated_completion: Optional[datetime] = None
    error_message: Optional[str] = None
    
    # Task queue status if applicable
    queue_position: Optional[int] = None
    slurm_job_id: Optional[str] = None


class MX3JobListResponse(BaseModel):
    """Schema for listing MX3 jobs"""
    jobs: list[MX3JobResponse]
    total: int
    page: int
    per_page: int


class MX3FileUploadResponse(BaseModel):
    """Response after successful file upload"""
    job_key: str
    message: str
    file_info: Dict[str, Any]
    next_steps: list[str]


class MX3ResultsInfo(BaseModel):
    """Information about MX3 job results"""
    job_key: str
    status: str
    results_available: bool
    archive_size: Optional[int] = None
    archive_md5: Optional[str] = None
    download_url: Optional[str] = None
    expires_at: Optional[datetime] = None


class MX3JobFilter(BaseModel):
    """Filter options for MX3 jobs"""
    status: Optional[str] = None
    from_date: Optional[datetime] = None
    to_date: Optional[datetime] = None
    page: int = 1
    per_page: int = 20
    
    @field_validator('per_page')
    @classmethod
    def validate_per_page(cls, v):
        if v > 100:
            raise ValueError('per_page cannot exceed 100')
        return v


class MX3SimulationParams(BaseModel):
    """Schema for MX3 simulation parameters extracted from file"""
    grid_size: Optional[tuple] = None
    mesh_size: Optional[tuple] = None
    material: Optional[str] = None
    exchange_constant: Optional[float] = None
    saturation_magnetization: Optional[float] = None
    anisotropy: Optional[Dict[str, Any]] = None
    demag: Optional[bool] = None
    time_steps: Optional[int] = None
    save_frequency: Optional[int] = None
    output_format: Optional[str] = None
