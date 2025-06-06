from sqlalchemy.orm import Session
from typing import Optional
from app.db.models import ClusterStats as ClusterStatsModel
from app.schemas.cluster_stats import ClusterStatsCreate


class ClusterStatsService:
    """Service for managing cluster statistics."""

    @staticmethod
    def get_current(db: Session) -> Optional[ClusterStatsModel]:
        """Get the current cluster statistics (only one record maintained)."""
        return db.query(ClusterStatsModel).first()

    @staticmethod
    def create_or_update(
        db: Session,
        stats_data: ClusterStatsCreate
    ) -> ClusterStatsModel:
        """Create or update cluster statistics (only one record maintained)."""
        # Check if record exists
        existing = db.query(ClusterStatsModel).first()

        if existing:
            # Update existing record with new fields
            existing.free_nodes = stats_data.free_nodes
            existing.busy_nodes = stats_data.busy_nodes
            existing.unavailable_nodes = stats_data.unavailable_nodes
            existing.total_nodes = stats_data.total_nodes
            existing.free_gpus = stats_data.free_gpus
            existing.active_gpus = stats_data.active_gpus
            existing.standby_gpus = stats_data.standby_gpus
            existing.busy_gpus = stats_data.busy_gpus
            existing.total_gpus = stats_data.total_gpus
            existing.source = getattr(stats_data, 'source', 'check.sh')

            # Keep legacy fields for backward compatibility
            existing.used_nodes = stats_data.busy_nodes
            existing.used_gpus = stats_data.busy_gpus

            db.add(existing)
            db.commit()
            db.refresh(existing)
            return existing
        else:
            # Create new record
            stats = ClusterStatsModel(
                free_nodes=stats_data.free_nodes,
                busy_nodes=stats_data.busy_nodes,
                unavailable_nodes=stats_data.unavailable_nodes,
                total_nodes=stats_data.total_nodes,
                free_gpus=stats_data.free_gpus,
                active_gpus=stats_data.active_gpus,
                standby_gpus=stats_data.standby_gpus,
                busy_gpus=stats_data.busy_gpus,
                total_gpus=stats_data.total_gpus,
                source=getattr(stats_data, 'source', 'check.sh'),
                # Legacy fields for backward compatibility
                used_nodes=stats_data.busy_nodes,
                used_gpus=stats_data.busy_gpus
            )
            db.add(stats)
            db.commit()
            db.refresh(stats)
            return stats
