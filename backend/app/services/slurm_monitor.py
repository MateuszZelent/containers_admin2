"""
SLURM monitoring service that periodically fetches cluster and job data
and stores it in the database for use by the API endpoints.
Optimized to minimize direct SLURM connections and reduce network traffic.
"""

import asyncio
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.core.logging import cluster_logger, slurm_logger
from app.db.models import SlurmJobSnapshot, ClusterStatus, Job
from app.services.slurm import SlurmSSHService


def upsert_job_snapshot(db: Session, job_data: Dict[str, Any]) -> SlurmJobSnapshot:
    """
    Safely upsert a job snapshot using SQLAlchemy ORM.
    This replaces the raw SQL approach and is much safer.
    """
    try:
        # Try to find existing snapshot
        existing = (
            db.query(SlurmJobSnapshot)
            .filter(SlurmJobSnapshot.job_id == job_data["job_id"])
            .first()
        )

        if existing:
            # Update existing record
            for key, value in job_data.items():
                if key != "job_id":  # Don't update the primary key
                    setattr(existing, key, value)
            existing.is_current = True
            existing.last_updated = datetime.now(timezone.utc)
            db.add(existing)
            return existing
        else:
            # Create new record
            job_data["is_current"] = True
            job_data["last_updated"] = datetime.now(timezone.utc)
            new_snapshot = SlurmJobSnapshot(**job_data)
            db.add(new_snapshot)
            return new_snapshot

    except Exception as e:
        job_id = job_data.get("job_id", "UNKNOWN")
        slurm_logger.error(f"Failed to upsert job snapshot for job {job_id}: {e}")
        raise


