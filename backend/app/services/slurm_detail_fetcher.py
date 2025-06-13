"""
SLURM Job Detail Fetcher Service

This service handles asynchronous fetching of SLURM job details including
.out file contents for TaskQueueJob instances. It runs on configurable
intervals and triggers based on job state changes.
"""

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Dict, Optional, Set

from sqlalchemy.orm import Session

from ..db.database import get_db
from ..db.models import TaskQueueJob
from .slurm import SlurmSSHService  
from .task_queue import TaskQueueService

logger = logging.getLogger(__name__)


class SlurmDetailFetcher:
    """
    Asynchronous service for fetching SLURM job details and .out file contents.
    
    Triggers:
    - Every 10 minutes for RUNNING jobs
    - Immediately on state transition to RUNNING
    - Immediately on state transition to COMPLETED/FAILED
    - On demand via API call
    """
    
    def __init__(self, slurm_service: SlurmSSHService, 
                 task_queue_service: TaskQueueService):
        self.slurm_service = slurm_service
        self.task_queue_service = task_queue_service
        self.is_running = False
        # Limit concurrent fetches
        self._fetch_semaphore = asyncio.Semaphore(2)
        # Track last fetch per job
        self._last_fetch_times: Dict[str, datetime] = {}
        # Jobs pending immediate fetch
        self._pending_jobs: Set[str] = set()
        
    async def start(self):
        """Start the background detail fetcher."""
        if self.is_running:
            logger.warning("SLURM detail fetcher is already running")
            return
            
        self.is_running = True
        logger.info("Starting SLURM detail fetcher service")
        
        # Start the periodic fetch task
        asyncio.create_task(self._periodic_fetch_loop())
        
    async def stop(self):
        """Stop the background detail fetcher."""
        self.is_running = False
        logger.info("SLURM detail fetcher service stopped")
        
    async def _periodic_fetch_loop(self):
        """Main loop for periodic fetching of job details."""
        while self.is_running:
            try:
                await self._fetch_running_job_details()
                await asyncio.sleep(600)  # 10 minutes
            except Exception as e:
                logger.error(f"Error in periodic fetch loop: {e}", exc_info=True)
                await asyncio.sleep(60)  # Wait 1 minute before retrying
                
    async def _fetch_running_job_details(self):
        """Fetch details for all currently running jobs."""
        try:
            with next(get_db()) as db:
                running_jobs = db.query(TaskQueueJob).filter(
                    TaskQueueJob.status == "RUNNING",
                    TaskQueueJob.slurm_job_id.isnot(None)
                ).all()
                
                if not running_jobs:
                    logger.debug("No running jobs to fetch details for")
                    return
                    
                logger.info(f"Fetching details for {len(running_jobs)} running jobs")
                
                # Create tasks for concurrent fetching
                tasks = []
                for job in running_jobs:
                    task = asyncio.create_task(
                        self._fetch_job_detail_safe(job.slurm_job_id, job.task_id, db)
                    )
                    tasks.append(task)
                    
                # Wait for all fetches to complete
                await asyncio.gather(*tasks, return_exceptions=True)
                
        except Exception as e:
            logger.error(f"Error fetching running job details: {e}", exc_info=True)
            
    async def _fetch_job_detail_safe(self, slurm_job_id: str, task_id: str, db: Session):
        """Safely fetch job details with semaphore control."""
        async with self._fetch_semaphore:
            try:
                await self._fetch_single_job_detail(slurm_job_id, task_id, db)
            except Exception as e:
                logger.error(f"Error fetching details for job {slurm_job_id}: {e}", exc_info=True)
                
    async def _fetch_single_job_detail(self, slurm_job_id: str, task_id: str, db: Session):
        """Fetch detailed information for a single SLURM job."""
        try:
            # Get job details from SLURM
            job_info = await self._get_slurm_job_info(slurm_job_id)
            if not job_info:
                logger.warning(f"No SLURM info found for job {slurm_job_id}")
                return
                
            # Get .out file content
            out_file_content = await self._get_job_output_file(slurm_job_id, job_info)
            
            # Update database
            job = db.query(TaskQueueJob).filter(TaskQueueJob.task_id == task_id).first()
            if job:
                # Update logs with .out file content
                if out_file_content:
                    job.logs = out_file_content
                    
                # Update other job details from SLURM
                if job_info.get('node'):
                    job.node = job_info['node']
                    
                # Update progress if available (parsing of .out content)
                if out_file_content:
                    progress = self._extract_progress_from_output(out_file_content)
                    if progress is not None:
                        job.progress = progress
                    
                db.commit()
                self._last_fetch_times[slurm_job_id] = datetime.now(timezone.utc)
                logger.debug(f"Updated details for job {slurm_job_id}")
                
        except Exception as e:
            logger.error(f"Error fetching details for job {slurm_job_id}: {e}", exc_info=True)
            
    async def _get_slurm_job_info(self, slurm_job_id: str) -> Optional[Dict]:
        """Get detailed job information from SLURM."""
        try:
            # Use scontrol to get detailed job info
            cmd = f"scontrol show job {slurm_job_id}"
            result = await self.slurm_service._execute_async_command(cmd)
            
            if result:
                return self._parse_scontrol_output(result)
            else:
                logger.warning(f"No SLURM info for job {slurm_job_id}")
                return None
                
        except Exception as e:
            logger.error(f"Error getting SLURM job info for "
                         f"{slurm_job_id}: {e}", exc_info=True)
            return None
            
    def _parse_scontrol_output(self, output: str) -> Dict:
        """Parse scontrol show job output into a dictionary."""
        job_info = {}
        
        # Split by spaces and handle key=value pairs
        parts = output.split()
        for part in parts:
            if '=' in part:
                key, value = part.split('=', 1)
                job_info[key.lower()] = value
                
        return job_info
        
    async def _get_job_output_file(self, slurm_job_id: str,
                                   job_info: Dict) -> Optional[str]:
        """Get the contents of the job's .out file."""
        try:
            # Try to find the output file path from job info
            stdout_path = job_info.get('stdout')
            if not stdout_path:
                # Default SLURM output file pattern
                stdout_path = f"slurm-{slurm_job_id}.out"
                
            # Read the file content
            cmd = f"cat {stdout_path}"
            result = await self.slurm_service._execute_async_command(cmd)
            
            if result:
                return result
            else:
                logger.debug(f"Could not read output file {stdout_path} "
                             f"for job {slurm_job_id}")
                return None
                
        except Exception as e:
            logger.error(f"Error reading output file for job "
                         f"{slurm_job_id}: {e}", exc_info=True)
            return None
            
    def _extract_progress_from_output(self, output: str) -> Optional[int]:
        """Extract progress percentage from job output if available."""
        if not output:
            return None
            
        # Look for common progress patterns
        # This would need to be customized based on the actual output format
        # of amumax or other simulation tools
        
        lines = output.strip().split('\n')
        for line in reversed(lines[-20:]):  # Check last 20 lines
            line = line.strip().lower()
            
            # Look for percentage patterns
            if '%' in line:
                import re
                match = re.search(r'(\d+)%', line)
                if match:
                    try:
                        return min(100, max(0, int(match.group(1))))
                    except ValueError:
                        continue
                        
            # Look for step/total patterns (e.g., "Step 150/1000")
            if 'step' in line:
                import re
                match = re.search(r'step\s+(\d+)/(\d+)', line)
                if match:
                    try:
                        current = int(match.group(1))
                        total = int(match.group(2))
                        if total > 0:
                            progress = int((current / total) * 100)
                            return min(100, max(0, progress))
                    except ValueError:
                        continue
                        
        return None
        
    async def trigger_immediate_fetch(self, slurm_job_id: str, task_id: str,
                                       reason: str = "on_demand"):
        """Trigger an immediate fetch for a specific job."""
        if not self.is_running:
            logger.warning("SLURM detail fetcher is not running, "
                          "cannot trigger fetch")
            return
            
        logger.info(f"Triggering immediate fetch for job {slurm_job_id} "
                   f"({reason})")
        
        try:
            with next(get_db()) as db:
                await self._fetch_single_job_detail(slurm_job_id, task_id, db)
        except Exception as e:
            logger.error(f"Error in immediate fetch for job "
                        f"{slurm_job_id}: {e}", exc_info=True)
            
    async def on_job_state_change(self, task_id: str, old_status: str,
                                  new_status: str):
        """Handle job state changes and trigger fetches as needed."""
        if not self.is_running:
            return
            
        # Trigger immediate fetch on transition to RUNNING
        if new_status == "RUNNING" and old_status != "RUNNING":
            with next(get_db()) as db:
                job = db.query(TaskQueueJob).filter(
                    TaskQueueJob.task_id == task_id).first()
                if job and job.slurm_job_id:
                    await self.trigger_immediate_fetch(
                        job.slurm_job_id, task_id, "state_change_to_running")
                    
        # Trigger immediate fetch on completion or failure
        elif (new_status in ["COMPLETED", "FAILED", "ERROR"] and 
              old_status not in ["COMPLETED", "FAILED", "ERROR"]):
            with next(get_db()) as db:
                job = db.query(TaskQueueJob).filter(
                    TaskQueueJob.task_id == task_id).first()
                if job and job.slurm_job_id:
                    await self.trigger_immediate_fetch(
                        job.slurm_job_id, task_id, "state_change_to_completed")
                    
    def should_fetch_job(self, slurm_job_id: str) -> bool:
        """Check if a job should be fetched based on timing constraints."""
        last_fetch = self._last_fetch_times.get(slurm_job_id)
        if not last_fetch:
            return True
            
        # Don't fetch more than once every 5 minutes for the same job
        min_interval = timedelta(minutes=5)
        return datetime.now(timezone.utc) - last_fetch > min_interval


# Global instance
slurm_detail_fetcher: Optional[SlurmDetailFetcher] = None


def get_slurm_detail_fetcher() -> SlurmDetailFetcher:
    """Get the global SLURM detail fetcher instance."""
    global slurm_detail_fetcher
    if slurm_detail_fetcher is None:
        raise RuntimeError("SLURM detail fetcher not initialized")
    return slurm_detail_fetcher


def init_slurm_detail_fetcher(slurm_service: SlurmSSHService,
                              task_queue_service: TaskQueueService):
    """Initialize the global SLURM detail fetcher instance."""
    global slurm_detail_fetcher
    slurm_detail_fetcher = SlurmDetailFetcher(slurm_service,
                                              task_queue_service)
