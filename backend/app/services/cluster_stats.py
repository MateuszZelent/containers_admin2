from sqlalchemy.orm import Session
from typing import Optional
from app.db.models import ClusterStats as ClusterStatsModel
from app.schemas.cluster import ClusterStatsCreate, ClusterStatsUpdate


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
            # Update existing record
            existing.used_nodes = stats_data.used_nodes
            existing.total_nodes = stats_data.total_nodes
            existing.used_gpus = stats_data.used_gpus
            existing.total_gpus = stats_data.total_gpus
            existing.source = getattr(stats_data, 'source', 'monitor')
            db.add(existing)
            db.commit()
            db.refresh(existing)
            return existing
        else:
            # Create new record
            stats = ClusterStatsModel(
                used_nodes=stats_data.used_nodes,
                total_nodes=stats_data.total_nodes,
                used_gpus=stats_data.used_gpus,
                total_gpus=stats_data.total_gpus,
                source=getattr(stats_data, 'source', 'monitor')
            )
            db.add(stats)
            db.commit()
            db.refresh(stats)
            return stats
