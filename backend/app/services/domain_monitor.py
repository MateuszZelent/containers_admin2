"""
Domain readiness monitoring service.
Periodically checks if domains are accessible and updates domain_ready status.
"""
import asyncio
import aiohttp
from sqlalchemy.orm import Session
from sqlalchemy import and_
from typing import Dict, Optional

from app.db.models import Job
from app.db.session import SessionLocal
from app.core.logging import cluster_logger
from app.core.config import settings


class DomainMonitor:
    """Service to monitor domain readiness."""
    
    def __init__(
        self,
        check_interval: int = 30,
        max_attempts: int = 3,
        caddy_admin_url: Optional[str] = None
    ):
        self.check_interval = check_interval
        self.max_attempts = max_attempts
        self.caddy_admin_url = caddy_admin_url or settings.CADDY_API_URL
        self.running = False
        self.session_factory = SessionLocal
        # Track attempts per job to avoid infinite checking
        self.job_attempts: Dict[int, int] = {}
        
    async def start(self):
        """Start the domain monitoring service as a background task."""
        if not self.running:
            # Create background task for monitoring
            asyncio.create_task(self.start_monitoring())
            cluster_logger.info(
                "Domain monitoring service started as background task"
            )
    
    async def start_monitoring(self):
        """Start the domain monitoring service."""
        self.running = True
        cluster_logger.info("Domain monitoring service started")
        
        while self.running:
            try:
                await self._check_pending_domains()
                await asyncio.sleep(self.check_interval)  # Fixed: Added await
            except Exception as e:
                cluster_logger.error(f"Error in domain monitoring: {str(e)}")
                await asyncio.sleep(self.check_interval)  # Fixed: Added await
    
    def stop_monitoring(self):
        """Stop the domain monitoring service."""
        self.running = False
        cluster_logger.info("Domain monitoring service stopped")
    
    async def _check_pending_domains(self):
        """Check domains for jobs that have active SSH tunnels."""
        db = self.session_factory()
        try:
            # Find jobs that are running but domain not ready yet
            # AND have at least one active SSH tunnel
            pending_jobs = db.query(Job).filter(
                and_(
                    Job.status == "RUNNING",
                    Job.domain_ready.is_(False),
                    Job.node.isnot(None),
                    Job.port.isnot(None)
                )
            ).all()
            
            if not pending_jobs:
                # Clean up attempts tracking for completed jobs
                self.job_attempts.clear()
                return
            
            # Filter jobs to only those with active SSH tunnels
            jobs_with_active_tunnels = []
            for job in pending_jobs:
                if self._has_active_tunnel(job):
                    jobs_with_active_tunnels.append(job)
                else:
                    # Log why we're skipping this job
                    cluster_logger.debug(
                        f"Skipping domain check for job {job.id} - "
                        "no active SSH tunnels"
                    )
                    
            if not jobs_with_active_tunnels:
                cluster_logger.debug(
                    "No jobs with active tunnels found for domain monitoring"
                )
                return
                
            cluster_logger.info(
                f"Checking {len(jobs_with_active_tunnels)} pending domains "
                f"(filtered from {len(pending_jobs)} total running jobs)"
            )
            
            for job in jobs_with_active_tunnels:
                # Check if we've exceeded max attempts for this job
                attempts = self.job_attempts.get(job.id, 0)
                if attempts >= self.max_attempts:
                    cluster_logger.warning(
                        f"Job {job.id} exceeded maximum domain check attempts "
                        f"({self.max_attempts}), skipping further checks"
                    )
                    continue
                
                try:
                    await self._check_job_domain(job, db)
                except Exception as e:
                    cluster_logger.error(
                        f"Error checking domain for job {job.id}: {str(e)}"
                    )
                    
        finally:
            db.close()
    
    def _has_active_tunnel(self, job: Job) -> bool:
        """Check if the job has at least one active SSH tunnel."""
        if not job.tunnels:
            return False
            
        # Check if any tunnel is in ACTIVE status and has valid PID
        for tunnel in job.tunnels:
            if tunnel.status == "ACTIVE":
                # Additional check: verify tunnel process is actually running
                if tunnel.ssh_pid and self._is_process_running(tunnel.ssh_pid):
                    cluster_logger.debug(
                        f"Job {job.id} has active tunnel {tunnel.id} "
                        f"with SSH PID {tunnel.ssh_pid}"
                    )
                    return True
                else:
                    cluster_logger.debug(
                        f"Job {job.id} tunnel {tunnel.id} marked as ACTIVE "
                        f"but SSH PID {tunnel.ssh_pid} not running"
                    )
        
        return False
    
    def _is_process_running(self, pid: int) -> bool:
        """Check if a process with given PID is running."""
        try:
            import os
            import errno
            
            if pid <= 0:
                return False
                
            # Send signal 0 to check if process exists
            os.kill(pid, 0)
            return True
        except OSError as e:
            if e.errno == errno.ESRCH:
                # Process does not exist
                return False
            elif e.errno == errno.EPERM:
                # Process exists but we don't have permission
                # (still means it's running)
                return True
            else:
                # Other error
                cluster_logger.error(
                    f"Error checking if PID {pid} is running: {e}"
                )
                return False
        except Exception as e:
            cluster_logger.error(f"Unexpected error checking PID {pid}: {e}")
            return False
    
    async def _check_job_domain(self, job: Job, db: Session):
        """Check if a specific job's domain is accessible."""
        
        # Generate expected domain
        if not job.owner or not job.job_name:
            cluster_logger.warning(
                f"Job {job.id} missing owner or job_name, skipping"
            )
            return
            
        # Sanitize container name for domain
        safe_container_name = self._sanitize_container_name_for_domain(
            job.job_name
        )
        domain = (
            f"{job.owner.username}-{safe_container_name}"
            ".orion.zfns.eu.org"
        )
        
        # Increment attempt counter
        self.job_attempts[job.id] = self.job_attempts.get(job.id, 0) + 1
        attempt_num = self.job_attempts[job.id]
        
        cluster_logger.info(
            f"Checking domain {domain} for job {job.id} "
            f"(attempt {attempt_num}/{self.max_attempts})"
        )
        
        # First check if Caddy has the domain configured
        caddy_configured = await self._check_caddy_configuration(domain)
        if not caddy_configured:
            cluster_logger.warning(
                f"Domain {domain} not found in Caddy configuration "
                f"for job {job.id}"
            )
            return
        
        # Check domain accessibility
        is_accessible, error_msg = await self._check_domain_accessibility(
            domain
        )
        
        if is_accessible:
            job.domain_ready = True
            db.commit()
            # Remove from tracking since it's now ready
            self.job_attempts.pop(job.id, None)
            cluster_logger.info(
                f"Domain {domain} is now accessible, "
                f"marked job {job.id} as ready"
            )
        else:
            cluster_logger.warning(
                f"Domain {domain} not yet accessible for job {job.id}: "
                f"{error_msg}"
            )
    
    async def _check_caddy_configuration(self, domain: str) -> bool:
        """Check if domain is configured in Caddy."""
        cluster_logger.debug(
            f"Checking Caddy configuration for domain {domain} "
            f"at URL: {self.caddy_admin_url}"
        )
        
        try:
            async with aiohttp.ClientSession(
                timeout=aiohttp.ClientTimeout(total=5)
            ) as session:
                config_url = f"{self.caddy_admin_url}/config/"
                cluster_logger.debug(f"Fetching Caddy config from: {config_url}")
                
                async with session.get(config_url) as response:
                    cluster_logger.debug(
                        f"Caddy API response status: {response.status}"
                    )
                    
                    if response.status == 200:
                        config = await response.json()
                        cluster_logger.debug(
                            f"Retrieved Caddy config: {len(str(config))} chars"
                        )
                        
                        # Check if domain exists in apps.http.servers
                        if "apps" in config and "http" in config["apps"]:
                            servers = config["apps"]["http"].get("servers", {})
                            for server_config in servers.values():
                                routes = server_config.get("routes", [])
                                for route in routes:
                                    match = route.get("match", [])
                                    for m in match:
                                        if "host" in m and domain in m["host"]:
                                            cluster_logger.info(
                                                f"Domain {domain} found in Caddy config"
                                            )
                                            return True
                        
                        cluster_logger.warning(
                            f"Domain {domain} not found in Caddy configuration"
                        )
                        return False
                    else:
                        cluster_logger.warning(
                            f"Failed to get Caddy config: {response.status} "
                            f"- {await response.text()}"
                        )
                        return True  # Assume configured if can't check
        except Exception as e:
            cluster_logger.error(
                f"Error checking Caddy configuration for {domain}: {e} "
                f"(URL: {self.caddy_admin_url})"
            )
            return True  # Assume configured if can't check
    
    async def _check_domain_accessibility(
        self, domain: str, timeout: int = 10
    ) -> tuple[bool, str]:
        """Check if a domain is accessible via HTTP/HTTPS."""
        urls_to_check = [
            f"https://{domain}",
            f"http://{domain}"
        ]
        
        async with aiohttp.ClientSession(
            timeout=aiohttp.ClientTimeout(total=timeout)
        ) as session:
            for url in urls_to_check:
                try:
                    async with session.get(
                        url, allow_redirects=True
                    ) as response:
                        # Consider 2xx, 3xx, 401, and 403 as "accessible"
                        # (container might require auth but domain is working)
                        if response.status < 500:
                            return True, "Domain is accessible"
                except Exception:
                    continue
        
        return False, "Domain not accessible via HTTP/HTTPS"
    
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
    
    async def test_caddy_connection(self) -> bool:
        """Test connection to Caddy admin API."""
        cluster_logger.info(f"Testing connection to Caddy at: {self.caddy_admin_url}")
        
        try:
            async with aiohttp.ClientSession(
                timeout=aiohttp.ClientTimeout(total=5)
            ) as session:
                test_url = f"{self.caddy_admin_url}/config/"
                
                async with session.get(test_url) as response:
                    if response.status == 200:
                        cluster_logger.info("✅ Caddy connection successful")
                        return True
                    else:
                        cluster_logger.error(
                            f"❌ Caddy connection failed: {response.status}"
                        )
                        return False
        except Exception as e:
            cluster_logger.error(f"❌ Caddy connection error: {e}")
            return False


# Global instance for the monitoring service
domain_monitor = DomainMonitor()
