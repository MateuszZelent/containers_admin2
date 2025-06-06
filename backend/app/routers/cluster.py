from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app.db.session import get_db
from app.schemas.cluster_stats import ClusterStats, ClusterStatsCreate
from app.services.cluster_stats import ClusterStatsService
from app.core.auth import get_current_active_user_with_cli_support, get_current_superuser_with_cli_support
from app.db.models import User

router = APIRouter(tags=["cluster"])


@router.get("/stats", response_model=ClusterStats)
async def get_cluster_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user_with_cli_support)
):
    """Get the current cluster statistics."""
    stats = ClusterStatsService.get_current(db)
    if not stats:
        raise HTTPException(status_code=404, detail="No cluster statistics available")
    return stats


@router.post("/stats", response_model=ClusterStats)
async def update_cluster_stats(
    stats_data: ClusterStatsCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_superuser_with_cli_support)
):
    """Update cluster statistics (admin/CLI only)."""
    return ClusterStatsService.create_or_update(db, stats_data)


@router.get("/stats/history", response_model=List[ClusterStats])
async def get_cluster_stats_history(
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user_with_cli_support)
):
    """Get current cluster statistics (only one record)."""
    stats = ClusterStatsService.get_current(db)
    return [stats] if stats else []


@router.post("/stats/update", response_model=ClusterStats)
async def force_update_cluster_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_superuser_with_cli_support)
):
    """Force update of cluster statistics by executing the monitoring script."""
    from app.services.cluster_stats_monitor import ClusterStatsMonitorService
    
    monitor_service = ClusterStatsMonitorService(db)
    success = await monitor_service.update_cluster_stats()
    
    if not success:
        raise HTTPException(
            status_code=500, 
            detail="Failed to update cluster statistics"
        )
    
    # Return the current stats
    stats = ClusterStatsService.get_current(db)
    if not stats:
        raise HTTPException(
            status_code=500,
            detail="No statistics available after update"
        )
    
    return stats


@router.get("/stats/summary")
async def get_cluster_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user_with_cli_support)
):
    """Get cluster status summary with utilization percentages."""
    from app.services.cluster_stats_monitor import ClusterStatsMonitorService
    
    monitor_service = ClusterStatsMonitorService(db)
    summary = await monitor_service.get_cluster_status_summary()
    
    return summary


@router.get("/stats/test-script")
async def test_cluster_stats_script(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_superuser_with_cli_support)
):
    """Test cluster statistics script execution on remote server."""
    from app.services.cluster_stats_monitor import ClusterStatsMonitorService
    
    monitor_service = ClusterStatsMonitorService(db)
    stats_data = await monitor_service.execute_cluster_stats_script()
    
    if not stats_data:
        raise HTTPException(
            status_code=500, 
            detail="Failed to execute or parse cluster statistics script"
        )
    
    return {
        "status": "success",
        "message": "Script executed successfully",
        "data": stats_data
    }
