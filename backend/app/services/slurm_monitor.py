"""
SLURM monitoring service that periodically fetches cluster and job data
and stores it in the database for use by the API endpoints.
Optimized to minimize direct SLURM connections and reduce network traffic.
"""

import asyncio
import re
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

    async def start_monitoring(self, interval_seconds: int = 120):
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

        Funkcja pobiera stan kolejki SLURM RAZ i aktualizuje zarówno
        zadania kontenerów (Job) jak i zadania task_queue (TaskQueueJob)
        używając dedykowanych metod filtrujących dla maksymalnej wydajności.
        """
        try:
            # Pobieramy wszystkie aktywne zadania z SLURM w jednym wywołaniu
            slurm_logger.debug("Pobieranie wszystkich aktywnych zadań z SLURM (RAW)")
            all_active_jobs_raw = await self.slurm_service.get_all_active_jobs_raw()

            if not all_active_jobs_raw:
                slurm_logger.debug("Brak aktywnych zadań w SLURM")
                
                # Oznaczamy wszystkie aktywne zadania jako zakończone
                await self._mark_inactive_jobs_completed(db, [])
                await self._mark_inactive_task_queue_jobs_completed(db, [])
                
                return

            slurm_logger.debug(
                f"Pobrano {len(all_active_jobs_raw)} RAW zadań z SLURM"
            )

            # Filtrujemy zadania używając dedykowanych metod
            container_jobs_data = self.slurm_service.filter_jobs_for_containers(
                all_active_jobs_raw
            )
            task_queue_jobs_data = self.slurm_service.filter_jobs_for_task_queue(
                all_active_jobs_raw
            )
            admin_jobs_data = self.slurm_service.filter_jobs_for_admin(
                all_active_jobs_raw
            )

            slurm_logger.debug(
                f"Po filtrowaniu: kontenery={len(container_jobs_data)}, "
                f"task_queue={len(task_queue_jobs_data)}, "
                f"admin={len(admin_jobs_data)}"
            )

            # Przygotowanie danych do aktualizacji - ROZDZIELENIE PO TYPACH
            active_container_job_ids = []
            active_task_queue_job_ids = []
            active_admin_job_ids = []
            
            container_jobs = []
            task_queue_jobs = []
            admin_jobs = []

            # Przetwarzamy zadania kontenerów
            for job_data in container_jobs_data:
                job_id = job_data.get("job_id")
                if job_id:
                    active_container_job_ids.append(job_id)
                    container_jobs.append((job_id, job_data))

            # Przetwarzamy zadania task_queue (WŁĄCZNIE z amp_*)
            for job_data in task_queue_jobs_data:
                job_id = job_data.get("job_id")
                if job_id:
                    active_task_queue_job_ids.append(job_id)
                    task_queue_jobs.append((job_id, job_data))
            
            # Przetwarzamy zadania admin (zadania spoza naszego systemu)
            for job_data in admin_jobs_data:
                job_id = job_data.get("job_id")
                if job_id:
                    active_admin_job_ids.append(job_id)
                    admin_jobs.append((job_id, job_data))
            
            # Aktualizujemy zadania wsadowo dla lepszej wydajności
            if container_jobs:
                await self._update_container_jobs_batch(db, container_jobs)
            
            if task_queue_jobs:
                await self._update_task_queue_jobs_batch(db, task_queue_jobs)
            
            if admin_jobs:
                await self._update_admin_jobs_batch(db, admin_jobs)
            
            # Oznaczamy nieaktywne zadania jako zakończone - odpowiednie listy
            await self._mark_inactive_jobs_completed(
                db, active_container_job_ids
            )
            await self._mark_inactive_task_queue_jobs_completed(
                db, active_task_queue_job_ids
            )
            
            total_active = (len(active_container_job_ids) +
                            len(active_task_queue_job_ids) +
                            len(active_admin_job_ids))
            slurm_logger.info(
                f"Aktualizacja zadań zakończona. "
                f"Aktywne: {total_active} "
                f"(kontenery: {len(container_jobs)}, "
                f"task_queue: {len(task_queue_jobs)}, "
                f"admin: {len(admin_jobs)})"
            )

        except Exception as e:
            slurm_logger.error(f"Błąd podczas aktualizacji zadań: {e}")
            db.rollback()
            raise

    async def _update_container_jobs_batch(self, db: Session,
                                           container_jobs: list):
        """Wsadowa aktualizacja zadań kontenerów dla lepszej wydajności."""
        for job_id, job_data in container_jobs:
            await self._update_container_job(db, job_id, job_data)

    async def _update_task_queue_jobs_batch(self, db: Session,
                                            task_queue_jobs: list):
        """Wsadowa aktualizacja zadań task_queue dla lepszej wydajności."""
        for job_id, job_data in task_queue_jobs:
            await self._update_task_queue_job(db, job_id, job_data)

    async def _update_admin_jobs_batch(self, db: Session,
                                       admin_jobs: list):
        """Wsadowa aktualizacja zadań admin (inne niż container/task)."""
        for job_id, job_data in admin_jobs:
            await self._update_admin_job(db, job_id, job_data)

    async def _update_unknown_jobs_batch(self, db: Session,
                                         unknown_jobs: list):
        """Wsadowa aktualizacja nieznanych zadań."""
        for job_id, job_data in unknown_jobs:
            await self._update_unknown_job(db, job_id, job_data)

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

    async def get_user_active_tasks(
        self, db: Session, username: str
    ):
        """
        Pobierz aktywne zadania task_queue dla danego użytkownika.
        Uzupełnia get_user_active_jobs o zadania z task_queue.
        """
        try:
            from app.db.models import User, TaskQueueJob
            
            user = db.query(User).filter(User.username == username).first()
            
            if not user:
                slurm_logger.warning(f"Nie znaleziono użytkownika: {username}")
                return []
                
            # Pobieramy aktywne zadania task_queue użytkownika
            tasks = (
                db.query(TaskQueueJob)
                .filter(
                    TaskQueueJob.owner_id == user.id,
                    TaskQueueJob.status.in_(
                        ["PENDING", "RUNNING", "CONFIGURING"]
                    )
                )
                .all()
            )
            
            slurm_logger.debug(
                f"Pobrano {len(tasks)} zadań task_queue "
                f"dla użytkownika {username}"
            )
            
            return tasks
            
        except Exception as e:
            slurm_logger.error(
                f"Błąd podczas pobierania zadań task_queue "
                f"użytkownika {username}: {e}"
            )
            return []

    async def get_user_all_active_jobs(
        self, db: Session, username: str
    ):
        """
        Pobierz wszystkie aktywne zadania (kontenery + task_queue)
        dla danego użytkownika w ujednoliconym formacie.
        """
        try:
            # Pobieramy zadania kontenerów
            container_jobs = await self.get_user_active_jobs(db, username)
            
            # Pobieramy zadania task_queue
            task_queue_jobs = await self.get_user_active_tasks(db, username)
            
            # Ujednolicamy format danych
            all_jobs = []
            
            # Dodajemy kontenery
            for job in container_jobs:
                all_jobs.append({
                    "id": job.id,
                    "job_id": job.job_id,
                    "name": job.job_name,
                    "type": "container",
                    "status": job.status,
                    "node": job.node,
                    "partition": job.partition,
                    "num_cpus": job.num_cpus,
                    "memory_gb": job.memory_gb,
                    "num_gpus": job.num_gpus,
                    "time_limit": job.time_limit,
                    "time_left": job.time_left,
                    "time_used": job.time_used,
                    "template_name": job.template_name,
                    "created_at": job.created_at,
                    "updated_at": job.updated_at,
                })
            
            # Dodajemy zadania task_queue
            for task in task_queue_jobs:
                all_jobs.append({
                    "id": task.id,
                    "job_id": task.slurm_job_id or f"task_{task.id}",
                    "name": task.name,
                    "type": "task_queue",
                    "status": task.status,
                    # Wypełnione jeśli task ma slurm_job_id
                    "node": None,
                    "partition": task.partition,
                    "num_cpus": task.num_cpus,
                    "memory_gb": task.memory_gb,
                    "num_gpus": task.num_gpus,
                    "time_limit": task.time_limit,
                    "time_left": "",
                    "time_used": "",
                    "template_name": "task_queue",
                    "simulation_file": task.simulation_file,
                    "progress": task.progress,
                    "created_at": task.created_at,
                    "updated_at": task.finished_at or task.started_at,
                })
            
            slurm_logger.debug(
                f"Pobrano łącznie {len(all_jobs)} aktywnych zadań "
                f"dla użytkownika {username} "
                f"({len(container_jobs)} kontenerów, "
                f"{len(task_queue_jobs)} task_queue)"
            )
            
            return all_jobs
            
        except Exception as e:
            slurm_logger.error(
                f"Błąd podczas pobierania wszystkich aktywnych zadań "
                f"użytkownika {username}: {e}"
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

    def _is_container_job(self, job_name: str) -> bool:
        """Check if job is a container job based on name pattern."""
        return job_name.startswith("container_")
    
    def _is_task_queue_job(self, job_name: str) -> bool:
        """Check if job is a task queue job based on name pattern."""
        # Include all task patterns including amp_* which are also tasks
        return (job_name.startswith("amumax_task_") or  # Our amumax tasks
                job_name.startswith("python_task_") or   # Our python tasks
                job_name.startswith("simulation_task_") or  # Our simulation tasks
                job_name.startswith("amp_") or   # amp tasks are also tasks
                job_name.startswith("task_"))  # Generic task prefix

    async def _update_container_job(self, db: Session, job_id: str,
                                    job_data: dict):
        """Update a container job in the Job table."""
        node_list = job_data.get("node")
        if node_list == "(None)" or not node_list:
            node_list = None
        state = job_data.get("state", "UNKNOWN")

        # Map SLURM state to full status name for containers
        # Import the mapping from TaskQueueService to ensure consistency
        from app.services.task_queue import TaskQueueService
        
        mapped_status_enum = TaskQueueService.SLURM_STATE_MAPPING.get(
            state, "UNKNOWN"
        )
        # Convert enum to string for database storage
        if hasattr(mapped_status_enum, 'value'):
            mapped_status = mapped_status_enum.value
        else:
            mapped_status = str(mapped_status_enum)

        job = db.query(Job).filter(Job.job_id == job_id).first()
        if job:
            # Aktualizacja stanu zadania
            job.status = mapped_status
            job.time_left = job_data.get("time_left", "")
            job.time_used = job_data.get("time_used", "")
            if job.node is None and node_list is not None:
                job.node = node_list
                slurm_logger.debug(f"Węzeł dla zadania {job_id}: {node_list}")
            job.updated_at = datetime.now(timezone.utc)
            db.add(job)
        else:
            # Utwórz nowe zadanie kontenera
            job_name = job_data.get("name", f"slurm_job_{job_id}")
            owner_id = self._extract_owner_from_job_name(db, job_name)

            new_job = Job(
                job_id=job_id,
                job_name=job_name,
                status=mapped_status,
                node=node_list,
                partition=job_data.get("partition", "proxima"),
                num_nodes=self._safe_int(str(job_data.get("node_count", ""))),
                num_cpus=self._safe_int(str(job_data.get("num_cpus", ""))),
                memory_gb=self._safe_int(
                    str(job_data.get("memory_requested", "")).replace("G", "")
                ),
                time_limit=job_data.get("time_limit", "24:00:00"),
                time_left=job_data.get("time_left", ""),
                time_used=job_data.get("time_used", ""),
                created_at=datetime.now(timezone.utc),
                updated_at=datetime.now(timezone.utc),
                owner_id=owner_id,
            )
            db.add(new_job)
            slurm_logger.info(
                f"Dodano nowe zadanie kontenera: {job_id}, owner_id={owner_id}"
            )

    async def _update_task_queue_job(self, db: Session, job_id: str,
                                     job_data: dict):
        """Update a task queue job in the TaskQueueJob table."""
        from app.db.models import TaskQueueJob

        node_list = job_data.get("node")
        if node_list == "(None)" or not node_list:
            node_list = None
        state = job_data.get("state", "UNKNOWN")

        # Import the mapping from TaskQueueService to ensure consistency
        from app.services.task_queue import TaskQueueService
        
        mapped_status_enum = TaskQueueService.SLURM_STATE_MAPPING.get(
            state, "UNKNOWN"
        )
        # Convert enum to string for database storage
        if hasattr(mapped_status_enum, 'value'):
            mapped_status = mapped_status_enum.value
        else:
            mapped_status = str(mapped_status_enum)

        # Find task by SLURM job ID
        task = (db.query(TaskQueueJob)
                .filter(TaskQueueJob.slurm_job_id == job_id)
                .first())

        if task:
            # Update existing task
            old_status = task.status
            task.status = mapped_status

            # Only update node if it actually changed
            if node_list and node_list != task.node:
                task.node = node_list
                slurm_logger.debug(
                    f"Node updated for task {job_id}: {task.node} -> {node_list}"
                )

            # Only update timestamps if status actually changed
            task_updated = False
            if old_status != mapped_status:
                task_updated = True
                if mapped_status == "RUNNING" and not task.started_at:
                    task.started_at = datetime.now(timezone.utc)
                elif mapped_status in ["COMPLETED", "ERROR", "CANCELLED",
                                       "TIMEOUT"] and not task.finished_at:
                    task.finished_at = datetime.now(timezone.utc)

            # Only update progress for running tasks if it changed
            if mapped_status == "RUNNING":
                progress = self._estimate_task_progress(task, job_data)
                if progress is not None and progress != task.progress:
                    task.progress = progress
                    task_updated = True

            # Only commit if something actually changed
            if task_updated or (node_list and node_list != task.node):
                db.add(task)
                # Only log significant changes
                if old_status != mapped_status:
                    slurm_logger.info(
                        f"Task {job_id} status: {old_status} -> {mapped_status}"
                    )
        else:
            # Task not found in database - this is a SLURM job that wasn't created through our API
            # This can happen for jobs submitted directly to SLURM
            # We don't create orphaned tasks automatically to avoid database pollution
            slurm_logger.debug(
                f"SLURM job {job_id} ({job_data.get('name', 'unknown')}) "
                f"not found in TaskQueueJob table - skipping (external job)"
            )
    
    async def _update_admin_job(self, db: Session, job_id: str,
                                job_data: dict):
        """Update admin job (non-container/task) - treat as container job."""
        job_name = job_data.get("name", f"admin_job_{job_id}")
        slurm_logger.debug(
            f"Aktualizuję zadanie admin: {job_name} (ID: {job_id})"
        )

        # Admin jobs (non-container/task) are treated as container jobs
        # but typically assigned to admin user by default
        await self._update_container_job(db, job_id, job_data)
    
    async def _update_unknown_job(self, db: Session, job_id: str,
                                  job_data: dict):
        """Handle unknown job types - store as regular Job."""
        job_name = job_data.get("name", f"unknown_job_{job_id}")
        slurm_logger.info(
            f"Nieznany typ zadania: {job_name}, zapisuję jako Job"
        )

        # Treat as container job for now
        await self._update_container_job(db, job_id, job_data)

    def _extract_owner_from_job_name(self, db: Session, job_name: str) -> int:
        """
        Extract owner ID from any job name using various patterns.
        Creates user if doesn't exist in database.
        """
        import re
        from app.db.models import User

        # Default to admin user (ID=1)
        default_owner_id = 1
        username = None

        # Pattern 1: container_<user>_<name> (e.g., container_admin_glowny)
        m = re.match(r"container_([a-zA-Z0-9]+)_", job_name)
        if m:
            username = m.group(1).lower()
        
        # Pattern 2: amumax_task_<id>_<user> (e.g., amumax_task_9c7acd3a_admin)
        elif job_name.startswith("amumax_task_"):
            m = re.match(r"amumax_task_[a-zA-Z0-9]+_([a-zA-Z0-9]+)", job_name)
            if m:
                username = m.group(1).lower()
        
        # Pattern 3: amp_<value> - te zadania należą do wszystkich,
        # ale domyślnie przypisujemy do admin
        elif job_name.startswith("amp_"):
            username = "admin"
        
        # Pattern 4: inne wzorce amumax_, python_, task_
        elif any(job_name.startswith(prefix) for prefix in
                 ["amumax_", "python_", "simulation_", "task_"]):
            # Spróbuj wyciągnąć username z końca nazwy
            parts = job_name.split("_")
            if len(parts) >= 2:
                # Sprawdź czy ostatnia część wygląda jak username
                potential_username = parts[-1]
                if re.match(r"^[a-zA-Z][a-zA-Z0-9]*$", potential_username):
                    username = potential_username.lower()

        if not username:
            slurm_logger.warning(
                f"Nie można wyciągnąć nazwy użytkownika z zadania: "
                f"{job_name}, używam domyślnego administratora"
            )
            return default_owner_id

        # Szukaj użytkownika w bazie danych
        user = db.query(User).filter(User.username == username).first()
        
        if user:
            slurm_logger.debug(
                f"Znaleziono użytkownika {username} (ID: {user.id}) "
                f"dla zadania {job_name}"
            )
            return user.id
        
        # Jeśli użytkownik nie istnieje, utwórz go automatycznie
        slurm_logger.info(
            f"Tworzę nowego użytkownika '{username}' "
            f"z zadania SLURM: {job_name}"
        )
        
        try:
            new_user = User(
                username=username,
                email=f"{username}@pcss.pl",  # Domyślny email
                first_name=username.capitalize(),
                last_name="PCSS",
                hashed_password="placeholder_password_needs_reset",
                is_active=True,
                is_superuser=False,
                max_containers=6,
                max_gpus=24
            )
            
            db.add(new_user)
            db.commit()
            db.refresh(new_user)
            
            slurm_logger.info(
                f"Utworzono nowego użytkownika {username} "
                f"(ID: {new_user.id})"
            )
            
            return new_user.id
            
        except Exception as e:
            slurm_logger.error(
                f"Błąd podczas tworzenia użytkownika {username}: {e}"
            )
            db.rollback()
            return default_owner_id

    def _estimate_task_progress(self, task, job_data: dict) -> Optional[int]:
        """Estimate progress for a running task based on time."""
        if not task.started_at:
            return 0

        time_used_str = job_data.get("time_used", "")
        time_limit_str = task.time_limit or "24:00:00"

        try:
            # Parse time strings (format: HH:MM:SS or D-HH:MM:SS)
            time_used_seconds = self._parse_time_to_seconds(time_used_str)
            time_limit_seconds = self._parse_time_to_seconds(time_limit_str)

            if time_used_seconds and time_limit_seconds:
                progress = min(
                    100, int((time_used_seconds / time_limit_seconds) * 100)
                )
                return progress
        except Exception as e:
            slurm_logger.debug(f"Błąd oszacowania postępu: {e}")

        return None
    
    def _parse_time_to_seconds(self, time_str: str) -> Optional[int]:
        """Parse SLURM time format to seconds."""
        if not time_str or time_str == "N/A":
            return None
        
        try:
            # Handle format D-HH:MM:SS
            if '-' in time_str:
                days_part, time_part = time_str.split('-', 1)
                days = int(days_part)
                hours, minutes, seconds = map(int, time_part.split(':'))
                return days * 86400 + hours * 3600 + minutes * 60 + seconds
            
            # Handle format HH:MM:SS
            parts = time_str.split(':')
            if len(parts) == 3:
                hours, minutes, seconds = map(int, parts)
                return hours * 3600 + minutes * 60 + seconds
            
        except (ValueError, AttributeError):
            pass
        
        return None
    
    async def _mark_inactive_jobs_completed(self, db: Session,
                                            active_job_ids: list):
        """Mark inactive container jobs as completed."""
        if active_job_ids:
            jobs_to_complete = (
                db.query(Job)
                .filter(
                    Job.status.in_(["PENDING", "RUNNING", "CONFIGURING"]),
                    ~Job.job_id.in_(active_job_ids),
                )
                .all()
            )
        else:
            jobs_to_complete = (
                db.query(Job)
                .filter(Job.status.in_(["PENDING", "RUNNING", "CONFIGURING"]))
                .all()
            )

        for job in jobs_to_complete:
            job.status = "COMPLETED"
            job.updated_at = datetime.now(timezone.utc)
            db.add(job)

        if jobs_to_complete:
            slurm_logger.debug(
                f"Oznaczono {len(jobs_to_complete)} zadań kontenerów "
                f"jako zakończone"
            )
    
    async def _mark_inactive_task_queue_jobs_completed(self, db: Session,
                                                       active_job_ids: list):
        """Mark inactive task queue jobs as completed."""
        from app.db.models import TaskQueueJob
        
        if active_job_ids:
            tasks_to_complete = (
                db.query(TaskQueueJob)
                .filter(
                    TaskQueueJob.status.in_(
                        ["PENDING", "RUNNING", "CONFIGURING"]
                    ),
                    TaskQueueJob.slurm_job_id.isnot(None),
                    ~TaskQueueJob.slurm_job_id.in_(active_job_ids),
                )
                .all()
            )
        else:
            tasks_to_complete = (
                db.query(TaskQueueJob)
                .filter(
                    TaskQueueJob.status.in_(
                        ["PENDING", "RUNNING", "CONFIGURING"]
                    ),
                    TaskQueueJob.slurm_job_id.isnot(None),
                )
                .all()
            )

        for task in tasks_to_complete:
            # Determine final status based on last known state
            task.status = "COMPLETED"  # Default to completed
            task.finished_at = datetime.now(timezone.utc)
            if task.status == "COMPLETED":
                task.progress = 100
            db.add(task)

        if tasks_to_complete:
            slurm_logger.debug(
                f"Oznaczono {len(tasks_to_complete)} zadań task_queue "
                f"jako zakończone"
            )


# Global monitor service instance
monitor_service = SlurmMonitorService()
