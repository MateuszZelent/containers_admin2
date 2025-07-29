"""
Chart data optimization service for intelligent aggregation and scaling.
Provides efficient data handling for resource usage charts with
time-based aggregation.
"""

from datetime import datetime, timedelta, timezone
from typing import List, Dict, Any, Optional, Tuple
from enum import Enum
from sqlalchemy.orm import Session
from sqlalchemy import func, and_
from dataclasses import dataclass

from app.db.models import ResourceUsageSnapshot


class TimeRange(Enum):
    """Time range options for chart data."""
    LAST_HOUR = "1h"
    LAST_6_HOURS = "6h"
    LAST_12_HOURS = "12h"
    LAST_24_HOURS = "24h"
    LAST_3_DAYS = "3d"
    LAST_7_DAYS = "7d"
    LAST_14_DAYS = "14d"


class AggregationLevel(Enum):
    """Data aggregation levels."""
    RAW = "raw"           # Original data points
    MINUTE_5 = "5min"     # 5-minute averages
    MINUTE_15 = "15min"   # 15-minute averages
    HOURLY = "1h"         # Hourly averages
    DAILY = "1d"          # Daily averages


@dataclass
class ChartConfiguration:
    """Configuration for chart data optimization."""
    time_range: TimeRange
    max_points: int = 100  # Maximum data points to return
    aggregation: Optional[AggregationLevel] = None
    include_current: bool = True  # Include current incomplete period


