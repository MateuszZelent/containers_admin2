from datetime import datetime
from pydantic import BaseModel


class ResourceUsageBase(BaseModel):
    logged_in_users: int
    active_containers: int
    used_gpus: int
    reserved_ram_gb: int
    used_cpu_threads: int


class ResourceUsageCreate(ResourceUsageBase):
    pass


class ResourceUsage(ResourceUsageBase):
    id: int
    timestamp: datetime

    class Config:
        from_attributes = True