def bulk_upsert_job_snapshots(db: Session, jobs_data: List[Dict[str, Any]]) -> int:
    """
    Safely bulk upsert job snapshots using SQLAlchemy ORM.
    Returns the number of successfully processed jobs.
    """
    processed_count = 0

    for job_data in jobs_data:
        try:
            upsert_job_snapshot(db, job_data)
            processed_count += 1
        except Exception as e:
            job_id = job_data.get("job_id", "UNKNOWN")
            slurm_logger.error(f"Failed to process job {job_id}: {e}")
            continue

    try:
        db.commit()
        slurm_logger.debug(f"Successfully committed {processed_count} jobs")
    except Exception as e:
        slurm_logger.error(f"Failed to commit job snapshots: {e}")
        db.rollback()
        raise

    return processed_count


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

        # Cache to reduce database queries
        self._cache: Dict[str, Any] = {}
        self._cache_ttl = 30  # Cache for 30 seconds

    def _is_cache_valid(self, key: str) -> bool:
        """Check if cache entry is still valid."""
        if key not in self._cache:
            return False
        return datetime.now() < self._cache[key]["expires"]

    def _get_from_cache(self, key: str) -> Any:
        """Get value from cache if valid."""
        if self._is_cache_valid(key):
            return self._cache[key]["data"]
        return None

    def _set_cache(self, key: str, data: Any) -> None:
        """Set cache entry with TTL."""
        expires = datetime.now() + timedelta(seconds=self._cache_ttl)
        self._cache[key] = {"data": data, "expires": expires}

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

        self._monitor_task = asyncio.create_task(self._monitor_loop(interval_seconds))

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
            # Clear cache before updating to ensure fresh data is served
            self._cache.clear()
            slurm_logger.debug("Cleared monitoring cache before update")

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
                    datetime.now(timezone.utc) if status.get("connected") else None
                ),
                last_check=datetime.now(timezone.utc),
                error_message=(
                    None if status.get("connected") else "Connection failed"
                ),
            )

            db.add(cluster_status)
            cluster_logger.debug(
                f"Updated cluster status: connected={cluster_status.is_connected}"
            )

        except Exception as e:
            # Still create a record showing the error
            cluster_status = ClusterStatus(
                is_connected=False,
                last_successful_connection=None,
                last_check=datetime.now(timezone.utc),
                error_message=str(e),
            )
            db.add(cluster_status)
            cluster_logger.error(f"Failed to check cluster status: {e}")

    async def _update_job_snapshots(self, db: Session):
        """Update job snapshots for all users - ULTRA-OPTIMIZED VERSION."""
        try:
            # OPTIMIZATION 1: Single SLURM call for ALL jobs
            slurm_logger.debug("Fetching ALL active jobs from SLURM in single call")
            all_active_jobs = await self.slurm_service.get_active_jobs()

            if not all_active_jobs:
                slurm_logger.debug("No active jobs found in SLURM")
                # Mark all current jobs as completed if SLURM returns empty
                # Use ORM instead of raw SQL
                snapshots_to_complete = (
                    db.query(SlurmJobSnapshot)
                    .filter(
                        SlurmJobSnapshot.state.in_(
                            ["PENDING", "RUNNING", "CONFIGURING"]
                        )
                    )
                    .all()
                )

                for snapshot in snapshots_to_complete:
                    snapshot.state = "COMPLETED"
                    snapshot.is_current = True
                    snapshot.last_updated = datetime.now(timezone.utc)
                    db.add(snapshot)

                if snapshots_to_complete:
                    slurm_logger.debug(
                        f"Marked {len(snapshots_to_complete)} jobs as completed"
                    )
                return

            slurm_logger.debug(f"Found {len(all_active_jobs)} total active jobs")

            # OPTIMIZATION 2: Prepare all data for bulk insert in memory
            active_job_ids = []
            bulk_insert_data = []

            for job_data in all_active_jobs:
                job_id = job_data.get("job_id")
                user = job_data.get("user")

                if not job_id or not user:
                    continue

                active_job_ids.append(job_id)

                # Clean node data
                node_list = job_data.get("node")
                if node_list == "(None)" or not node_list:
                    node_list = None

                bulk_insert_data.append(
                    {
                        "job_id": job_id,
                        "user": user,
                        "name": job_data.get("name", ""),
                        "partition": job_data.get("partition", ""),
                        "state": job_data.get("state", "UNKNOWN"),
                        "node": node_list,
                        "node_count": self._safe_int(job_data.get("node_count", "0")),
                        "time_used": job_data.get("time_used", ""),
                        "time_left": job_data.get("time_left", ""),
                        "memory_requested": job_data.get("memory_requested", ""),
                        "start_time": job_data.get("start_time", ""),
                        "submit_time": job_data.get("submit_time", ""),
                        "reason": job_data.get("reason", ""),
                    }
                )

            # OPTIMIZATION 3: Mark all existing snapshots as outdated using ORM
            snapshots_to_update = (
                db.query(SlurmJobSnapshot)
                .filter(
                    SlurmJobSnapshot.state.in_(["PENDING", "RUNNING", "CONFIGURING"])
                )
                .all()
            )

            for snapshot in snapshots_to_update:
                snapshot.is_current = False
                db.add(snapshot)

            # OPTIMIZATION 4: Bulk insert/update all snapshots in one operation
            if bulk_insert_data:
                slurm_logger.debug(
                    f"Bulk updating {len(bulk_insert_data)} job snapshots"
                )

                # Filter out jobs with empty job_id to avoid violations
                valid_jobs = [
                    job
                    for job in bulk_insert_data
                    if job.get("job_id") and job["job_id"].strip()
                ]

                if not valid_jobs:
                    slurm_logger.warning(
                        "No valid jobs to update (all job_ids are empty)"
                    )
                    return

                # Additional validation - check for duplicates in current batch
                job_ids_in_batch = [job["job_id"] for job in valid_jobs]
                unique_job_ids = set(job_ids_in_batch)

                if len(job_ids_in_batch) != len(unique_job_ids):
                    slurm_logger.warning(
                        f"Found duplicate job_ids in current batch: "
                        f"{len(job_ids_in_batch)} total vs "
                        f"{len(unique_job_ids)} unique"
                    )
                    # Remove duplicates, keeping the last occurrence
                    seen = set()
                    unique_jobs = []
                    for job in reversed(valid_jobs):
                        if job["job_id"] not in seen:
                            seen.add(job["job_id"])
                            unique_jobs.append(job)
                    valid_jobs = list(reversed(unique_jobs))
                    slurm_logger.info(f"After deduplication: {len(valid_jobs)} jobs")

                slurm_logger.debug(
                    f"About to insert/update {len(valid_jobs)} jobs with IDs: "
                    f"{[j['job_id'] for j in valid_jobs[:5]]}..."
                )

                # Use modern SQLAlchemy ORM instead of raw SQL for safety
                try:
                    processed_count = bulk_upsert_job_snapshots(db, valid_jobs)
                    slurm_logger.debug(
                        f"Successfully processed {processed_count} job snapshots"
                    )
                except Exception as e:
                    slurm_logger.error(f"Failed to process job snapshots: {e}")
                    # The ORM function already handles individual job errors
                    return

            # OPTIMIZATION 5: Bulk update completed jobs using ORM
            if active_job_ids:
                slurm_logger.debug("Marking non-active jobs as COMPLETED")

                # Update Job table using ORM
                jobs_to_complete = (
                    db.query(Job)
                    .filter(
                        Job.status.in_(["PENDING", "RUNNING", "CONFIGURING"]),
                        ~Job.job_id.in_(active_job_ids),
                    )
                    .all()
                )

                for job in jobs_to_complete:
                    job.status = "COMPLETED"
                    job.updated_at = datetime.now(timezone.utc)
                    db.add(job)

                # Also update old snapshots using ORM
                snapshots_to_complete = (
                    db.query(SlurmJobSnapshot)
                    .filter(
                        SlurmJobSnapshot.state.in_(
                            ["PENDING", "RUNNING", "CONFIGURING"]
                        ),
                        SlurmJobSnapshot.is_current.is_(False),
                        ~SlurmJobSnapshot.job_id.in_(active_job_ids),
                    )
                    .all()
                )

                for snapshot in snapshots_to_complete:
                    snapshot.state = "COMPLETED"
                    snapshot.is_current = True
                    snapshot.last_updated = datetime.now(timezone.utc)
                    db.add(snapshot)

                if jobs_to_complete or snapshots_to_complete:
                    slurm_logger.debug(
                        f"Marked {len(jobs_to_complete)} jobs and "
                        f"{len(snapshots_to_complete)} snapshots as completed"
                    )

            # Count results by user for logging
            users_count = len(set(item["user"] for item in bulk_insert_data))

            slurm_logger.info(
                f"Job snapshots update completed efficiently. "
                f"Active jobs: {len(active_job_ids)}, "
                f"Users with jobs: {users_count}"
            )

        except Exception as e:
            slurm_logger.error(f"Failed to update job snapshots: {e}")
            raise

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
                "%m/%d-%H:%M:%S",  # Month/day format
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

    async def get_latest_cluster_status(self, db: Session) -> Optional[ClusterStatus]:
        """Get the latest cluster status from database."""
        return db.query(ClusterStatus).order_by(ClusterStatus.last_check.desc()).first()

    async def get_user_job_snapshots(
        self, db: Session, username: str
    ) -> List[SlurmJobSnapshot]:
        """Get the latest job snapshots for a user."""
        # Always query fresh from DB to avoid SQLAlchemy session issues
        snapshots = (
            db.query(SlurmJobSnapshot)
            .filter(
                SlurmJobSnapshot.user == username,
                SlurmJobSnapshot.is_current.is_(True),
                SlurmJobSnapshot.state.in_(["PENDING", "RUNNING", "CONFIGURING"]),
            )
            .all()
        )

        slurm_logger.debug(
            f"Retrieved {len(snapshots)} job snapshots for user {username}"
        )

        return snapshots

    async def get_job_snapshot(
        self, db: Session, job_id: str
    ) -> Optional[SlurmJobSnapshot]:
        """Get the latest snapshot for a specific job."""
        # Always get fresh object from DB to avoid session issues
        snapshot = (
            db.query(SlurmJobSnapshot)
            .filter(
                SlurmJobSnapshot.job_id == job_id, SlurmJobSnapshot.is_current.is_(True)
            )
            .first()
        )

        return snapshot

    async def _update_cluster_statistics(self, db: Session):
        """Update cluster statistics (nodes/GPU info) in database."""
        try:
            from app.services.cluster_stats_monitor import ClusterStatsMonitorService

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
