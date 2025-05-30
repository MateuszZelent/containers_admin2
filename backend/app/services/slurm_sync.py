import asyncio
import datetime
from typing import Dict, List, Optional
from sqlalchemy.orm import Session

from app.services.slurm import SlurmSSHService
from app.db.models import Job, User
from app.core.logging import cluster_logger, slurm_logger

class SlurmSyncService:
    """
    Service for periodically synchronizing the database with SLURM status.
    This eliminates the need for direct SLURM queries during API requests.
    """
    
    def __init__(self, db: Session):
        self.db = db
        self.slurm_service = SlurmSSHService()
        self._is_running = False
        self._last_sync = None
        self._task = None

    async def start_background_sync(self):
        """Start background synchronization process."""
        if self._is_running:
            cluster_logger.info("SLURM sync service is already running")
            return {"status": "already_running"}
            
        self._is_running = True
        # Start the sync loop in a background task
        self._task = asyncio.create_task(self._sync_loop())
        
        cluster_logger.info("SLURM background sync service started")
        return {"status": "started"}
        
    async def _sync_loop(self):
        """Run the synchronization loop every 30 seconds."""
        try:
            while self._is_running:
                try:
                    cluster_logger.debug("Starting SLURM data synchronization")
                    await self._sync_all_data()
                    self._last_sync = datetime.datetime.now()
                    cluster_logger.debug(f"SLURM sync completed at {self._last_sync}")
                except Exception as e:
                    cluster_logger.error(f"Error in SLURM sync process: {str(e)}")
                
                # Wait 30 seconds before next sync
                await asyncio.sleep(30)
        finally:
            self._is_running = False
            cluster_logger.info("SLURM sync loop stopped")
    
    async def _sync_all_data(self):
        """Synchronize all SLURM data with the database."""
        # 1. Update cluster status
        await self._sync_cluster_status()
        
        # 2. Update active jobs for all users
        await self._sync_active_jobs()
        
        # 3. Update completed jobs that were previously active
        await self._check_completed_jobs()
    
    async def _sync_cluster_status(self):
        """
        Update cluster status in the database or a global state.
        For now, just log it - would be stored in a database table in a full implementation.
        """
        try:
            status = await self.slurm_service.check_status()
            # Store status in database or cache
            cluster_logger.debug(f"Cluster status updated: {status}")
            # TODO: Store in a global state or database table if needed
        except Exception as e:
            cluster_logger.error(f"Error updating cluster status: {str(e)}")
    
    async def _sync_active_jobs(self):
        """Update active jobs from SLURM to database."""
        try:
            # Get all active jobs from SLURM
            slurm_jobs = await self.slurm_service.get_active_jobs()
            slurm_logger.debug(f"Retrieved {len(slurm_jobs)} active jobs from SLURM")
            
            # Create a map of job_id -> job_info for efficient lookup
            slurm_jobs_map = {job["job_id"]: job for job in slurm_jobs}
            
            # Get all jobs from our database that are in active states
            db_jobs = self.db.query(Job).filter(
                Job.status.in_(["PENDING", "RUNNING", "CONFIGURING"])
            ).all()
            
            for db_job in db_jobs:
                if db_job.job_id in slurm_jobs_map:
                    # Job exists in SLURM, update its status
                    slurm_job = slurm_jobs_map[db_job.job_id]
                    slurm_state = slurm_job["state"]
                    
                    # Convert SLURM state to our status
                    if slurm_state != db_job.status:
                        old_status = db_job.status
                        db_job.status = slurm_state
                        slurm_logger.info(f"Updated job {db_job.job_id} status: {old_status} -> {slurm_state}")
                    
                    # Update node if available
                    if "node" in slurm_job and slurm_job["node"] != "(None)" and slurm_job["node"] != db_job.node:
                        db_job.node = slurm_job["node"]
                        slurm_logger.info(f"Updated job {db_job.job_id} node: {db_job.node}")
                    
                    # Mark job as updated
                    db_job.updated_at = datetime.datetime.utcnow()
                    
                    # Save changes
                    self.db.add(db_job)
                    
                else:
                    # Job not found in SLURM, it might be completed
                    if db_job.status != "COMPLETED":
                        db_job.status = "COMPLETED"
                        db_job.updated_at = datetime.datetime.utcnow()
                        slurm_logger.info(f"Marked job {db_job.job_id} as COMPLETED (not found in SLURM)")
                        self.db.add(db_job)
            
            # Check for new jobs in SLURM not in our DB
            all_db_jobs = self.db.query(Job).all()
            db_job_ids = {job.job_id for job in all_db_jobs if job.job_id is not None}
            
            # Get users keyed by username for looking up owner_id
            users = self.db.query(User).all()
            username_to_user = {user.username: user for user in users}
            
            for slurm_job_id, slurm_job in slurm_jobs_map.items():
                if slurm_job_id not in db_job_ids:
                    # Try to extract username from job name if it follows our naming convention
                    # Example: container_{username}_jobname
                    job_name = slurm_job["name"]
                    if job_name.startswith("container_"):
                        parts = job_name.split("_")
                        if len(parts) > 1:
                            possible_username = parts[1]
                            if possible_username in username_to_user:
                                # Create new job record
                                new_job = Job(
                                    job_id=slurm_job_id,
                                    job_name=job_name,
                                    status=slurm_job["state"],
                                    node=slurm_job["node"] if slurm_job["node"] != "(None)" else None,
                                    owner_id=username_to_user[possible_username].id,
                                    template_name="unknown",  # Default value
                                    created_at=datetime.datetime.utcnow(),
                                    updated_at=datetime.datetime.utcnow()
                                )
                                self.db.add(new_job)
                                slurm_logger.info(f"Added new job {slurm_job_id} from SLURM for user {possible_username}")
            
            # Commit all changes
            self.db.commit()
            
        except Exception as e:
            self.db.rollback()
            slurm_logger.error(f"Error syncing active jobs: {str(e)}")
    
    async def _check_completed_jobs(self):
        """Check status of jobs that might have completed since last sync."""
        try:
            # Get jobs that are in active states but might have completed
            threshold_time = datetime.datetime.utcnow() - datetime.timedelta(minutes=5)
            active_jobs = self.db.query(Job).filter(
                Job.status.in_(["RUNNING", "CONFIGURING"]),
                Job.updated_at < threshold_time
            ).all()
            
            if not active_jobs:
                return
                
            slurm_logger.debug(f"Checking {len(active_jobs)} potentially completed jobs")
            
            # Get all active jobs from SLURM for comparison
            slurm_jobs = await self.slurm_service.get_active_jobs()
            active_slurm_ids = {job["job_id"] for job in slurm_jobs}
            
            # Check each job
            for job in active_jobs:
                if job.job_id not in active_slurm_ids:
                    # Job is no longer active in SLURM, mark as completed
                    job.status = "COMPLETED"
                    job.updated_at = datetime.datetime.utcnow()
                    slurm_logger.info(f"Marked job {job.job_id} as COMPLETED (verification)")
                    self.db.add(job)
            
            # Commit changes
            self.db.commit()
            
        except Exception as e:
            self.db.rollback()
            slurm_logger.error(f"Error checking completed jobs: {str(e)}")
    
    async def stop(self):
        """Stop the background sync process."""
        self._is_running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None
        cluster_logger.info("SLURM background sync service stopped")

    def get_last_sync_time(self) -> Optional[datetime.datetime]:
        """Get the timestamp of the last successful synchronization."""
        return self._last_sync
