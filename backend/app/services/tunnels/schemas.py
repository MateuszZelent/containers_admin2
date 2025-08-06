"""
Schemas for SSH Tunnel Management

Data classes and models for process and tunnel information.
"""

from dataclasses import dataclass
from datetime import datetime
from typing import Optional
from .enums import ProcessType, HealthStatus


@dataclass
class ProcessInfo:
    """Information about a running process."""
    pid: int
    port: int
    process_type: ProcessType
    is_alive: bool
    created_at: datetime
    last_check: Optional[datetime] = None


@dataclass 
class TunnelHealthInfo:
    """Comprehensive health information for a tunnel."""
    tunnel_id: int
    is_healthy: bool
    ssh_process: Optional[ProcessInfo] = None
    socat_process: Optional[ProcessInfo] = None
    port_connectivity: bool = False
    last_test: Optional[datetime] = None
    health_status: HealthStatus = HealthStatus.UNKNOWN
    error_message: Optional[str] = None


@dataclass
class PortAllocation:
    """Information about allocated ports for a tunnel."""
    internal_port: int
    external_port: int
    job_id: int
    allocated_at: datetime
    is_reserved: bool = True
