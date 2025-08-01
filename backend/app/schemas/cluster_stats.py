from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class ClusterStatsBase(BaseModel):
    """Base schema for cluster statistics."""

    # Węzły (nodes)
    free_nodes: int
    busy_nodes: int
    sleeping_nodes: int  # węzły w trybie oszczędzania energii (POWERED_DOWN)
    total_nodes: int

    # GPU
    free_gpus: int
    active_gpus: int  # aktywne GPU
    standby_gpus: int  # standby GPU
    busy_gpus: int  # zajęte GPU
    total_gpus: int

    source: Optional[str] = None


class ClusterStatsCreate(ClusterStatsBase):
    """Schema for creating cluster statistics."""

    pass


class ClusterStatsUpdate(BaseModel):
    """Schema for updating cluster statistics."""

    free_nodes: Optional[int] = None
    busy_nodes: Optional[int] = None
    sleeping_nodes: Optional[int] = None  # węzły w trybie oszczędzania energii
    total_nodes: Optional[int] = None
    free_gpus: Optional[int] = None
    active_gpus: Optional[int] = None
    standby_gpus: Optional[int] = None
    busy_gpus: Optional[int] = None
    total_gpus: Optional[int] = None
    source: Optional[str] = None


class ClusterStats(ClusterStatsBase):
    """Schema for cluster statistics from database."""

    id: int
    timestamp: datetime

    class Config:
        from_attributes = True
