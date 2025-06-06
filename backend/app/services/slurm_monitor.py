"""
SLURM monitoring service that periodically fetches cluster and job data
and stores it in the database for use by the API endpoints.
"""

import asyncio
from datetime import datetime, timezone
from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import create_engine, text, func
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.core.logging import cluster_logger, slurm_logger
from app.db.models import SlurmJobSnapshot, ClusterStatus, User
from app.services.slurm import SlurmSSHService


class SlurmMonitorService:
    """Service for monitoring SLURM cluster and jobs in the background."""

    def __init__(self):
        self.slurm_service = SlurmSSHService()
        self.engine = create_engine(settings.DATABASE_URL)
        self.SessionLocal = sessionmaker(
            autocommit=False, autoflush=False, bind=self.engine
        )
        self._monitoring = False
        self._monitor_task: Optional[asyncio.Task] = None
        
    def get_db(self) -> Session:
        """Get database session."""
        return self.SessionLocal()

    async def start_monitoring(self, interval_seconds: int = 60):
        """Start the background monitoring task."""
        if self._monitoring:
            cluster_logger.warning("SLURM monitoring is already running")
            return
            
        self._monitoring = True
        cluster_logger.info(
            f"Starting SLURM monitoring with {interval_seconds}s interval"
        )
        
        self._monitor_task = asyncio.create_task(
            self._monitor_loop(interval_seconds)
        )
        
    async def stop_monitoring(self):
        """Stop the background monitoring task."""
        if not self._monitoring:
            return
            
        self._monitoring = False
        cluster_logger.info("Stopping SLURM monitoring")
        
        if self._monitor_task:
            self._monitor_task.cancel()
            try:
                await self._monitor_task
            except asyncio.CancelledError:
                pass
                
    async def _monitor_loop(self, interval_seconds: int):
        """Main monitoring loop."""
        while self._monitoring:
            try:
                await self._update_cluster_data()
                await asyncio.sleep(interval_seconds)
            except asyncio.CancelledError:
                break
            except Exception as e:
                cluster_logger.error(f"Error in monitoring loop: {e}")
                # Continue monitoring even if there's an error
                await asyncio.sleep(interval_seconds)
                
    async def _update_cluster_data(self):
        """Update cluster status and job data."""
        db = self.get_db()
        try:
            # Update cluster status
            await self._update_cluster_status(db)
            
            # Update job snapshots
            await self._update_job_snapshots(db)
            
            # Update cluster statistics (nodes/GPU info)
            await self._update_cluster_statistics(db)
            
            db.commit()
            cluster_logger.debug("Successfully updated cluster data")
            
        except Exception as e:
            db.rollback()
            cluster_logger.error(f"Failed to update cluster data: {e}")
            raise
        finally:
            db.close()
            
    async def _update_cluster_status(self, db: Session):
        """Update cluster status in database."""
        try:
            # Check cluster connectivity and SLURM status
            status = await self.slurm_service.check_status()
            
            # Create new cluster status record
            cluster_status = ClusterStatus(
                is_connected=status.get("connected", False),
                last_successful_connection=(
                    datetime.now(timezone.utc)
                    if status.get("connected") else None
                ),
                last_check=datetime.now(timezone.utc),
                error_message=(
                    None if status.get("connected") else "Connection failed"
                )
            )
            
            db.add(cluster_status)
            cluster_logger.debug(
                f"Updated cluster status: connected="
                f"{cluster_status.is_connected}"
            )
            
        except Exception as e:
            # Still create a record showing the error
            cluster_status = ClusterStatus(
                is_connected=False,
                last_successful_connection=None,
                last_check=datetime.now(timezone.utc),
                error_message=str(e)
            )
            db.add(cluster_status)
            cluster_logger.error(f"Failed to check cluster status: {e}")
            
    async def _update_job_snapshots(self, db: Session):
        """Update job snapshots for all users."""
        try:
            # Get all active users
            users = db.query(User).filter(User.is_active.is_(True)).all()
            
            # Instead of deleting all snapshots, we'll update them intelligently
            # First, mark all active snapshots as potentially outdated
            # Only mark PENDING or RUNNING jobs as outdated, leave COMPLETED jobs alone
            db.execute(text("""UPDATE slurm_job_snapshots 
                               SET is_current = FALSE
                               WHERE state IN ('PENDING', 'RUNNING')"""))
            
            # Track all job IDs that are still active
            active_job_ids = set()

            for user in users:
                try:
                    user_active_jobs = await self._update_user_jobs(db, user)
                    active_job_ids.update(user_active_jobs)
                except Exception as e:
                    slurm_logger.error(
                        f"Failed to update jobs for user {user.username}: {e}"
                    )
            
            # Get all job_ids from the database jobs table that are not COMPLETED
            running_jobs_in_db = db.execute(text(
                """SELECT job_id FROM jobs WHERE status IN ('PENDING', 'RUNNING')"""
            )).fetchall()
            
            running_job_ids_in_db = set(job_id for (job_id,) in running_jobs_in_db if job_id)
            slurm_logger.debug(f"Found {len(running_job_ids_in_db)} running jobs in DB: {running_job_ids_in_db}")
            slurm_logger.debug(f"Found {len(active_job_ids)} active jobs in SLURM: {active_job_ids}")
            
            # Check which jobs are in the DB but no longer active in SLURM
            for job_id in running_job_ids_in_db:
                if job_id and job_id not in active_job_ids:
                    # Update the job status to COMPLETED in the main jobs table
                    db.execute(text(
                        """UPDATE jobs 
                           SET status = 'COMPLETED', updated_at = CURRENT_TIMESTAMP
                           WHERE job_id = :job_id AND status IN ('PENDING', 'RUNNING')"""
                    ), {"job_id": job_id})
                    
                    # Also update the snapshot if it exists
                    db.execute(text(
                        """UPDATE slurm_job_snapshots
                           SET state = 'COMPLETED', is_current = TRUE
                           WHERE job_id = :job_id"""
                    ), {"job_id": job_id})
                    
                    slurm_logger.info(
                        f"Marked job {job_id} as COMPLETED "
                        f"(no longer active in SLURM)"
                    )
            
            # DON'T mark all non-current snapshots as COMPLETED - only those that
            # match jobs that are no longer active
            outdated_jobs = db.execute(text(
                """SELECT job_id FROM slurm_job_snapshots 
                   WHERE is_current = FALSE 
                   AND state IN ('PENDING', 'RUNNING')"""
            )).fetchall()
            
            for (job_id,) in outdated_jobs:
                if job_id not in active_job_ids:
                    # Update snapshot to COMPLETED status only if job is not in active jobs
                    db.execute(text(
                        """UPDATE slurm_job_snapshots 
                           SET state = 'COMPLETED', is_current = TRUE 
                           WHERE job_id = :job_id"""
                    ), {"job_id": job_id})
                    
                    # Also update the corresponding Job record if it exists and is not COMPLETED
                    db.execute(text(
                        """UPDATE jobs 
                           SET status = 'COMPLETED', updated_at = CURRENT_TIMESTAMP
                           WHERE job_id = :job_id AND status IN ('PENDING', 'RUNNING')"""
                    ), {"job_id": job_id})
                    
                    slurm_logger.info(
                        f"Marked job {job_id} as COMPLETED "
                        f"(no longer active in SLURM - outdated snapshot)"
                    )
                    
        except Exception as e:
            slurm_logger.error(f"Failed to update job snapshots: {e}")
            raise
            
    async def _update_user_jobs(self, db: Session, user: User) -> List[str]:
        """Update job snapshots for a specific user. Returns list of active job IDs."""
        active_job_ids = []
        
        try:
            # Get active jobs for this user
            active_jobs = await self.slurm_service.get_active_jobs(
                username=user.username
            )
            
            slurm_logger.debug(
                f"Found {len(active_jobs)} active jobs for user "
                f"{user.username}"
            )
            
            for job_data in active_jobs:
                try:
                    job_id = job_data.get("job_id")
                    if not job_id:
                        continue
                        
                    active_job_ids.append(job_id)
                    
                    # Check if snapshot already exists
                    existing_snapshot = db.query(SlurmJobSnapshot).filter(
                        SlurmJobSnapshot.job_id == job_id
                    ).first()
                    
                    # Create job snapshot data
                    node_list = job_data.get("node")
                    if node_list == "(None)":
                        node_list = None
                    
                    snapshot_data = {
                        "user": user.username,  # Actual job owner
                        "name": job_data.get("name"),
                        "partition": job_data.get("partition"),
                        "state": job_data.get("state"),
                        "node": node_list,
                        "node_count": job_data.get("node_count"),
                        "time_used": job_data.get("time_used"),
                        "time_left": job_data.get("time_left"),
                        "memory_requested": job_data.get("memory_requested"),
                        "start_time": job_data.get("start_time"),
                        "submit_time": job_data.get("submit_time"),
                        "reason": job_data.get("reason"),
                        "is_current": True
                    }
                    
                    if existing_snapshot:
                        # Update existing snapshot
                        for key, value in snapshot_data.items():
                            setattr(existing_snapshot, key, value)
                        existing_snapshot.last_updated = func.now()
                    else:
                        # Create new snapshot
                        snapshot = SlurmJobSnapshot(
                            job_id=job_id,
                            **snapshot_data
                        )
                        db.add(snapshot)
                    
                except Exception as e:
                    job_id = job_data.get('job_id', 'unknown')
                    slurm_logger.error(
                        f"Failed to create/update snapshot for job {job_id}: {e}"
                    )
                    
        except Exception as e:
            slurm_logger.error(
                f"Failed to get active jobs for user {user.username}: {e}"
            )
            raise
            
        return active_job_ids
            
    def _safe_int(self, value: str) -> Optional[int]:
        """Safely convert string to int, return None if not possible."""
        if not value or value == "N/A":
            return None
        try:
            return int(value)
        except (ValueError, TypeError):
            return None
            
    def _parse_slurm_time(self, time_str: str) -> Optional[datetime]:
        """Parse SLURM time string to datetime."""
        if not time_str or time_str == "N/A" or time_str == "Unknown":
            return None
            
        try:
            # SLURM time formats can vary, try common ones
            formats = [
                "%Y-%m-%dT%H:%M:%S",  # ISO format
                "%Y-%m-%d %H:%M:%S",  # Space separated
                "%m/%d-%H:%M:%S",     # Month/day format
            ]
            
            for fmt in formats:
                try:
                    dt = datetime.strptime(time_str, fmt)
                    return dt.replace(tzinfo=timezone.utc)
                except ValueError:
                    continue
                    
            # If none of the formats worked, log and return None
            slurm_logger.debug(f"Could not parse time string: {time_str}")
            return None
            
        except Exception as e:
            slurm_logger.debug(f"Error parsing time '{time_str}': {e}")
            return None
            
    async def get_latest_cluster_status(
        self, db: Session
    ) -> Optional[ClusterStatus]:
        """Get the latest cluster status from database."""
        return (
            db.query(ClusterStatus)
            .order_by(ClusterStatus.last_check.desc())
            .first()
        )
        
    async def get_user_job_snapshots(
        self, db: Session, username: str
    ) -> List[SlurmJobSnapshot]:
        """Get the latest job snapshots for a user."""
        # Only return snapshots that are current and in PENDING or RUNNING state
        return db.query(SlurmJobSnapshot).filter(
            SlurmJobSnapshot.user == username,
            SlurmJobSnapshot.is_current.is_(True),
            SlurmJobSnapshot.state.in_(['PENDING', 'RUNNING'])
        ).all()
        
    async def get_job_snapshot(
        self, db: Session, job_id: str
    ) -> Optional[SlurmJobSnapshot]:
        """Get the latest snapshot for a specific job."""
        return db.query(SlurmJobSnapshot).filter(
            SlurmJobSnapshot.job_id == job_id,
            SlurmJobSnapshot.is_current.is_(True)
        ).first()
    
    async def _update_cluster_statistics(self, db: Session):
        """Update cluster statistics (nodes/GPU info) in database."""
        try:
            from app.services.cluster_stats_monitor import (
                ClusterStatsMonitorService
            )
            
            # Create cluster stats monitor service
            cluster_stats_monitor = ClusterStatsMonitorService(db)
            
            # Update cluster statistics
            success = await cluster_stats_monitor.update_cluster_stats()
            
            if success:
                cluster_logger.debug("Successfully updated cluster statistics")
            else:
                cluster_logger.warning("Failed to update cluster statistics")
                
        except Exception as e:
            cluster_logger.error(f"Error updating cluster statistics: {e}")
            # Don't fail the whole monitoring cycle if cluster stats fail


# Global monitor service instance
monitor_service = SlurmMonitorService()
