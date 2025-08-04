from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional

from app.db.session import get_db
from app.schemas.cluster_stats import ClusterStats, ClusterStatsCreate
from app.schemas.resource_usage import ResourceUsage
from app.services.cluster_stats import ClusterStatsService
from app.services.resource_usage import ResourceUsageService
from app.services.chart_optimization import (
    ChartOptimizationService,
    TimeRange,
    ChartConfiguration,
)
from app.core.auth import (
    get_current_active_user_with_cli_support,
    get_current_superuser_with_cli_support,
)
from app.db.models import User

router = APIRouter(tags=["cluster"])


@router.get("/stats", response_model=ClusterStats)
async def get_cluster_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user_with_cli_support),
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
    current_user: User = Depends(get_current_superuser_with_cli_support),
):
    """Update cluster statistics (admin/CLI only)."""
    return ClusterStatsService.create_or_update(db, stats_data)


@router.get("/stats/history", response_model=List[ClusterStats])
async def get_cluster_stats_history(
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user_with_cli_support),
):
    """Get current cluster statistics (only one record)."""
    stats = ClusterStatsService.get_current(db)
    return [stats] if stats else []


@router.post("/stats/update", response_model=ClusterStats)
async def force_update_cluster_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_superuser_with_cli_support),
):
    """Force update of cluster statistics by executing the monitoring script."""
    from app.services.cluster_stats_monitor import ClusterStatsMonitorService

    monitor_service = ClusterStatsMonitorService(db)
    success = await monitor_service.update_cluster_stats()

    if not success:
        raise HTTPException(
            status_code=500, detail="Failed to update cluster statistics"
        )

    # Return the current stats
    stats = ClusterStatsService.get_current(db)
    if not stats:
        raise HTTPException(
            status_code=500, detail="No statistics available after update"
        )

    return stats


@router.get("/stats/summary")
async def get_cluster_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user_with_cli_support),
):
    """Get cluster status summary with utilization percentages."""
    from app.services.cluster_stats_monitor import ClusterStatsMonitorService

    monitor_service = ClusterStatsMonitorService(db)
    summary = await monitor_service.get_cluster_status_summary()

    return summary


@router.get("/stats/test-script")
async def test_cluster_stats_script(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_superuser_with_cli_support),
):
    """Test cluster statistics script execution on remote server."""
    from app.services.cluster_stats_monitor import ClusterStatsMonitorService

    monitor_service = ClusterStatsMonitorService(db)
    stats_data = await monitor_service.execute_cluster_stats_script()

    if not stats_data:
        raise HTTPException(
            status_code=500,
            detail="Failed to execute or parse cluster statistics script",
        )

    return {
        "status": "success",
        "message": "Script executed successfully",
        "data": stats_data,
    }


@router.get("/usage/history", response_model=List[ResourceUsage])
async def get_resource_usage_history(
    limit: int = 2016,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user_with_cli_support),
):
    """Get historical resource usage snapshots."""
    return ResourceUsageService.get_history(db, limit=limit)


@router.get("/usage/optimized")
async def get_optimized_usage_data(
    time_range: str = Query("24h", description="Time range for data"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user_with_cli_support),
):
    """Get optimized chart data with intelligent aggregation."""
    try:
        # Map string to TimeRange enum
        time_range_map = {
            "1h": TimeRange.LAST_HOUR,
            "6h": TimeRange.LAST_6_HOURS,
            "12h": TimeRange.LAST_12_HOURS,
            "24h": TimeRange.LAST_24_HOURS,
            "3d": TimeRange.LAST_3_DAYS,
            "7d": TimeRange.LAST_7_DAYS,
            "14d": TimeRange.LAST_14_DAYS,
        }

        if time_range not in time_range_map:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid time range. Available: {list(time_range_map.keys())}",
            )

        range_enum = time_range_map[time_range]
        config = ChartOptimizationService.get_optimal_config(range_enum)
        data = ChartOptimizationService.get_aggregated_data(db, config)

        return {
            "data": data,
            "metadata": {
                "time_range": time_range,
                "aggregation_level": config.aggregation.value
                if config.aggregation
                else "raw",
                "max_points": config.max_points,
                "actual_points": len(data),
                "optimized": True,
            },
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/usage/time-ranges")
async def get_available_time_ranges(
    current_user: User = Depends(get_current_active_user_with_cli_support),
):
    """Get list of available time ranges for optimized chart data."""
    return {
        "time_ranges": ChartOptimizationService.get_available_time_ranges(),
        "default": "24h",
    }
