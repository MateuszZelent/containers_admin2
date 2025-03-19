from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


class SSHTunnelBase(BaseModel):
    local_port: int = Field(..., description="Port on the application server")
    remote_port: int = Field(..., description="Port on the compute node")
    node: str = Field(..., description="Node where the container is running")
    status: str = Field(..., description="Status of the SSH tunnel")


class SSHTunnelCreate(SSHTunnelBase):
    pass


class SSHTunnelUpdate(SSHTunnelBase):
    pass


class SSHTunnelInDB(SSHTunnelBase):
    id: int
    job_id: int
    tunnel_pid: Optional[int]
    created_at: datetime
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True


class JobBase(BaseModel):
    job_name: str = Field(..., description="Name of the job")
    template_name: str = Field(..., description="Name of the template to use (e.g., manga.template, syam.template)")
    partition: str = Field(default="proxima", description="SLURM partition to use")
    num_nodes: int = Field(default=1, description="Number of nodes to allocate")
    tasks_per_node: int = Field(default=1, description="Number of tasks per node")
    num_cpus: int = Field(..., description="Number of CPUs per task")
    memory_gb: int = Field(..., description="Memory in GB")
    num_gpus: int = Field(default=0, description="Number of GPUs to allocate")
    time_limit: str = Field(default="24:00:00", description="Time limit in format HH:MM:SS")


class JobCreate(JobBase):
    preview: bool = Field(default=False, description="If true, returns the filled template without submitting the job")


class JobUpdate(BaseModel):
    status: Optional[str] = None
    node: Optional[str] = None
    port: Optional[int] = None
    password: Optional[str] = None


class SSHTunnelInfo(BaseModel):
    id: int
    local_port: int
    remote_port: int
    node: str
    status: str
    created_at: datetime

    class Config:
        from_attributes = True


class JobInDBBase(JobBase):
    id: int
    job_id: str = Field(default="pending")
    status: str = Field(default="PENDING")
    node: Optional[str] = None
    port: Optional[int] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    owner_id: int
    tunnels: List[SSHTunnelInfo] = []
    script: str = Field(default="")
    password: Optional[str] = None

    class Config:
        from_attributes = True


class Job(JobInDBBase):
    pass


class JobInDB(JobInDBBase):
    pass


class JobPreview(BaseModel):
    script: str = Field(..., description="The complete job script that would be submitted")


class JobSubmissionResponse(BaseModel):
    message: str = Field(..., description="Success message with job ID")
    job_id: str = Field(..., description="SLURM job ID")
    job: Job = Field(..., description="Complete job information")