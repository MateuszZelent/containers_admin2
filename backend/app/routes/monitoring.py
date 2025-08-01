from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Literal, Optional

from app.core.auth import get_current_superuser
from app.db.models import User
from app.services.resource_usage_task import resource_usage_task
from app.services.cluster_monitoring_task import cluster_monitoring_task
from app.websocket.manager import websocket_manager

router = APIRouter()


class MonitoringIntervalUpdate(BaseModel):
    interval_minutes: int

    class Config:
        schema_extra = {
            "example": {
                "interval_minutes": 10
            }
        }


class MonitoringStatus(BaseModel):
    interval_minutes: int
    current_status: Literal["active", "inactive"]
    last_snapshot: Optional[str]
    total_snapshots: int


class ClusterMonitoringStatus(BaseModel):
    interval_minutes: int
    current_status: Literal["active", "inactive"]
    last_update: Optional[str]
    update_count: int


@router.get("/monitoring/status", response_model=MonitoringStatus)
async def get_monitoring_status(
    current_user: User = Depends(get_current_superuser)
):
    """
    Get current resource monitoring status.
    Requires admin privileges.
    """
    status = resource_usage_task.get_status()
    return MonitoringStatus(**status)


@router.get("/cluster-monitoring/status", response_model=ClusterMonitoringStatus)
async def get_cluster_monitoring_status(
    current_user: User = Depends(get_current_superuser)
):
    """
    Get current cluster monitoring status.
    Requires admin privileges.
    """
    status = cluster_monitoring_task.get_status()
    return ClusterMonitoringStatus(**status)


@router.put("/monitoring/interval")
async def update_monitoring_interval(
    update: MonitoringIntervalUpdate,
    current_user: User = Depends(get_current_superuser)
):
    """
    Update resource monitoring interval.
    Requires admin privileges.
    """
    # 1 min to 24h
    if update.interval_minutes < 1 or update.interval_minutes > 1440:
        raise HTTPException(
            status_code=400,
            detail="Interval must be between 1 and 1440 minutes"
        )

    try:
        await resource_usage_task.restart_with_new_interval(
            update.interval_minutes
        )
        return {
            "message": (
                f"Monitoring interval updated to "
                f"{update.interval_minutes} minutes"
            ),
            "interval_minutes": update.interval_minutes
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to update monitoring interval: {str(e)}"
        )


@router.put("/cluster-monitoring/interval")
async def update_cluster_monitoring_interval(
    update: MonitoringIntervalUpdate,
    current_user: User = Depends(get_current_superuser)
):
    """
    Update cluster monitoring interval.
    Requires admin privileges.
    """
    # 1 min to 24h
    if update.interval_minutes < 1 or update.interval_minutes > 1440:
        raise HTTPException(
            status_code=400,
            detail="Interval must be between 1 and 1440 minutes"
        )

    try:
        await cluster_monitoring_task.restart_with_new_interval(
            update.interval_minutes
        )
        return {
            "message": (
                f"Cluster monitoring interval updated to "
                f"{update.interval_minutes} minutes"
            ),
            "interval_minutes": update.interval_minutes
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to update cluster monitoring interval: {str(e)}"
        )


@router.post("/monitoring/restart")
async def restart_monitoring(
    current_user: User = Depends(get_current_superuser)
):
    """
    Restart resource monitoring with current settings.
    Requires admin privileges.
    """
    try:
        current_interval = resource_usage_task.interval_minutes
        await resource_usage_task.restart_with_new_interval(current_interval)
        return {
            "message": "Resource monitoring restarted successfully",
            "interval_minutes": current_interval
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to restart monitoring: {str(e)}"
        )


@router.post("/cluster-monitoring/restart")
async def restart_cluster_monitoring(
    current_user: User = Depends(get_current_superuser)
):
    """
    Restart cluster monitoring with current settings.
    Requires admin privileges.
    """
    try:
        current_interval = cluster_monitoring_task.interval_minutes
        await cluster_monitoring_task.restart_with_new_interval(current_interval)
        return {
            "message": "Cluster monitoring restarted successfully",
            "interval_minutes": current_interval
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to restart cluster monitoring: {str(e)}"
        )


@router.get("/monitoring/active-sessions")
async def get_active_sessions(
    current_user: User = Depends(get_current_superuser)
):
    """Get information about active WebSocket sessions."""
    stats = websocket_manager.get_connection_stats()
    return {
        "active_users": stats["active_users"],
        "total_connections": stats["total_connections"],
        "connections_by_channel": stats["connections_by_channel"],
        "user_stats": stats["user_stats"]
    }
