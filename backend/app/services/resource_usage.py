from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session

from app.db.models import Job, ResourceUsageSnapshot
from app.websocket.manager import websocket_manager


class ResourceUsageService:
    """Service for recording aggregated resource usage."""

    @staticmethod
    def record_snapshot(db: Session) -> ResourceUsageSnapshot:
        active_jobs = (
            db.query(Job)
            .filter(Job.status.in_(["PENDING", "RUNNING", "CONFIGURING"]))
            .all()
        )

        # Get real active sessions from WebSocket manager
        # Counts users with active WebSocket connections (truly logged in)
        logged_in_users = len(websocket_manager.user_connections)
        active_containers = len(active_jobs)
        used_gpus = sum(job.num_gpus for job in active_jobs)
        reserved_ram_gb = sum(job.memory_gb for job in active_jobs)
        used_cpu_threads = sum(
            job.num_cpus * job.num_nodes for job in active_jobs
        )

        snapshot = ResourceUsageSnapshot(
            logged_in_users=logged_in_users,
            active_containers=active_containers,
            used_gpus=used_gpus,
            reserved_ram_gb=reserved_ram_gb,
            used_cpu_threads=used_cpu_threads,
        )

        db.add(snapshot)
        db.commit()
        db.refresh(snapshot)

        # Delete old records beyond 14 days - use timezone-aware datetime
        cutoff = datetime.now(timezone.utc) - timedelta(days=14)
        db.query(ResourceUsageSnapshot).filter(
            ResourceUsageSnapshot.timestamp < cutoff
        ).delete()
        db.commit()

        return snapshot

    @staticmethod
    def get_history(db: Session, limit: int = 2016):
        return (
            db.query(ResourceUsageSnapshot)
            .order_by(ResourceUsageSnapshot.timestamp.desc())
            .limit(limit)
            .all()
        )
