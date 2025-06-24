from fastapi import APIRouter, Depends, HTTPException

from app.db.models import User
from app.core.auth import get_current_superuser
from app.services.unified_slurm_monitor import get_unified_monitor

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/monitor/status")
async def get_monitor_status(
    current_user: User = Depends(get_current_superuser)
):
    """Get unified monitor status and metrics"""
    monitor = get_unified_monitor()
    
    return {
        "state": monitor.state,
        "metrics": {
            "total_jobs_monitored": monitor.metrics.total_jobs_monitored,
            "total_tasks_monitored": monitor.metrics.total_tasks_monitored,
            "active_tunnels": monitor.metrics.active_tunnels,
            "last_slurm_sync": (
                monitor.metrics.last_slurm_sync.isoformat()
                if monitor.metrics.last_slurm_sync else None
            ),
            "sync_errors": monitor.metrics.sync_errors,
            "port_allocations": monitor.metrics.port_allocations,
        }
    }


@router.post("/monitor/restart")
async def restart_monitor(
    current_user: User = Depends(get_current_superuser)
):
    """Restart the unified monitor"""
    monitor = get_unified_monitor()
    
    # Stop monitor
    await monitor.stop()
    
    # Start monitor
    success = await monitor.start()
    
    if success:
        return {"message": "Monitor restarted successfully"}
    else:
        raise HTTPException(
            status_code=500, detail="Failed to restart monitor"
        )


@router.get("/monitor/ports")
async def get_port_allocations(
    current_user: User = Depends(get_current_superuser)
):
    """Get current port allocations"""
    monitor = get_unified_monitor()
    
    # Access private attribute for debugging purposes
    allocations = []
    for port, allocation in monitor._allocated_ports.items():
        allocations.append({
            "port": port,
            "allocated_to": allocation.allocated_to,
            "resource_id": allocation.resource_id,
            "allocated_at": allocation.allocated_at.isoformat()
        })
    
    return {
        "total_allocated": len(allocations),
        "allocations": allocations
    }