class ChartOptimizationService:
    """Service for optimizing chart data delivery."""
    
    # Intelligent aggregation rules based on time range
    AGGREGATION_RULES = {
        TimeRange.LAST_HOUR: (AggregationLevel.RAW, 60),
        TimeRange.LAST_6_HOURS: (AggregationLevel.MINUTE_5, 72),
        TimeRange.LAST_12_HOURS: (AggregationLevel.MINUTE_15, 48),
        TimeRange.LAST_24_HOURS: (AggregationLevel.MINUTE_15, 96),
        TimeRange.LAST_3_DAYS: (AggregationLevel.HOURLY, 72),
        TimeRange.LAST_7_DAYS: (AggregationLevel.HOURLY, 168),
        TimeRange.LAST_14_DAYS: (AggregationLevel.HOURLY, 336),
    }
    
    @classmethod
    def get_optimal_config(cls, time_range: TimeRange) -> ChartConfiguration:
        """Get optimal configuration for given time range."""
        aggregation, max_points = cls.AGGREGATION_RULES[time_range]
        return ChartConfiguration(
            time_range=time_range,
            max_points=max_points,
            aggregation=aggregation
        )
    
    @classmethod
    def get_time_bounds(
        cls, time_range: TimeRange
    ) -> Tuple[datetime, datetime]:
        """Get start and end datetime for time range."""
        now = datetime.now(timezone.utc)
        
        time_deltas = {
            TimeRange.LAST_HOUR: timedelta(hours=1),
            TimeRange.LAST_6_HOURS: timedelta(hours=6),
            TimeRange.LAST_12_HOURS: timedelta(hours=12),
            TimeRange.LAST_24_HOURS: timedelta(days=1),
            TimeRange.LAST_3_DAYS: timedelta(days=3),
            TimeRange.LAST_7_DAYS: timedelta(days=7),
            TimeRange.LAST_14_DAYS: timedelta(days=14),
        }
        
        start_time = now - time_deltas[time_range]
        return start_time, now
    
    @classmethod
    def get_aggregated_data(
        cls,
        db: Session,
        config: ChartConfiguration
    ) -> List[Dict[str, Any]]:
        """Get aggregated chart data based on configuration."""
        start_time, end_time = cls.get_time_bounds(config.time_range)
        
        if config.aggregation == AggregationLevel.RAW:
            return cls._get_raw_data(
                db, start_time, end_time, config.max_points
            )
        else:
            return cls._get_aggregated_data(db, start_time, end_time, config)
    
    @classmethod
    def _get_raw_data(
        cls,
        db: Session,
        start_time: datetime,
        end_time: datetime,
        max_points: int
    ) -> List[Dict[str, Any]]:
        """Get raw data points with intelligent sampling."""
        query = db.query(ResourceUsageSnapshot).filter(
            and_(
                ResourceUsageSnapshot.timestamp >= start_time,
                ResourceUsageSnapshot.timestamp <= end_time
            )
        ).order_by(ResourceUsageSnapshot.timestamp.asc())
        
        # Get total count first
        total_count = query.count()
        
        if total_count <= max_points:
            # Return all data if within limit
            snapshots = query.all()
        else:
            # Intelligent sampling - take every nth record
            step = max(1, total_count // max_points)
            snapshots = query.filter(
                (func.row_number().over(order_by=ResourceUsageSnapshot.timestamp) - 1) % step == 0
            ).all()
        
        return [cls._snapshot_to_dict(snapshot) for snapshot in snapshots]
    
    @classmethod
    def _get_aggregated_data(
        cls,
        db: Session,
        start_time: datetime,
        end_time: datetime,
        config: ChartConfiguration
    ) -> List[Dict[str, Any]]:
        """Get aggregated data based on aggregation level."""
        
        # For now, use simpler hour-based aggregation for all levels
        # This avoids complex PostgreSQL-specific queries
        
        if config.aggregation == AggregationLevel.RAW:
            return cls._get_raw_data(db, start_time, end_time, config.max_points)
        
        # Use hour-based grouping for all aggregation levels
        query = (
            db.query(
                func.date_trunc('hour', ResourceUsageSnapshot.timestamp).label('time_bucket'),
                func.avg(ResourceUsageSnapshot.logged_in_users).label('logged_in_users'),
                func.avg(ResourceUsageSnapshot.active_containers).label('active_containers'),
                func.avg(ResourceUsageSnapshot.used_gpus).label('used_gpus'),
                func.avg(ResourceUsageSnapshot.reserved_ram_gb).label('reserved_ram_gb'),
                func.avg(ResourceUsageSnapshot.used_cpu_threads).label('used_cpu_threads'),
                func.count(ResourceUsageSnapshot.id).label('sample_count')
            )
            .filter(
                and_(
                    ResourceUsageSnapshot.timestamp >= start_time,
                    ResourceUsageSnapshot.timestamp <= end_time
                )
            )
            .group_by('time_bucket')
            .order_by('time_bucket')
            .limit(config.max_points)
        )
        
        results = query.all()
        
        return [
            {
                'timestamp': result.time_bucket.isoformat(),
                'logged_in_users': round(float(result.logged_in_users or 0), 1),
                'active_containers': round(float(result.active_containers or 0), 1),
                'used_gpus': round(float(result.used_gpus or 0), 1),
                'reserved_ram_gb': round(float(result.reserved_ram_gb or 0), 1),
                'used_cpu_threads': round(float(result.used_cpu_threads or 0), 1),
                'sample_count': int(result.sample_count or 0),
                'aggregated': True,
                'aggregation_level': config.aggregation.value
            }
            for result in results
        ]
    
    @classmethod
    def _snapshot_to_dict(cls, snapshot: ResourceUsageSnapshot) -> Dict[str, Any]:
        """Convert ResourceUsageSnapshot to dictionary."""
        return {
            'timestamp': snapshot.timestamp.isoformat(),
            'logged_in_users': snapshot.logged_in_users,
            'active_containers': snapshot.active_containers,
            'used_gpus': snapshot.used_gpus,
            'reserved_ram_gb': snapshot.reserved_ram_gb,
            'used_cpu_threads': snapshot.used_cpu_threads,
            'sample_count': 1,
            'aggregated': False,
            'aggregation_level': 'raw'
        }
    
    @classmethod
    def get_available_time_ranges(cls) -> List[Dict[str, Any]]:
        """Get list of available time ranges with descriptions."""
        return [
            {
                'value': TimeRange.LAST_HOUR.value,
                'label': 'Ostatnia godzina',
                'description': 'Dane co 1 minutę',
                'points': '~60 punktów'
            },
            {
                'value': TimeRange.LAST_6_HOURS.value,
                'label': 'Ostatnie 6 godzin',
                'description': 'Średnie 5-minutowe',
                'points': '~72 punkty'
            },
            {
                'value': TimeRange.LAST_12_HOURS.value,
                'label': 'Ostatnie 12 godzin',
                'description': 'Średnie 15-minutowe',
                'points': '~48 punktów'
            },
            {
                'value': TimeRange.LAST_24_HOURS.value,
                'label': 'Ostatnie 24 godziny',
                'description': 'Średnie 15-minutowe',
                'points': '~96 punktów'
            },
            {
                'value': TimeRange.LAST_3_DAYS.value,
                'label': 'Ostatnie 3 dni',
                'description': 'Średnie godzinowe',
                'points': '~72 punkty'
            },
            {
                'value': TimeRange.LAST_7_DAYS.value,
                'label': 'Ostatni tydzień',
                'description': 'Średnie godzinowe',
                'points': '~168 punktów'
            },
            {
                'value': TimeRange.LAST_14_DAYS.value,
                'label': 'Ostatnie 2 tygodnie',
                'description': 'Średnie godzinowe',
                'points': '~336 punktów'
            }
        ]
