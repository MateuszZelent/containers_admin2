"""
Enums for SSH Tunnel Management

Defines status and health enumerations used throughout the tunnel system.
"""

from enum import Enum


class TunnelStatus(Enum):
    """Status of an SSH tunnel."""
    PENDING = "PENDING"
    CONNECTING = "CONNECTING" 
    ACTIVE = "ACTIVE"
    DEAD = "DEAD"
    FAILED = "FAILED"
    CLOSED = "CLOSED"


class HealthStatus(Enum):
    """Health status of a tunnel."""
    PENDING = "PENDING"
    HEALTHY = "HEALTHY"
    UNHEALTHY = "UNHEALTHY"
    DEGRADED = "DEGRADED"
    UNKNOWN = "UNKNOWN"


class ProcessType(Enum):
    """Type of process in tunnel chain."""
    SSH = "SSH"
    SOCAT = "SOCAT"
