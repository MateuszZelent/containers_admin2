"""
SLURM monitoring service that periodically fetches cluster and job data
and stores it in the database for use by the API endpoints.
Optimized to minimize direct SLURM connections and reduce network traffic.
"""

import asyncio
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.core.logging import cluster_logger, slurm_logger
from app.db.models import ClusterStatus, Job
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
            # Clear cache before updating to ensure fresh data is served
            self._cache.clear()
            slurm_logger.debug("Cleared monitoring cache before update")

            # Update cluster status
            await self._update_cluster_status(db)

            # Update job statuses
            await self._update_job_statuses(db)

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
                    if status.get("connected") 
                    else None
                ),
                last_check=datetime.now(timezone.utc),
                error_message=(
                    None if status.get("connected") else "Connection failed"
                ),
            )

            db.add(cluster_status)
            cluster_logger.debug(
                f"Updated status: connected={cluster_status.is_connected}"
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

    async def _update_job_statuses(self, db: Session):
        """
        Zoptymalizowana funkcja aktualizacji zadań w SLURM.
        
        Funkcja pobiera stan kolejki SLURM i aktualizuje tylko 
        aktywne zadania bez zbędnego zapisywania historii.
        """
        try:
            # Pobieramy wszystkie aktywne zadania z SLURM w jednym wywołaniu
            slurm_logger.debug("Pobieranie aktywnych zadań z SLURM")
            all_active_jobs = await self.slurm_service.get_active_jobs()

            if not all_active_jobs:
                slurm_logger.debug("Brak aktywnych zadań w SLURM")
                
                # Oznaczamy aktywne zadania jako zakończone
                jobs_to_complete = (
                    db.query(Job)
                    .filter(Job.status.in_(
                        ["PENDING", "RUNNING", "CONFIGURING"]
                    ))
                    .all()
                )

                for job in jobs_to_complete:
                    job.status = "COMPLETED"
                    job.updated_at = datetime.now(timezone.utc)
                    db.add(job)
                
                if jobs_to_complete:
                    slurm_logger.debug(
                        f"Oznaczono {len(jobs_to_complete)} zadań jako "
                        f"zakończone"
                    )
                return

            slurm_logger.debug(
                f"Znaleziono {len(all_active_jobs)} aktywnych zadań"
            )

            # Przygotowanie danych do aktualizacji
            active_job_ids = []

            for job_data in all_active_jobs:
                job_id = job_data.get("job_id")
                if not job_id:
                    continue
                    
                active_job_ids.append(job_id)
                
                # Pobieramy dane o węźle
                node_list = job_data.get("node")
                if node_list == "(None)" or not node_list:
                    node_list = None
                
                # Pobieramy aktualny stan zadania
                state = job_data.get("state", "UNKNOWN")
                
                # Aktualizujemy zadanie w tabeli Job
                job = db.query(Job).filter(Job.job_id == job_id).first()
                if job:
                    # Aktualizacja stanu zadania
                    job.status = state
                    
                    # Jeśli zadanie przeszło ze stanu PENDING do innego i mamy
                    # informację o węźle, aktualizujemy węzeł
                    if job.node is None and node_list is not None:
                        job.node = node_list
                        slurm_logger.debug(
                            f"Węzeł dla zadania {job_id}: {node_list}"
                        )
                    
                    job.updated_at = datetime.now(timezone.utc)
                    db.add(job)
            
            # Oznaczamy zakończone zadania
            if active_job_ids:
                jobs_to_complete = (
                    db.query(Job)
                    .filter(
                        Job.status.in_(
                            ["PENDING", "RUNNING", "CONFIGURING"]
                        ),
                        ~Job.job_id.in_(active_job_ids),
                    )
                    .all()
                )

                for job in jobs_to_complete:
                    job.status = "COMPLETED"
                    job.updated_at = datetime.now(timezone.utc)
                    db.add(job)

                if jobs_to_complete:
                    slurm_logger.debug(
                        f"Oznaczono {len(jobs_to_complete)} zadań jako "
                        f"zakończone"
                    )
            
            db.commit()
            slurm_logger.info(
                f"Aktualizacja zadań zakończona. "
                f"Aktywne zadania: {len(active_job_ids)}"
            )

        except Exception as e:
            slurm_logger.error(f"Błąd podczas aktualizacji zadań: {e}")
            db.rollback()
            raise

    def _safe_int(self, value: str) -> Optional[int]:
        """Safely convert string to int, return None if not possible."""
        if not value or value == "N/A":
            return None
        try:
            return int(value)
        except (ValueError, TypeError):
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

    async def get_user_active_jobs(
        self, db: Session, username: str
    ):
        """
        Pobierz aktywne zadania dla danego użytkownika.
        Zastępuje starą funkcję get_user_job_snapshots.
        """
        try:
            # Pobieramy użytkownika na podstawie nazwy użytkownika
            from app.db.models import User
            
            user = db.query(User).filter(User.username == username).first()
            
            if not user:
                slurm_logger.warning(f"Nie znaleziono użytkownika: {username}")
                return []
                
            # Pobieramy aktywne zadania użytkownika
            jobs = (
                db.query(Job)
                .filter(
                    Job.owner_id == user.id,
                    Job.status.in_(["PENDING", "RUNNING", "CONFIGURING"])
                )
                .all()
            )
            
            slurm_logger.debug(
                f"Pobrano {len(jobs)} zadań dla użytkownika {username}"
            )
            
            return jobs
            
        except Exception as e:
            slurm_logger.error(
                f"Błąd podczas pobierania zadań użytkownika {username}: {e}"
            )
            return []

    async def get_job_snapshot(
        self, db: Session, job_id: str
    ) -> Optional[dict]:
        """
        Pobierz informacje o konkretnym zadaniu z bazy danych.
        Zastępuje starą funkcję get_job_snapshot bazującą na snapshots.
        """
        try:
            job = db.query(Job).filter(Job.job_id == job_id).first()
            
            if not job:
                slurm_logger.debug(f"Nie znaleziono zadania o ID: {job_id}")
                return None
                
            # Tworzymy obiekt podobny do SlurmJobSnapshot
            # dla zachowania kompatybilności
            job_data = {
                "job_id": job.job_id,
                "state": job.status,
                "name": job.job_name,
                "node": job.node,
                "node_count": job.num_nodes,
                "memory_requested": f"{job.memory_gb}G",
                "time_left": "",    # Informacja niedostępna w tabeli Job
                "time_used": "",    # Informacja niedostępna w tabeli Job
                "partition": job.partition,
                "is_current": True,
                "last_updated": job.updated_at,
                "reason": ""        # Informacja niedostępna w tabeli Job
            }
            
            # Ustawiamy obiekt jako słownik z atrybutami
            # dla zachowania kompatybilności
            class DotDict(dict):
                def __getattr__(self, attr):
                    return self.get(attr, None)
            
            result = DotDict(job_data)
            
            return result
            
        except Exception as e:
            slurm_logger.error(
                f"Błąd podczas pobierania informacji o zadaniu {job_id}: {e}"
            )
            return None


# Global monitor service instance
monitor_service = SlurmMonitorService()
