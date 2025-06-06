from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class ClusterStatsBase(BaseModel):
    """Base schema for cluster statistics."""
    used_nodes: int
    total_nodes: int
    used_gpus: int
    total_gpus: int
    source: Optional[str] = None


class ClusterStatsCreate(ClusterStatsBase):
    """Schema for creating cluster statistics."""
    pass


class ClusterStatsUpdate(BaseModel):
    """Schema for updating cluster statistics."""
    used_nodes: Optional[int] = None
    total_nodes: Optional[int] = None
    used_gpus: Optional[int] = None
    total_gpus: Optional[int] = None
    source: Optional[str] = None


class ClusterStats(ClusterStatsBase):
    """Full schema for cluster statistics."""
    id: int
    timestamp: datetime

    class Config:
        from_attributes = True
