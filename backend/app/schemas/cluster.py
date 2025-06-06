from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class ClusterStatsBase(BaseModel):
    """Base schema for cluster statistics."""
    used_nodes: int
    total_nodes: int
    used_gpus: int
    total_gpus: int


class ClusterStatsCreate(ClusterStatsBase):
    """Schema for creating cluster statistics."""
    pass


class ClusterStatsUpdate(BaseModel):
    """Schema for updating cluster statistics."""
    used_nodes: Optional[int] = None
    total_nodes: Optional[int] = None
    used_gpus: Optional[int] = None
    total_gpus: Optional[int] = None


class ClusterStats(ClusterStatsBase):
    """Schema for cluster statistics response."""
    id: int
    timestamp: datetime
    source: Optional[str] = None

    class Config:
        orm_mode = True
