"""
Domain readiness monitoring service.
Periodically checks if domains are accessible and updates domain_ready status.
"""
import asyncio
import aiohttp
from sqlalchemy.orm import Session
from sqlalchemy import and_

from app.db.models import Job
from app.db.session import SessionLocal
from app.core.logging import cluster_logger


class DomainMonitor:
    """Service to monitor domain readiness."""
    
    def __init__(self, check_interval: int = 30):
        self.check_interval = check_interval
        self.running = False
        self.session_factory = SessionLocal
        
    async def start(self):
        """Start the domain monitoring service as a background task."""
        if not self.running:
            # Create background task for monitoring
            asyncio.create_task(self.start_monitoring())
            cluster_logger.info("Domain monitoring service started as background task")
    
    async def start_monitoring(self):
        """Start the domain monitoring service."""
        self.running = True
        cluster_logger.info("Domain monitoring service started")
        
        while self.running:
            try:
                await self._check_pending_domains()
                await asyncio.sleep(self.check_interval)
            except Exception as e:
                cluster_logger.error(f"Error in domain monitoring: {str(e)}")
                await asyncio.sleep(self.check_interval)
    
    def stop_monitoring(self):
        """Stop the domain monitoring service."""
        self.running = False
        cluster_logger.info("Domain monitoring service stopped")
    
    async def _check_pending_domains(self):
        """Check domains for jobs that are not marked as ready yet."""
        db = self.session_factory()
        try:
            # Find jobs that are running but domain not ready yet
            pending_jobs = db.query(Job).filter(
                and_(
                    Job.status == "RUNNING",
                    Job.domain_ready.is_(False),
                    Job.node.isnot(None),
                    Job.port.isnot(None)
                )
            ).all()
            
            if not pending_jobs:
                return
                
            cluster_logger.info(f"Checking {len(pending_jobs)} pending domains")
            
            for job in pending_jobs:
                try:
                    await self._check_job_domain(job, db)
                except Exception as e:
                    cluster_logger.error(f"Error checking domain for job {job.id}: {str(e)}")
                    
        finally:
            db.close()
    
    async def _check_job_domain(self, job: Job, db: Session):
        """Check if a specific job's domain is accessible."""
        
        # Generate expected domain
        if not job.owner or not job.job_name:
            return
            
        # Use the same domain generation logic as in jobs.py
        from app.services.job import JobService
        
        # Extract user-provided container name
        username_prefix = f"container_{job.owner.username}_"
        if job.job_name.startswith(username_prefix):
            user_container_name = job.job_name[len(username_prefix):]
        else:
            user_container_name = job.job_name
            
        # Sanitize container name for domain using the same method as jobs.py
        safe_container_name = JobService.sanitize_container_name_for_domain(user_container_name)
        if not safe_container_name:
            safe_container_name = f"job{job.id}"
            
        domain = f"{job.owner.username}-{safe_container_name}.orion.zfns.eu.org"
        
        # Check domain accessibility
        is_accessible = await self._check_domain_accessibility(domain)
        
        if is_accessible:
            job.domain_ready = True
            db.commit()
            cluster_logger.info(f"Domain {domain} is now accessible, marked job {job.id} as ready")
        else:
            cluster_logger.debug(f"Domain {domain} not yet accessible for job {job.id}")
    
    async def _check_domain_accessibility(self, domain: str, timeout: int = 10) -> bool:
        """Check if a domain is accessible via HTTP/HTTPS."""
        urls_to_check = [
            f"https://{domain}",
            f"http://{domain}"
        ]
        
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=timeout)) as session:
            for url in urls_to_check:
                try:
                    async with session.get(url, allow_redirects=True) as response:
                        # Consider 2xx, 3xx, 401, and 403 as "accessible"
                        # (container might require auth but domain is working)
                        if response.status < 500:
                            return True
                except Exception:
                    continue
        
        return False
    
    @staticmethod
    def _sanitize_container_name_for_domain(container_name: str) -> str:
        """Sanitize container name to be domain-safe."""
        import re
        
        if not container_name:
            return ""
        
        # Convert to lowercase and replace invalid domain characters
        sanitized = container_name.lower()
        sanitized = re.sub(r"[^a-zA-Z0-9\-]", "-", sanitized)
        sanitized = re.sub(r"-+", "-", sanitized)
        sanitized = sanitized.strip("-")
        
        return sanitized


# Global instance for the monitoring service
domain_monitor = DomainMonitor()
