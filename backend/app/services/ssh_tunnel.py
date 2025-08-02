import asyncio
import os
import psutil
import signal
import shlex
from typing import Optional, List, Dict
from enum import Enum
from dataclasses import dataclass
from contextlib import contextmanager
from sqlalchemy.orm import Session, sessionmaker
from app.db.models import SSHTunnel, Job
from app.core.logging import cluster_logger
from app.core.config import settings
from app.schemas.job import SSHTunnelInfo
from datetime import datetime, timedelta
import socket
import time


class TunnelStatus(Enum):
    """Enum for tunnel status values."""

    PENDING = "PENDING"
    CONNECTING = "CONNECTING"
    ACTIVE = "ACTIVE"
    INACTIVE = "INACTIVE"
    FAILED = "FAILED"
    DEAD = "DEAD"
    CLOSED = "CLOSED"


class HealthStatus(Enum):
    """Enum for health check status values."""

    PENDING = "PENDING"
    HEALTHY = "HEALTHY"
    UNHEALTHY = "UNHEALTHY"
    UNKNOWN = "UNKNOWN"


@dataclass
class ProcessInfo:
    """Data class for process information."""

    pid: int
    command: str
    is_running: bool
    memory_usage: Optional[float] = None
    cpu_usage: Optional[float] = None


@dataclass
class TunnelHealthInfo:
    """Data class for tunnel health information."""

    tunnel_id: int
    status: HealthStatus
    ssh_process: Optional[ProcessInfo]
    socat_process: Optional[ProcessInfo]
    port_connectivity: bool
    last_check: datetime
    error_message: Optional[str] = None


class SSHTunnelService:
    def _get_port_allocation_lock(self):
        """Get the port allocation semaphore lazily, only when needed in an async context.
        Using Semaphore(1) instead of Lock for better reliability."""
        if self._port_allocation_lock is None:
            try:
                loop = asyncio.get_running_loop()
                # Use Semaphore(1) instead of Lock - more reliable
                self._port_allocation_lock = asyncio.Semaphore(1)
                cluster_logger.info(f"🆕 SEMAPHORE: Created port allocation semaphore in loop {id(loop)}")
            except RuntimeError as e:
                raise RuntimeError(
                    "Port allocation semaphore must be used in an async context! "
                    f"Original error: {e}"
                )
        else:
            cluster_logger.info(f"🔄 SEMAPHORE: Reusing existing semaphore {id(self._port_allocation_lock)}")
        return self._port_allocation_lock
    MIN_PORT = 8600
    MAX_PORT = 8700

    def __init__(self):
        """Initialize SSHTunnelService without external database session."""
        # Create session factory for database operations
        from app.db.session import engine
        self.SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
        
        # Track PIDs of processes we start for better cleanup
        self._processes: Dict[int, int] = {}  # {port: pid}
        
        # Locks are initialized to None and created lazily in async context
        self._cleanup_lock = None
        self._port_allocation_lock = None
        
        # Track last cleanup time to avoid too frequent cleanups
        self._last_cleanup_time = datetime.min
        # Track cleanup in progress
        self._cleanup_in_progress = False
        # Flag to track if tunnels have been restored after restart
        self._tunnels_restored = False
        
        # Initialize circuit breaker and websocket manager
        from app.services.circuit_breaker import SlurmCircuitBreaker
        self.circuit_breaker = SlurmCircuitBreaker()
        
        # WebSocket manager for real-time notifications (if available)
        try:
            from app.services.websocket_manager import WebSocketManager
            self.websocket_manager = WebSocketManager()
        except ImportError:
            self.websocket_manager = None
        
        # Setup signal handlers for graceful shutdown
        self._setup_signal_handlers()
        
        # Start background tasks
        self._start_background_tasks()

    def _start_background_tasks(self):
        """Start background maintenance tasks."""
        try:
            loop = asyncio.get_running_loop()
            # Start periodic cleanup task
            loop.create_task(self._periodic_cleanup_task())
            cluster_logger.info("Background cleanup task started")
        except RuntimeError:
            # Not in async context, background tasks will start when first async method is called
            cluster_logger.debug("Background tasks will start when entering async context")

    async def _periodic_cleanup_task(self):
        """Periodic task to clean up inactive tunnels."""
        while True:
            try:
                await asyncio.sleep(300)  # Run every 5 minutes
                await self.cleanup_inactive_tunnels()
            except asyncio.CancelledError:
                cluster_logger.info("Periodic cleanup task cancelled")
                break
            except Exception as e:
                cluster_logger.error(f"Error in periodic cleanup task: {e}")
                await asyncio.sleep(60)  # Wait 1 minute before retrying

    def _setup_signal_handlers(self):
        """Setup signal handlers for graceful shutdown."""
        try:
            loop = asyncio.get_running_loop()
            for sig in (signal.SIGTERM, signal.SIGINT):
                loop.add_signal_handler(
                    sig, lambda: asyncio.create_task(self._graceful_shutdown())
                )
        except (RuntimeError, NotImplementedError):
            # Not in async context or signal handlers not supported
            pass

    async def _graceful_shutdown(self):
        """Gracefully shutdown all tunnels and update database."""
        cluster_logger.info(
            "Graceful shutdown initiated - closing all tunnels"
        )
        try:
            # Close all tracked processes
            for port, pid in self._processes.items():
                try:
                    await self._terminate_process_safely(pid)
                    cluster_logger.debug(
                        f"Terminated process {pid} for port {port}"
                    )
                except Exception as e:
                    cluster_logger.error(
                        f"Error terminating process {pid}: {e}"
                    )
            
            # Update database - mark all active tunnels as closed
            with self._session_scope() as db:
                db.query(SSHTunnel).filter(
                    SSHTunnel.status == TunnelStatus.ACTIVE.value
                ).update({
                    "status": TunnelStatus.CLOSED.value,
                    "updated_at": datetime.utcnow()
                })
                # Commit is automatic in _session_scope()
                cluster_logger.info(
                    "Marked all active tunnels as closed in database"
                )
                
        except Exception as e:
            cluster_logger.error(f"Error during graceful shutdown: {e}")

    def _get_session(self) -> Session:
        """Get a new database session for operations."""
        return self.SessionLocal()
    
    @contextmanager
    def _session_scope(self):
        """Provide a transactional scope around a series of operations."""
        session = self._get_session()
        try:
            yield session
            session.commit()
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()

    async def _tunnel_is_really_alive(self, tunnel: SSHTunnel) -> bool:
        """
        Check if tunnel is really alive by verifying both PIDs and port connectivity.
        
        Args:
            tunnel: Tunnel to check
            
        Returns:
            True if tunnel is genuinely alive, False otherwise
        """
        try:
            # Check if both PIDs exist and are alive
            pid_ok = True
            if tunnel.ssh_pid:
                pid_ok = pid_ok and psutil.pid_exists(tunnel.ssh_pid)
            if tunnel.socat_pid:
                pid_ok = pid_ok and psutil.pid_exists(tunnel.socat_pid)
            
            if not pid_ok:
                cluster_logger.debug(f"Tunnel {tunnel.id} PIDs not alive")
                return False
            
            # Check if port is actually in use
            port_ok = await self._is_port_in_use_async(tunnel.external_port, check_external=True)
            
            if not port_ok:
                cluster_logger.debug(f"Tunnel {tunnel.id} port {tunnel.external_port} not in use")
                return False
            
            # Final connectivity test
            connectivity_ok = await self.test_tunnel(tunnel.external_port, tunnel.node)
            
            cluster_logger.debug(
                f"Tunnel {tunnel.id} alive check: PIDs={pid_ok}, Port={port_ok}, "
                f"Connectivity={connectivity_ok}"
            )
            
            return pid_ok and port_ok and connectivity_ok
            
        except Exception as e:
            cluster_logger.error(f"Error checking if tunnel {tunnel.id} is alive: {e}")
            return False

    async def restore_active_tunnels(self) -> Dict[str, int]:
        """
        Restore active tunnels from database after service restart.
        
        ATOMIC CLEANUP APPROACH:
        1. Mark ALL active tunnels as DEAD (atomic operation)
        2. Try to restore each one individually
        3. Only mark as ACTIVE those that actually work
        
        Returns:
            Dict with restored/failed counts
        """
        if self._tunnels_restored:
            return {"restored": 0, "failed": 0}

        cluster_logger.info(
            "Starting atomic tunnel restoration after backend restart"
        )

        # STEP 1: Atomic cleanup - mark ALL active tunnels as DEAD
        with self._session_scope() as db:
            dead_count = db.query(SSHTunnel).filter(
                SSHTunnel.status == TunnelStatus.ACTIVE.value
            ).update({
                "status": TunnelStatus.DEAD.value,
                "updated_at": datetime.utcnow()
            })
            
            if dead_count > 0:
                cluster_logger.info(f"Marked {dead_count} tunnels as DEAD (atomic cleanup)")

        # STEP 2: Get all tunnels that were marked as DEAD (potential candidates for restoration)
        with self._session_scope() as db:
            candidate_tunnels = db.query(SSHTunnel).filter(
                SSHTunnel.status == TunnelStatus.DEAD.value,
                SSHTunnel.ssh_pid.isnot(None),  # Only tunnels that had PIDs
                SSHTunnel.socat_pid.isnot(None)
            ).order_by(SSHTunnel.created_at.desc()).all()

        if not candidate_tunnels:
            cluster_logger.info("No candidate tunnels found for restoration")
            self._tunnels_restored = True
            return {"restored": 0, "failed": 0}

        cluster_logger.info(
            f"Found {len(candidate_tunnels)} candidate tunnels for restoration"
        )

        restored_count = 0
        failed_count = 0

        # STEP 3: Try to restore each tunnel individually
        for tunnel in candidate_tunnels:
            try:
                # Use a separate session for each tunnel restoration
                restored = await self._try_restore_single_tunnel(tunnel.id)
                if restored:
                    restored_count += 1
                    cluster_logger.info(f"Successfully restored tunnel {tunnel.id}")
                else:
                    failed_count += 1
                    cluster_logger.debug(f"Failed to restore tunnel {tunnel.id}")
                    
            except Exception as e:
                cluster_logger.error(f"Error restoring tunnel {tunnel.id}: {e}")
                failed_count += 1

        # Set flag to indicate restoration has been performed
        self._tunnels_restored = True

        # Log the summary
        cluster_logger.info(
            f"Atomic restoration complete: {restored_count} restored, {failed_count} failed"
        )
        return {"restored": restored_count, "failed": failed_count}

    async def _try_restore_single_tunnel(self, tunnel_id: int) -> bool:
        """
        Try to restore a single tunnel.
        
        Args:
            tunnel_id: ID of tunnel to restore
            
        Returns:
            True if restored successfully, False otherwise
        """
        try:
            with self._session_scope() as db:
                tunnel = db.query(SSHTunnel).filter(SSHTunnel.id == tunnel_id).first()
                if not tunnel:
                    return False

                # Check if tunnel has required attributes
                if not self._tunnel_has_required_attributes(tunnel):
                    cluster_logger.warning(f"Tunnel {tunnel_id} missing required attributes")
                    return False

                # Get associated job
                job = db.query(Job).filter(Job.id == tunnel.job_id).first()
                if not job or not job.port or not job.node:
                    cluster_logger.warning(f"Job {tunnel.job_id} missing or incomplete")
                    return False

                # Check if processes are still alive (maybe they survived restart)
                if await self._tunnel_is_really_alive(tunnel):
                    # Tunnel is actually still working - just mark as active
                    tunnel.status = TunnelStatus.ACTIVE.value
                    tunnel.health_status = HealthStatus.HEALTHY.value
                    tunnel.last_health_check = datetime.utcnow()
                    tunnel.updated_at = datetime.utcnow()
                    
                    # Update process tracking
                    if tunnel.ssh_pid:
                        self._processes[tunnel.internal_port] = tunnel.ssh_pid
                    if tunnel.socat_pid:
                        self._processes[tunnel.external_port] = tunnel.socat_pid
                    
                    cluster_logger.info(f"Tunnel {tunnel_id} was still alive - reattached")
                    return True

                # Processes are dead - try to recreate with same ports
                cluster_logger.info(f"Recreating tunnel {tunnel_id} with same ports")

                # Ensure ports are free
                await self._kill_processes_on_ports(tunnel.internal_port, tunnel.external_port)
                await asyncio.sleep(1)  # Give ports time to be released

                # Check if ports are available
                internal_available = not await self._is_port_in_use_async(tunnel.internal_port)
                external_available = not await self._is_port_in_use_async(
                    tunnel.external_port, check_external=True
                )

                if not internal_available or not external_available:
                    cluster_logger.warning(
                        f"Ports still occupied for tunnel {tunnel_id} - "
                        f"internal:{internal_available}, external:{external_available}"
                    )
                    return False

                # Update tunnel configuration to match current job
                tunnel.remote_port = job.port
                tunnel.remote_host = job.node
                tunnel.node = job.node
                tunnel.status = TunnelStatus.CONNECTING.value
                tunnel.ssh_pid = None
                tunnel.socat_pid = None
                tunnel.updated_at = datetime.utcnow()

                # Try to establish SSH tunnel
                ssh_success, ssh_pid = await self._establish_ssh_tunnel_async(
                    local_port=tunnel.internal_port,
                    remote_port=tunnel.remote_port,
                    remote_host=settings.SLURM_HOST,
                    node=tunnel.node,
                )

                if not ssh_success:
                    cluster_logger.error(f"Failed to establish SSH for tunnel {tunnel_id}")
                    return False

                # Update SSH PID
                if ssh_pid:
                    tunnel.ssh_pid = ssh_pid
                    self._processes[tunnel.internal_port] = ssh_pid

                # Start socat forwarder
                socat_success, socat_pid = await self._start_socat_forwarder_async(
                    external_port=tunnel.external_port,
                    internal_port=tunnel.internal_port,
                )

                if not socat_success:
                    # Clean up SSH tunnel if socat fails
                    await self._kill_ssh_tunnel_async(tunnel.internal_port)
                    cluster_logger.error(f"Failed to start socat for tunnel {tunnel_id}")
                    return False

                # Update socat PID
                if socat_pid:
                    tunnel.socat_pid = socat_pid
                    self._processes[tunnel.external_port] = socat_pid

                # Test the restored tunnel
                if await self.test_tunnel(tunnel.external_port, tunnel.node):
                    # Success - mark as active
                    tunnel.status = TunnelStatus.ACTIVE.value
                    tunnel.health_status = HealthStatus.HEALTHY.value
                    tunnel.last_health_check = datetime.utcnow()
                    tunnel.updated_at = datetime.utcnow()
                    return True
                else:
                    # Test failed - clean up
                    await self._kill_processes_on_ports(tunnel.internal_port, tunnel.external_port)
                    cluster_logger.error(f"Tunnel {tunnel_id} failed connectivity test")
                    return False

        except Exception as e:
            cluster_logger.error(f"Error in _try_restore_single_tunnel({tunnel_id}): {e}")
            return False

    async def _kill_processes_on_ports(self, internal_port: int, external_port: int):
        """Kill any processes using the specified ports."""
        try:
            await self._kill_ssh_tunnel_async(internal_port)
            await self._kill_socat_forwarder_async(external_port)
        except Exception as e:
            cluster_logger.error(f"Error killing processes on ports {internal_port}/{external_port}: {e}")

    async def ensure_tunnels_restored(self):
        """
        Ensure that tunnel restoration has been performed.
        This should be called by any method that depends on tunnels being properly initialized.
        """
        if not self._tunnels_restored:
            await self.restore_active_tunnels()

    async def get_or_create_tunnel(self, job_id: int) -> Optional[SSHTunnelInfo]:
        """
        Get existing active tunnel for job or create a new one.
        
        IMPROVED APPROACH:
        1. Check for existing tunnels with REAL process validation
        2. Use port allocation lock to prevent race conditions
        3. Only return tunnels that are genuinely alive
        
        Args:
            job_id: ID of the job that needs a tunnel
            
        Returns:
            SSHTunnelInfo object or None if creation fails
        """
        cluster_logger.info(f"🔀 GET_OR_CREATE: Starting for job_id={job_id}")
        
        try:
            semaphore = self._get_port_allocation_lock()
            cluster_logger.debug(f"🔒 GET_OR_CREATE: Got semaphore: {semaphore}")
        except RuntimeError as e:
            cluster_logger.error(f"❌ GET_OR_CREATE: Semaphore error: {e}")
            raise
            
        if semaphore is None:
            cluster_logger.error("❌ GET_OR_CREATE: Port allocation semaphore is None!")
            raise RuntimeError("Port allocation semaphore is None - this should not happen!")
        
        if not hasattr(semaphore, '__aenter__'):
            cluster_logger.error(f"❌ GET_OR_CREATE: Semaphore not async context manager: {type(semaphore)}")
            raise RuntimeError(f"Semaphore is not an async context manager: {type(semaphore)}")
            
        cluster_logger.debug("🔒 GET_OR_CREATE: Entering async with semaphore")
        async with semaphore:
            try:
                cluster_logger.info(f"🔄 GET_OR_CREATE: Ensuring tunnels restored for job {job_id}")
                # Ensure tunnels are restored first
                await self.ensure_tunnels_restored()
                
                # Get the job object to verify it exists and has required data
                cluster_logger.info(f"🔍 GET_OR_CREATE: Fetching job data for job {job_id}")
                with self._session_scope() as db:
                    job = db.query(Job).filter(Job.id == job_id).first()
                    if not job:
                        cluster_logger.error(f"❌ GET_OR_CREATE: Job {job_id} not found")
                        return None
                    
                    cluster_logger.info(
                        f"✅ GET_OR_CREATE: Job {job_id} found - "
                        f"port={job.port}, node={job.node}"
                    )
                        
                    if not job.port or not job.node:
                        cluster_logger.error(
                            f"❌ GET_OR_CREATE: Job {job_id} missing port ({job.port}) or node ({job.node})"
                        )
                        return None
                
                cluster_logger.info(f"🔍 GET_OR_CREATE: Looking for existing tunnels for job {job_id}")
                
                # Step 1: Find existing ACTIVE tunnels for this job with REAL validation
                with self._session_scope() as db:
                    existing_tunnels = (
                        db.query(SSHTunnel)
                        .filter(
                            SSHTunnel.job_id == job_id,
                            SSHTunnel.status == TunnelStatus.ACTIVE.value
                        )
                        .order_by(SSHTunnel.created_at.desc())
                        .all()
                    )
                
                cluster_logger.info(f"📋 GET_OR_CREATE: Found {len(existing_tunnels)} active tunnels for job {job_id}")
                
                # Step 2: Check if any existing tunnel is REALLY working
                for i, tunnel in enumerate(existing_tunnels):
                    cluster_logger.info(f"🧪 GET_OR_CREATE: Validating tunnel {i+1}/{len(existing_tunnels)} (ID={tunnel.id})")
                    
                    # Use improved validation that checks PIDs AND connectivity
                    if await self._tunnel_is_really_alive(tunnel):
                        cluster_logger.info(
                            f"✅ GET_OR_CREATE: Tunnel {tunnel.id} is genuinely working - returning it"
                        )
                        
                        # Update last health check
                        with self._session_scope() as db:
                            # Re-fetch tunnel in new session
                            tunnel_ref = db.query(SSHTunnel).filter(
                                SSHTunnel.id == tunnel.id
                            ).first()
                            if tunnel_ref:
                                tunnel_ref.last_health_check = datetime.utcnow()
                                tunnel_ref.health_status = HealthStatus.HEALTHY.value
                        
                        return self._tunnel_to_info(tunnel)
                    else:
                        # Tunnel is not really alive - DELETE it completely
                        cluster_logger.warning(
                            f"❌ GET_OR_CREATE: Tunnel {tunnel.id} not really alive - DELETING"
                        )
                        
                        # Clean up any processes that might be running
                        cluster_logger.info(f"🧹 GET_OR_CREATE: Cleaning up processes for tunnel {tunnel.id}")
                        await self._kill_processes_on_ports(
                            tunnel.internal_port, tunnel.external_port
                        )
                        
                        # Delete tunnel from database completely
                        with self._session_scope() as db:
                            tunnel_ref = db.query(SSHTunnel).filter(
                                SSHTunnel.id == tunnel.id
                            ).first()
                            if tunnel_ref:
                                db.delete(tunnel_ref)
                                cluster_logger.info(f"🗑️ GET_OR_CREATE: Deleted non-working tunnel {tunnel.id}")
                
                # Step 3: No working tunnels found - create a new one
                cluster_logger.info(f"🆕 GET_OR_CREATE: Creating new tunnel for job {job_id}")
                
                # Debug: log job_id before passing to create_tunnel
                cluster_logger.debug(
                    f"🔧 GET_OR_CREATE: Calling create_tunnel with job_id={job_id}"
                )
                new_tunnel_info = await self.create_tunnel(job_id)
                
                if new_tunnel_info: 
                    cluster_logger.info(f"✅ GET_OR_CREATE: Successfully created new tunnel for job {job_id}")
                    return new_tunnel_info
                else:
                    cluster_logger.error(f"❌ GET_OR_CREATE: Failed to create new tunnel for job {job_id}")
                    return None
                    
            except Exception as e:
                cluster_logger.error(f"❌ GET_OR_CREATE: Error for job {job_id}: {e}")
                return None
    
    def _tunnel_has_required_attributes(self, tunnel: SSHTunnel) -> bool:
        """Check if tunnel has all required attributes."""
        required_attrs = ['internal_port', 'external_port', 'remote_port', 'remote_host', 'node']
        
        for attr in required_attrs:
            if not hasattr(tunnel, attr) or getattr(tunnel, attr) is None:
                cluster_logger.warning(f"Tunnel {tunnel.id} missing {attr}")
                return False
        
        return True
    
    async def _delete_all_job_tunnels(self, job_id: int) -> int:
        """
        Delete ALL tunnels for a specific job from database.
        This ensures no old tunnel records remain when creating a new tunnel.
        
        Args:
            job_id: ID of the job whose tunnels should be deleted
            
        Returns:
            Number of tunnels deleted
        """
        deleted_count = 0
        
        try:
            with self._session_scope() as db:
                # Find all tunnels for this job (regardless of status)
                all_job_tunnels = db.query(SSHTunnel).filter(
                    SSHTunnel.job_id == job_id
                ).all()
                
                for tunnel in all_job_tunnels:
                    try:
                        cluster_logger.info(f"Deleting tunnel {tunnel.id} for job {job_id} (status: {tunnel.status})")
                        
                        # Kill any processes that might be running
                        if tunnel.internal_port and tunnel.external_port:
                            await self._kill_processes_on_ports(
                                tunnel.internal_port, tunnel.external_port
                            )
                        
                        # Delete from database
                        db.delete(tunnel)
                        deleted_count += 1
                        
                    except Exception as e:
                        cluster_logger.error(f"Error deleting tunnel {tunnel.id}: {e}")
                
                # Commit all deletions
                if deleted_count > 0:
                    cluster_logger.info(f"Deleted {deleted_count} old tunnels for job {job_id}")
                
        except Exception as e:
            cluster_logger.error(f"Error in _delete_all_job_tunnels for job {job_id}: {e}")
        
        return deleted_count
    

    def _get_cleanup_lock(self):
        """Get the cleanup semaphore lazily, only when needed in an async context."""
        if self._cleanup_lock is None:
            try:
                # Only create the semaphore when we're in an async context
                asyncio.get_running_loop()
                self._cleanup_lock = asyncio.Semaphore(1)
                cluster_logger.debug("Created cleanup semaphore")
            except RuntimeError:
                # We're not in an async context, return None
                # Caller should handle None case properly
                return None
        return self._cleanup_lock

    async def cleanup_inactive_tunnels(self) -> int:
        """
        Scan database for inactive tunnels and clean them up.
        Returns the number of cleaned tunnels.

        This method uses a lock to prevent concurrent execution
        which could lead to database conflicts or resource issues.
        """
        # Ensure tunnels are restored before cleanup
        await self.ensure_tunnels_restored()

        # Prevent concurrent execution of cleanup
        if self._cleanup_in_progress:
            cluster_logger.info("Cleanup already in progress, skipping")
            return 0

        # Check if last cleanup was recent (within 10 seconds)
        time_since_last_cleanup = datetime.utcnow() - self._last_cleanup_time
        if time_since_last_cleanup < timedelta(seconds=10):
            cluster_logger.info(
                f"Last cleanup was {time_since_last_cleanup.total_seconds():.1f}s ago, skipping"
            )
            return 0

        # Set the cleanup flag and update timestamp
        self._cleanup_in_progress = True
        self._last_cleanup_time = datetime.utcnow()

        try:
            # Get the lock (if we're in an async context)
            lock = self._get_cleanup_lock()
            if lock:
                async with lock:
                    return await self._do_cleanup_inactive_tunnels()
            else:
                # We're not in an async context, just proceed without lock
                return await self._do_cleanup_inactive_tunnels()
        except Exception as e:
            cluster_logger.error(f"Error during cleanup of inactive tunnels: {str(e)}")
            return 0
        finally:
            self._cleanup_in_progress = False

    async def _do_cleanup_inactive_tunnels(self) -> int:
        """
        Internal method that does the actual cleanup work.
        """
        cleanup_start_time = time.time()
        cluster_logger.info("Starting cleanup of inactive tunnels")
        cleaned_count = 0

        try:
            with self._session_scope() as db:
                # First check tunnels marked as ACTIVE but actually not working
                active_tunnels = (
                    db.query(SSHTunnel).filter(
                        SSHTunnel.status == "ACTIVE"
                    ).all()
                )
                cluster_logger.info(
                    f"Found {len(active_tunnels)} tunnels marked as ACTIVE "
                    f"in database"
                )

                for tunnel in active_tunnels:
                    if (not hasattr(tunnel, "external_port") or 
                        not tunnel.external_port):
                        continue

                    # Check if the port is actually in use - retry up to 3 
                    # times with backoff
                    port_in_use = False
                    for attempt in range(3):
                        try:
                            port_in_use = await self._is_port_in_use_async(
                                tunnel.external_port, check_external=True
                            )
                            if port_in_use:
                                break
                            # Wait a bit between retries (exponential backoff)
                            if attempt < 2:
                                await asyncio.sleep(0.5 * (2**attempt))
                        except Exception as e:
                            cluster_logger.warning(
                                f"Error checking port {tunnel.external_port} "
                                f"on attempt {attempt + 1}: {str(e)}"
                            )

                    if not port_in_use:
                        cluster_logger.info(
                            f"Tunnel id={tunnel.id} with port "
                            f"{tunnel.external_port} is marked ACTIVE but "
                            f"not in use - DELETING"
                        )
                        try:
                            # Instead of just marking as DEAD, actually delete 
                            # the tunnel
                            await self._kill_tunnel_processes_async(tunnel)
                            db.delete(tunnel)
                            cleaned_count += 1
                        except Exception as e:
                            cluster_logger.error(
                                f"Failed to delete tunnel id={tunnel.id}: "
                                f"{str(e)}"
                            )

                # Clean up old tunnels (older than 12 hours)
                old_time = datetime.utcnow() - timedelta(hours=12)
                old_tunnels = (
                    db.query(SSHTunnel).filter(
                        SSHTunnel.created_at < old_time
                    ).all()
                )

                for tunnel in old_tunnels:
                    cluster_logger.info(
                        f"Deleting old tunnel id={tunnel.id} created at "
                        f"{tunnel.created_at}"
                    )
                    try:
                        await self._kill_tunnel_processes_async(tunnel)
                        db.delete(tunnel)
                        cleaned_count += 1
                    except Exception as e:
                        cluster_logger.error(
                            f"Failed to delete old tunnel id={tunnel.id}: "
                            f"{str(e)}"
                        )

                # Clean up any tunnels marked as DEAD or closed
                dead_tunnels = (
                    db.query(SSHTunnel)
                    .filter(SSHTunnel.status.in_(["DEAD", "closed"]))
                    .all()
                )

                for tunnel in dead_tunnels:
                    cluster_logger.info(
                        f"Deleting tunnel id={tunnel.id} with "
                        f"status={tunnel.status}"
                    )
                    try:
                        # No need to kill processes for already dead/closed 
                        # tunnels
                        db.delete(tunnel)
                        cleaned_count += 1
                    except Exception as e:
                        cluster_logger.error(
                            f"Failed to delete dead tunnel id={tunnel.id}: "
                            f"{str(e)}"
                        )

                # Commit all deletions (automatic in _session_scope())
                if cleaned_count > 0:
                    cluster_logger.info(
                        f"Deleted {cleaned_count} inactive tunnels"
                    )

            cleanup_duration = time.time() - cleanup_start_time
            cluster_logger.info(
                f"Cleanup completed in {cleanup_duration:.2f} seconds"
            )
            return cleaned_count

        except Exception as e:
            cluster_logger.error(f"Error during tunnel cleanup: {str(e)}")
            return cleaned_count

    async def _kill_tunnel_processes_async(self, tunnel):
        """Kill processes for a tunnel before deleting it (async version)"""
        try:
            if hasattr(tunnel, "internal_port") and tunnel.internal_port:
                await self._kill_ssh_tunnel_async(tunnel.internal_port)
            if hasattr(tunnel, "external_port") and tunnel.external_port:
                await self._kill_socat_forwarder_async(tunnel.external_port)
        except Exception as e:
            cluster_logger.error(
                f"Error killing processes for tunnel {tunnel.id}: {str(e)}"
            )

    async def find_free_local_port(
        self, exclude_ports: Optional[set] = None
    ) -> Optional[int]:
        """
        Znajdź pierwszy wolny port z zakresu, który nie jest zajęty przez aktywny tunel
        i nie jest zajęty w systemie. Szybko, sekwencyjnie, bez zbędnych losowań.
        """
        start_time = asyncio.get_event_loop().time()
        cluster_logger.info(f"🔍 PORT SEARCH: Method started at {start_time}")
        
        try:
            cluster_logger.info(
                f"🔍 PORT SEARCH: Starting port search, exclude_ports={exclude_ports}"
            )
            if exclude_ports is None:
                exclude_ports = set()
                
            # Pobierz porty zajęte w bazie
            cluster_logger.info("🔍 PORT SEARCH: About to check active tunnels in database")
            
            try:
                with self._session_scope() as db:
                    cluster_logger.info("🔍 PORT SEARCH: Database session created")
                    used_ports = set()
                    active_tunnels = db.query(SSHTunnel).filter(
                        SSHTunnel.status == TunnelStatus.ACTIVE.value
                    ).all()
                    cluster_logger.info(f"🔍 PORT SEARCH: Found {len(active_tunnels)} active tunnels")
                    for tunnel in active_tunnels:
                        if tunnel.external_port:
                            used_ports.add(tunnel.external_port)
                        if tunnel.internal_port:
                            used_ports.add(tunnel.internal_port)
                    cluster_logger.info("🔍 PORT SEARCH: Database query completed")
            except Exception as e:
                cluster_logger.error(f"❌ PORT SEARCH: Database error: {e}")
                return None

            # Dodaj porty do wykluczenia
            used_ports.update(exclude_ports)
            cluster_logger.info(
                f"🔍 PORT SEARCH: Database shows {len(used_ports)} ports in use: {sorted(used_ports)}"
            )

            # Szukaj pierwszego wolnego portu
            cluster_logger.info(
                f"🔍 PORT SEARCH: Scanning port range {self.MIN_PORT}-{self.MAX_PORT}"
            )
            checked_count = 0
            for port in range(self.MIN_PORT, self.MAX_PORT + 1):
                if port in used_ports:
                    continue
                checked_count += 1
                
                if checked_count % 10 == 1:  # Log every 10 ports
                    elapsed = asyncio.get_event_loop().time() - start_time
                    cluster_logger.info(f"🔍 PORT SEARCH: Checking port {port} (#{checked_count}, elapsed: {elapsed:.1f}s)")
                
                # Sprawdź czy port jest wolny w systemie z timeoutem
                try:
                    port_check_start = asyncio.get_event_loop().time()
                    in_use = await asyncio.wait_for(
                        self._is_port_in_use_async(port, check_external=True),
                        timeout=1.0  # Reduced to 1 second timeout per port check
                    )
                    port_check_time = asyncio.get_event_loop().time() - port_check_start
                    
                    if not in_use:
                        elapsed = asyncio.get_event_loop().time() - start_time
                        cluster_logger.info(
                            f"✅ PORT SEARCH: Found free port {port} after checking {checked_count} ports in {elapsed:.1f}s"
                        )
                        return port
                    else:
                        cluster_logger.debug(f"🔍 PORT SEARCH: Port {port} is in use")
                except asyncio.TimeoutError:
                    cluster_logger.warning(
                        f"⏱️ PORT SEARCH: Timeout checking port {port}, assuming in use"
                    )
                    continue
                except Exception as e:
                    cluster_logger.warning(
                        f"⚠️ PORT SEARCH: Error checking port {port}: {e}, assuming in use"
                    )
                    continue

            elapsed = asyncio.get_event_loop().time() - start_time
            cluster_logger.error(
                f"❌ PORT SEARCH: No free ports available in range after {elapsed:.1f}s!"
            )
            return None
        except Exception as e:
            elapsed = asyncio.get_event_loop().time() - start_time
            cluster_logger.error(f"❌ PORT SEARCH: Error after {elapsed:.1f}s: {e}")
            return None

    async def create_tunnel(self, job_id: int) -> Optional[SSHTunnelInfo]:
        """
        Create SSH tunnel asynchronously.
        Returns immediately with PENDING status, creates tunnel in background.
        """
        try:
            cluster_logger.info(f"🚀 TUNNEL CREATE: Starting for job_id={job_id}")
            
            # FIRST: Delete ALL existing tunnels for this job
            cluster_logger.info(f"🧹 TUNNEL CREATE: Deleting existing tunnels for job {job_id}")
            deleted_count = await self._delete_all_job_tunnels(job_id)
            if deleted_count > 0:
                cluster_logger.info(f"🗑️ TUNNEL CREATE: Deleted {deleted_count} existing tunnels for job {job_id}")

            # Upewnij się, że stan tuneli jest aktualny tylko raz na początku
            cluster_logger.info(f"🔄 TUNNEL CREATE: Ensuring tunnels restored for job {job_id}")
            await self.ensure_tunnels_restored()
            await self.cleanup_inactive_tunnels()

            # Get job data within this method's session scope
            cluster_logger.info(f"🔍 TUNNEL CREATE: Fetching job data for job {job_id}")
            with self._session_scope() as db:
                job = db.query(Job).filter(Job.id == job_id).first()
                if not job:
                    cluster_logger.error(f"❌ TUNNEL CREATE: Job {job_id} not found")
                    return None
                
                cluster_logger.info(
                    f"✅ TUNNEL CREATE: Job {job_id} found - "
                    f"port={job.port}, node={job.node}, status={job.status}"
                )
                    
                if not job.port or not job.node:
                    cluster_logger.warning(f"❌ TUNNEL CREATE: Job {job_id} missing port or node information")
                    return None

                # Copy job data to local variables BEFORE leaving session scope
                job_port = job.port
                job_node = job.node
                job_status = job.status

                cluster_logger.info(
                    f"🔢 TUNNEL CREATE: Finding available ports for job {job_id}"
                )
                # Find available ports WITHOUT SYNCHRONIZATION (TEST)
                cluster_logger.info(f"� TUNNEL CREATE: TESTING WITHOUT SEMAPHORE for job {job_id}")
                
                internal_port = await self.find_free_local_port()
                cluster_logger.info(f"🔌 TUNNEL CREATE: Found internal port {internal_port} for job {job_id}")
                
                if not internal_port:
                    cluster_logger.error(
                        f"❌ TUNNEL CREATE: No free internal port available for job {job.id}"
                    )
                    return None

                cluster_logger.info(f"🔌 TUNNEL CREATE: Finding external port for job {job_id}")
                # Exclude internal_port when finding external_port
                external_port = await self.find_free_local_port({internal_port})
                cluster_logger.info(f"🔌 TUNNEL CREATE: Found external port {external_port} for job {job_id}")
                
                if not external_port:
                    cluster_logger.error(
                        f"❌ TUNNEL CREATE: No free external port available for job {job.id}"
                    )
                    return None
                
                # Ensure ports are different (redundant check, but safer)
                if internal_port == external_port:
                    cluster_logger.warning(f"⚠️ TUNNEL CREATE: Ports collision, retrying for job {job_id}")
                    # Try to get another external port
                    external_port = await self.find_free_local_port({internal_port})
                    if not external_port or external_port == internal_port:
                        cluster_logger.error(
                            f"❌ TUNNEL CREATE: Cannot allocate different ports for job {job.id}"
                        )
                        return None
                
                cluster_logger.info(f"� TUNNEL CREATE: Ports allocated WITHOUT sync for job {job_id}")
                # Validate that we got valid ports
                if not internal_port or not external_port:
                    cluster_logger.error(
                        f"❌ TUNNEL CREATE: Invalid ports returned for job {job_id}"
                    )
                    return None

            cluster_logger.info(
                f"📝 TUNNEL CREATE: Creating tunnel record for job {job_id} - "
                f"internal_port={internal_port}, external_port={external_port}, "
                f"remote_port={job_port}, remote_host={job_node}"
            )
            with self._session_scope() as db:
                # Create tunnel record with PENDING status
                now = datetime.utcnow()
                tunnel = SSHTunnel(
                    job_id=job_id,
                    internal_port=internal_port,
                    external_port=external_port,
                    remote_port=job_port,
                    remote_host=job_node,
                    node=job_node,
                    status=TunnelStatus.PENDING.value,
                    ssh_pid=None,
                    socat_pid=None,
                    health_status=HealthStatus.PENDING.value,
                    created_at=now,
                    last_health_check=now,
                )

                db.add(tunnel)
                # Flush to get the ID while still in session
                db.flush()
                tunnel_id = tunnel.id
                
                # Session will auto-commit on exit

            cluster_logger.info(
                f"✅ TUNNEL CREATE: Created tunnel record {tunnel_id} for job {job_id}: "
                f"internal:{internal_port} -> external:{external_port} -> "
                f"{job_node}:{job_port} [PENDING]"
            )

            cluster_logger.info(f"🚀 TUNNEL CREATE: Starting async tunnel creation for tunnel {tunnel_id}")
            # Start asynchronous tunnel creation (don't await!)
            asyncio.create_task(self._create_tunnel_async(tunnel_id))

            # Return tunnel info using fresh data
            with self._session_scope() as db:
                tunnel = db.query(SSHTunnel).filter(
                    SSHTunnel.id == tunnel_id
                ).first()
                return self._tunnel_to_info(tunnel)

        except Exception as e:
            cluster_logger.error(f"Error creating tunnel for job {job.id}: {e}")
            return None

    async def _create_tunnel_async(self, tunnel_id: int):
        """
        Create SSH tunnel processes asynchronously in background.
        Updates tunnel status from PENDING to ACTIVE or FAILED.
        """
        try:
            cluster_logger.info(f"🔧 TUNNEL ASYNC: Starting async creation for tunnel {tunnel_id}")
            with self._session_scope() as db:
                tunnel = db.query(SSHTunnel).filter(SSHTunnel.id == tunnel_id).first()
                if not tunnel:
                    cluster_logger.error(f"❌ TUNNEL ASYNC: Tunnel {tunnel_id} not found")
                    return
                
                cluster_logger.info(
                    f"🔄 TUNNEL ASYNC: Found tunnel {tunnel_id} - "
                    f"internal_port={tunnel.internal_port}, "
                    f"external_port={tunnel.external_port}, "
                    f"remote_host={tunnel.remote_host}, "
                    f"remote_port={tunnel.remote_port}"
                )
                
                # Update status to CONNECTING
                tunnel.status = TunnelStatus.CONNECTING.value
                tunnel.updated_at = datetime.utcnow()
                cluster_logger.info(f"📡 TUNNEL ASYNC: Updated tunnel {tunnel_id} status to CONNECTING")
                
                # Get job for tunnel creation
                job = db.query(Job).filter(Job.id == tunnel.job_id).first()
                if not job:
                    cluster_logger.error(f"❌ TUNNEL ASYNC: Job {tunnel.job_id} not found")
                    tunnel.status = TunnelStatus.FAILED.value
                    return
                
                cluster_logger.info(
                    f"🌐 TUNNEL ASYNC: Establishing SSH tunnel for tunnel {tunnel_id} - "
                    f"local_port={tunnel.internal_port}, "
                    f"remote_port={tunnel.remote_port}, "
                    f"remote_host={settings.SLURM_HOST}, "
                    f"node={tunnel.node}"
                )
                
                # Establish SSH tunnel
                ssh_success, ssh_pid = await self._establish_ssh_tunnel_async(
                    local_port=tunnel.internal_port,
                    remote_port=tunnel.remote_port,
                    remote_host=settings.SLURM_HOST,
                    node=tunnel.node,
                )
                
                if not ssh_success:
                    cluster_logger.error(f"❌ TUNNEL ASYNC: SSH tunnel failed for tunnel {tunnel_id}")
                    tunnel.status = TunnelStatus.FAILED.value
                    tunnel.updated_at = datetime.utcnow()
                    return

                cluster_logger.info(f"✅ TUNNEL ASYNC: SSH tunnel established for tunnel {tunnel_id}, PID={ssh_pid}")
                
                # Keep track of SSH process
                if ssh_pid:
                    tunnel.ssh_pid = ssh_pid
                    self._processes[tunnel.internal_port] = ssh_pid
                    cluster_logger.info(f"📌 TUNNEL ASYNC: SSH process tracked with PID {ssh_pid}")

                cluster_logger.info(
                    f"🔌 TUNNEL ASYNC: Starting socat forwarder for tunnel {tunnel_id} - "
                    f"external_port={tunnel.external_port}, "
                    f"internal_port={tunnel.internal_port}"
                )
                
                # Start socat forwarder
                socat_success, socat_pid = await (
                    self._start_socat_forwarder_async(
                        external_port=tunnel.external_port,
                        internal_port=tunnel.internal_port
                    )
                )

                if not socat_success:
                    cluster_logger.error(
                        f"❌ TUNNEL ASYNC: Socat forwarder failed for tunnel {tunnel_id}, "
                        "cleaning up SSH tunnel"
                    )
                    await self._kill_ssh_tunnel_async(tunnel.internal_port)
                    tunnel.status = TunnelStatus.FAILED.value
                    tunnel.updated_at = datetime.utcnow()
                    return

                cluster_logger.info(f"✅ TUNNEL ASYNC: Socat forwarder established for tunnel {tunnel_id}, PID={socat_pid}")

                # Keep track of socat process
                if socat_pid:
                    tunnel.socat_pid = socat_pid
                    self._processes[tunnel.external_port] = socat_pid
                    cluster_logger.info(f"📌 TUNNEL ASYNC: Socat process tracked with PID {socat_pid}")

                cluster_logger.info(f"🧪 TUNNEL ASYNC: Testing tunnel {tunnel_id} connectivity")
                # Test tunnel
                tunnel_working = await self.test_tunnel(tunnel.external_port, tunnel.node)
                if tunnel_working:
                    # Success!
                    tunnel.status = TunnelStatus.ACTIVE.value
                    tunnel.health_status = HealthStatus.HEALTHY.value
                    cluster_logger.info(f"🎉 TUNNEL ASYNC: Successfully created tunnel {tunnel_id}")
                else:
                    # Failed test
                    cluster_logger.warning(
                        f"❌ TUNNEL ASYNC: Tunnel {tunnel_id} test failed, marking as failed"
                    )
                    tunnel.status = TunnelStatus.FAILED.value
                    tunnel.health_status = HealthStatus.UNHEALTHY.value
                    # Clean up processes
                    cluster_logger.info(f"🧹 TUNNEL ASYNC: Cleaning up failed tunnel {tunnel_id}")
                    await self._kill_ssh_tunnel_async(tunnel.internal_port)
                    await self._kill_socat_forwarder_async(tunnel.external_port)
                
                tunnel.updated_at = datetime.utcnow()
                tunnel.last_health_check = datetime.utcnow()
                cluster_logger.info(f"💾 TUNNEL ASYNC: Updated tunnel {tunnel_id} final status: {tunnel.status}")
                
        except Exception as e:
            cluster_logger.error(f"❌ TUNNEL ASYNC: Error in creation for {tunnel_id}: {e}")
            # Mark tunnel as failed
            try:
                with self._session_scope() as db:
                    tunnel = db.query(SSHTunnel).filter(SSHTunnel.id == tunnel_id).first()
                    if tunnel:
                        tunnel.status = TunnelStatus.FAILED.value
                        tunnel.updated_at = datetime.utcnow()
                        # db.commit() is automatic in _session_scope()
            except Exception as e2:
                cluster_logger.error(f"Failed to mark tunnel {tunnel_id} as failed: {e2}")

    async def close_tunnel(self, tunnel_id: int) -> bool:
        """Close an SSH tunnel and DELETE it from database (async version)"""

        with self._session_scope() as db:
            tunnel = db.query(SSHTunnel).filter(
                SSHTunnel.id == tunnel_id
            ).first()
            if not tunnel:
                return False

            cluster_logger.info(
                f"Closing and deleting tunnel {tunnel_id} from database"
            )

            # Close the processes
            if hasattr(tunnel, "external_port") and tunnel.external_port:
                await self._kill_socat_forwarder_async(tunnel.external_port)

            if hasattr(tunnel, "internal_port") and tunnel.internal_port:
                await self._kill_ssh_tunnel_async(tunnel.internal_port)

            # DELETE tunnel from database instead of marking as CLOSED
            db.delete(tunnel)
            # Commit is automatic in _session_scope()
            cluster_logger.info(f"Tunnel {tunnel_id} deleted from database")
            return True

    async def close_job_tunnels(self, job_id: int) -> bool:
        """Close and DELETE all tunnels for a specific job (async version)"""

        with self._session_scope() as db:
            tunnels = db.query(SSHTunnel).filter(
                SSHTunnel.job_id == job_id
            ).all()
            success = True
            for tunnel in tunnels:
                if not await self.close_tunnel(tunnel.id):
                    success = False
        
        cluster_logger.info(
            f"Closed and deleted {len(tunnels)} tunnels for job {job_id}"
        )
        return success

    @staticmethod
    def get_active_tunnels(db: Session) -> List[SSHTunnel]:
        """Get all active SSH tunnels."""
        return db.query(SSHTunnel).filter(SSHTunnel.status == "ACTIVE").all()

    def get_job_tunnels(self, db: Session, job_id: int) -> List[SSHTunnelInfo]:
        """Get all tunnels for a specific job."""
        # Ensure tunnels are restored (needs to be called in an async context)
        # This is a sync method, so we can't await directly
        # We'll rely on other async methods being called first

        tunnels = db.query(SSHTunnel).filter(SSHTunnel.job_id == job_id).all()
        return [
            SSHTunnelInfo(
                id=tunnel.id,
                job_id=tunnel.job_id,
                local_port=tunnel.external_port,  # Use external_port as the local_port for frontend
                external_port=tunnel.external_port,
                internal_port=tunnel.internal_port,
                remote_port=tunnel.remote_port,
                remote_host=tunnel.remote_host,
                node=tunnel.node,
                status=tunnel.status,
                ssh_pid=tunnel.ssh_pid,
                socat_pid=tunnel.socat_pid,
                health_status=tunnel.health_status,
                last_health_check=tunnel.last_health_check,
                created_at=tunnel.created_at,
                updated_at=tunnel.updated_at,
            )
            for tunnel in tunnels
        ]

    def get_current_job_tunnel(
        self, db: Session, job_id: int
    ) -> List[SSHTunnelInfo]:
        """Get current tunnel for a job (only active or latest closed)."""
        # Clean up old closed tunnels first (keep only the most recent one)
        # self._cleanup_old_closed_tunnels(db, job_id)
        
        # Get active tunnels first
        active_tunnels = db.query(SSHTunnel).filter(
            SSHTunnel.job_id == job_id,
            SSHTunnel.status == TunnelStatus.ACTIVE.value
        ).all()
        
        if active_tunnels:
            # Return active tunnels
            return [self._tunnel_to_info(tunnel) for tunnel in active_tunnels]
        
        # If no active tunnels, get the most recent closed tunnel
        latest_closed = db.query(SSHTunnel).filter(
            SSHTunnel.job_id == job_id,
            SSHTunnel.status == TunnelStatus.CLOSED.value
        ).order_by(SSHTunnel.created_at.desc()).first()
        
        if latest_closed:
            return [self._tunnel_to_info(latest_closed)]
        
        return []

    def _cleanup_old_closed_tunnels(self, db: Session, job_id: int):
        """Remove old closed tunnels, keeping only the most recent one."""
        closed_tunnels = db.query(SSHTunnel).filter(
            SSHTunnel.job_id == job_id,
            SSHTunnel.status == TunnelStatus.CLOSED.value
        ).order_by(SSHTunnel.created_at.desc()).all()
        
        # Keep only the most recent closed tunnel, delete the rest
        if len(closed_tunnels) > 1:
            # All except the first (most recent)
            tunnels_to_delete = closed_tunnels[1:]
            for tunnel in tunnels_to_delete:
                cluster_logger.info(
                    f"Cleaning up old closed tunnel {tunnel.id} for job {job_id}"
                )
                db.delete(tunnel)

    def _tunnel_to_info(self, tunnel: SSHTunnel) -> SSHTunnelInfo:
        """Convert SSHTunnel model to SSHTunnelInfo schema."""
        return SSHTunnelInfo(
            id=tunnel.id,
            job_id=tunnel.job_id,
            local_port=tunnel.external_port,
            external_port=tunnel.external_port,
            internal_port=tunnel.internal_port,
            remote_port=tunnel.remote_port,
            remote_host=tunnel.remote_host,
            node=tunnel.node,
            status=tunnel.status,
            ssh_pid=tunnel.ssh_pid,
            socat_pid=tunnel.socat_pid,
            health_status=tunnel.health_status,
            last_health_check=tunnel.last_health_check,
            created_at=tunnel.created_at,
            updated_at=tunnel.updated_at,
        )

    async def restore_tunnel(self, tunnel_id: int) -> Optional[SSHTunnelInfo]:
        """Restore a closed tunnel by creating a new active tunnel."""
        with self._session_scope() as db:
            tunnel = db.query(SSHTunnel).filter(SSHTunnel.id == tunnel_id).first()
            if not tunnel:
                cluster_logger.error(f"Tunnel {tunnel_id} not found for restore")
                return None
            
            if tunnel.status != TunnelStatus.CLOSED.value:
                cluster_logger.error(f"Tunnel {tunnel_id} is not closed, cannot restore")
                return None
            
            # Get the job
            job = db.query(Job).filter(Job.id == tunnel.job_id).first()
            if not job:
                cluster_logger.error(f"Job {tunnel.job_id} not found for tunnel restore")
                return None
            
            # Create new tunnel (this will use the same configuration)
            new_tunnel = await self.create_tunnel(job)
            return new_tunnel

    async def cleanup_all_tunnels(self) -> int:
        """
        Clean up all tunnels in the database (active, inactive, and closed).
        This is a destructive operation and should be used with caution.

        Returns:
            Number of tunnels cleaned up
        """
        cluster_logger.warning(
            "Cleaning up all tunnels from database!"
        )
        count = 0

        try:
            # Get all tunnels
            with self._session_scope() as db:
                all_tunnels = db.query(SSHTunnel).all()

                for tunnel in all_tunnels:
                    try:
                        # First, close any running processes for the tunnel
                        await self._kill_tunnel_processes_async(tunnel)

                        # Delete the tunnel record from the database
                        db.delete(tunnel)
                        count += 1
                        cluster_logger.info(
                            f"Deleted tunnel id={tunnel.id} from database"
                        )
                    except Exception as e:
                        cluster_logger.error(
                            f"Error cleaning up tunnel id={tunnel.id}: {str(e)}"
                        )

                # Commit all deletions (automatic in _session_scope())
                cluster_logger.info(f"Cleanup complete: {count} tunnels deleted")
        except Exception as e:
            cluster_logger.error(
                f"Error during cleanup of all tunnels: {str(e)}"
            )

        return count

    async def restore_all_tunnels(self) -> Dict[str, int]:
        """
        Restore all tunnels from the database (both active and closed).
        This will recreate tunnels that are closed but have valid 
        configurations.

        Returns:
            Dictionary with counts of restored and failed tunnels
        """
        cluster_logger.info(
            "Starting restoration of all tunnels from database"
        )

        # Get all tunnels from the database
        with self._session_scope() as db:
            all_tunnels = db.query(SSHTunnel).all()

        restored_count = 0
        failed_count = 0

        for tunnel in all_tunnels:
            try:
                # Skip tunnels that are already active
                if tunnel.status == TunnelStatus.ACTIVE.value:
                    cluster_logger.info(
                        f"Tunnel id={tunnel.id} is already active - skipping"
                    )
                    restored_count += 1
                    continue

                # Try to restore the tunnel (this will create a new active 
                # tunnel)
                new_tunnel = await self.restore_tunnel(tunnel.id)
                if new_tunnel:
                    restored_count += 1
                    cluster_logger.info(
                        f"Successfully restored tunnel id={tunnel.id}"
                    )
                else:
                    failed_count += 1
                    cluster_logger.error(
                        f"Failed to restore tunnel id={tunnel.id}"
                    )

            except Exception as e:
                cluster_logger.error(
                    f"Error restoring tunnel id={tunnel.id}: {str(e)}"
                )
                failed_count += 1

        # Log the summary
        cluster_logger.info(
            f"Restoration complete: {restored_count} tunnels restored, "
            f"{failed_count} failed"
        )
        return {"restored": restored_count, "failed": failed_count}

    async def health_check(self, tunnel_id: int) -> TunnelHealthInfo:
        """
        Perform comprehensive health check on a specific tunnel.

        Args:
            tunnel_id: ID of the tunnel to check

        Returns:
            TunnelHealthInfo with detailed health status
        """
        cluster_logger.info(
            f"Performing health check for tunnel {tunnel_id}"
        )

        with self._session_scope() as db:
            tunnel = db.query(SSHTunnel).filter(
                SSHTunnel.id == tunnel_id
            ).first()
            if not tunnel:
                return TunnelHealthInfo(
                    tunnel_id=tunnel_id,
                    status=HealthStatus.UNKNOWN,
                    ssh_process=None,
                    socat_process=None,
                    port_connectivity=False,
                    last_check=datetime.utcnow(),
                    error_message="Tunnel not found in database",
                )

            # Check SSH process health
            ssh_process = None
            if tunnel.ssh_pid:
                ssh_process = await self._check_process_health(tunnel.ssh_pid)

            # Check socat process health
            socat_process = None
            if tunnel.socat_pid:
                socat_process = await self._check_process_health(tunnel.socat_pid)

            # Test port connectivity
            port_connectivity = False
            if tunnel.external_port:
                port_connectivity = await self.test_tunnel(
                    tunnel.external_port, tunnel.node
                )

            # Determine overall health status
            health_status = self._determine_health_status(
                ssh_process, socat_process, port_connectivity
            )

            # Update database with health check results
            tunnel.last_health_check = datetime.utcnow()
            tunnel.health_status = health_status.value
            # Commit is automatic in _session_scope()

        health_info = TunnelHealthInfo(
            tunnel_id=tunnel_id,
            status=health_status,
            ssh_process=ssh_process,
            socat_process=socat_process,
            port_connectivity=port_connectivity,
            last_check=datetime.utcnow(),
        )

        cluster_logger.info(
            f"Health check completed for tunnel {tunnel_id}: "
            f"{health_status.value}"
        )

        return health_info

    async def _check_process_health(self, pid: int) -> Optional[ProcessInfo]:
        """
        Check the health of a specific process.

        Args:
            pid: Process ID to check

        Returns:
            ProcessInfo if process exists, None otherwise
        """
        try:
            process = psutil.Process(pid)

            # Check if process is still running
            if not process.is_running():
                return None

            # Get process information
            cmdline = " ".join(process.cmdline())
            memory_info = process.memory_info()
            cpu_percent = process.cpu_percent()

            return ProcessInfo(
                pid=pid,
                command=cmdline,
                is_running=True,
                memory_usage=memory_info.rss / 1024 / 1024,  # MB
                cpu_usage=cpu_percent,
            )

        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
            return None
        except Exception as e:
            cluster_logger.error(f"Error checking process {pid}: {str(e)}")
            return None

    def _determine_health_status(
        self,
        ssh_process: Optional[ProcessInfo],
        socat_process: Optional[ProcessInfo],
        port_connectivity: bool,
    ) -> HealthStatus:
        """
        Determine overall health status based on process and connectivity checks.

        Args:
            ssh_process: SSH process information
            socat_process: Socat process information
            port_connectivity: Whether port is accessible

        Returns:
            Overall health status
        """
        # If port connectivity works, tunnel is functional regardless of process tracking
        if port_connectivity:
            # If we have both processes and connectivity, it's definitely healthy
            if ssh_process and socat_process:
                return HealthStatus.HEALTHY
            # If we have connectivity but missing process info, it's still healthy
            # (process tracking might be incomplete after restart)
            elif socat_process or ssh_process:
                return HealthStatus.HEALTHY
            else:
                # Port works but no tracked processes - likely after service restart
                # Still consider healthy since the tunnel actually works
                return HealthStatus.HEALTHY
        else:
            # No connectivity - tunnel is not working
            return HealthStatus.UNHEALTHY

    async def _terminate_process_safely(self, pid: int, port: Optional[int] = None) -> bool:
        """
        Safely terminate a process with escalating signals and cleanup tracking.

        Args:
            pid: Process ID to terminate
            port: Port associated with this process (for cleanup)

        Returns:
            True if successful, False otherwise
        """
        try:
            # Try to kill process group if possible (for child processes)
            try:
                os.killpg(pid, signal.SIGTERM)
                cluster_logger.debug(f"Sent SIGTERM to process group {pid}")
            except (OSError, ProcessLookupError):
                # Fallback to single process
                try:
                    os.kill(pid, signal.SIGTERM)
                    cluster_logger.debug(f"Sent SIGTERM to process {pid}")
                except (OSError, ProcessLookupError):
                    # Process already gone
                    if port:
                        self._processes.pop(port, None)
                    return True

            # Wait up to 5 seconds for graceful termination
            import time
            for _ in range(50):  # 50 * 0.1 = 5 seconds
                try:
                    os.kill(pid, 0)  # Check if process still exists
                    time.sleep(0.1)
                except (OSError, ProcessLookupError):
                    # Process is gone
                    if port:
                        self._processes.pop(port, None)
                    cluster_logger.debug(f"Process {pid} terminated gracefully")
                    return True

            # If still running, use SIGKILL
            try:
                os.killpg(pid, signal.SIGKILL)
                cluster_logger.debug(f"Sent SIGKILL to process group {pid}")
            except (OSError, ProcessLookupError):
                try:
                    os.kill(pid, signal.SIGKILL)
                    cluster_logger.debug(f"Sent SIGKILL to process {pid}")
                except (OSError, ProcessLookupError):
                    pass

            # Wait for kill to take effect
            for _ in range(20):  # 20 * 0.1 = 2 seconds
                try:
                    os.kill(pid, 0)
                    time.sleep(0.1)
                except (OSError, ProcessLookupError):
                    if port:
                        self._processes.pop(port, None)
                    cluster_logger.debug(f"Process {pid} killed forcefully")
                    return True

            cluster_logger.warning(f"Process {pid} may still be running")
            if port:
                self._processes.pop(port, None)
            return False

        except Exception as e:
            cluster_logger.error(f"Error terminating process {pid}: {str(e)}")
            if port:
                self._processes.pop(port, None)
            return False

    async def health_check_all_active_tunnels(
        self
    ) -> Dict[int, TunnelHealthInfo]:
        """
        Perform health check on all active tunnels.

        Returns:
            Dictionary mapping tunnel IDs to their health information
        """
        cluster_logger.info(
            "Starting health check for all active tunnels"
        )

        with self._session_scope() as db:
            active_tunnels = (
                db.query(SSHTunnel)
                .filter(SSHTunnel.status == TunnelStatus.ACTIVE.value)
                .all()
            )

        health_results = {}

        for tunnel in active_tunnels:
            try:
                health_info = await self.health_check(tunnel.id)
                health_results[tunnel.id] = health_info

                # Auto-repair unhealthy tunnels if possible
                if health_info.status == HealthStatus.UNHEALTHY:
                    cluster_logger.warning(
                        f"Tunnel {tunnel.id} is unhealthy, attempting repair"
                    )
                    await self._attempt_tunnel_repair(tunnel)

            except Exception as e:
                cluster_logger.error(
                    f"Error during health check for tunnel {tunnel.id}: "
                    f"{str(e)}"
                )
                health_results[tunnel.id] = TunnelHealthInfo(
                    tunnel_id=tunnel.id,
                    status=HealthStatus.UNKNOWN,
                    ssh_process=None,
                    socat_process=None,
                    port_connectivity=False,
                    last_check=datetime.utcnow(),
                    error_message=str(e),
                )

        cluster_logger.info(
            f"Health check completed for {len(health_results)} tunnels"
        )

        return health_results

    async def _attempt_tunnel_repair(self, tunnel: SSHTunnel) -> bool:
        """
        Attempt to repair an unhealthy tunnel.

        Args:
            tunnel: Tunnel object to repair

        Returns:
            True if repair successful, False otherwise
        """
        cluster_logger.info(f"Attempting to repair tunnel {tunnel.id}")

        try:
            # Close existing tunnel
            await self.close_tunnel(tunnel.id)

            # Get associated job
            with self._session_scope() as db:
                job = db.query(Job).filter(Job.id == tunnel.job_id).first()
                if not job:
                    cluster_logger.error(
                        f"Job {tunnel.job_id} not found for tunnel repair"
                    )
                    return False

            # Create new tunnel
            new_tunnel = await self.create_tunnel(job)

            if new_tunnel:
                cluster_logger.info(
                    f"Successfully repaired tunnel {tunnel.id}"
                )
                return True
            else:
                cluster_logger.error(f"Failed to repair tunnel {tunnel.id}")
                return False

        except Exception as e:
            cluster_logger.error(f"Error during tunnel repair: {str(e)}")
            return False

    async def _update_tunnel_pids(self, tunnel: SSHTunnel) -> bool:
        """
        Update missing PIDs for an existing tunnel by finding running 
        processes.
        
        Args:
            tunnel: Tunnel object to update
            
        Returns:
            True if any PIDs were updated, False otherwise
        """
        updated = False
        
        # Try to find SSH process if PID is missing
        if not tunnel.ssh_pid and tunnel.internal_port:
            ssh_pattern = (
                f"ssh.*{tunnel.internal_port}:{tunnel.node}:"
                f"{tunnel.remote_port}"
            )
            ssh_pid = await self._get_pid_for_pattern(ssh_pattern)
            if ssh_pid:
                tunnel.ssh_pid = ssh_pid
                updated = True
                cluster_logger.info(
                    f"Updated SSH PID for tunnel {tunnel.id}: {ssh_pid}"
                )
        
        # Try to find socat process if PID is missing
        if not tunnel.socat_pid and tunnel.external_port:
            socat_pattern = f"socat.*TCP-LISTEN:{tunnel.external_port}"
            socat_pid = await self._get_pid_for_pattern(socat_pattern)
            if socat_pid:
                tunnel.socat_pid = socat_pid
                updated = True
                cluster_logger.info(
                    f"Updated socat PID for tunnel {tunnel.id}: {socat_pid}"
                )
        
        if updated:
            # Note: tunnel object should be in a session scope when this 
            # is called
            cluster_logger.info(
                f"Updated PIDs for tunnel {tunnel.id} - "
                f"SSH: {tunnel.ssh_pid}, socat: {tunnel.socat_pid}"
            )
        
        return updated

    async def _find_ssh_tunnel_pid(
        self, local_port: int, node: str, remote_port: int
    ) -> Optional[int]:
        """
        Find the PID of SSH tunnel process for specific port forwarding.
        
        Args:
            local_port: Local port being forwarded
            node: Remote node
            remote_port: Remote port
            
        Returns:
            PID if found, None otherwise
        """
        patterns = [
            f"ssh.*-L.*{local_port}:{node}:{remote_port}",
            f"ssh.*{local_port}:{node}:{remote_port}",
            f"ssh.*-L.*{local_port}:",
        ]
        
        for pattern in patterns:
            pid = await self._get_pid_for_pattern(pattern)
            if pid:
                cluster_logger.debug(
                    f"Found SSH tunnel PID {pid} with pattern: {pattern}"
                )
                return pid
                
        cluster_logger.warning(
            f"Could not find SSH tunnel PID for "
            f"{local_port}:{node}:{remote_port}"
        )
        return None

    async def _find_socat_forwarder_pid(
        self, external_port: int
    ) -> Optional[int]:
        """
        Find the PID of socat forwarder process.
        
        Args:
            external_port: External port being forwarded
            
        Returns:
            PID if found, None otherwise
        """
        patterns = [
            f"socat.*TCP-LISTEN:{external_port}",
            f"socat.*{external_port}.*127.0.0.1",
            f"socat.*{external_port}",
        ]
        
        for pattern in patterns:
            pid = await self._get_pid_for_pattern(pattern)
            if pid:
                cluster_logger.debug(
                    f"Found socat PID {pid} with pattern: {pattern}"
                )
                return pid
                
        cluster_logger.warning(
            f"Could not find socat forwarder PID for port {external_port}"
        )
        return None

    async def _is_port_in_use_async(
        self, port: int, check_external: bool = False
    ) -> bool:
        """
        Check if a port is in use (async version).
        
        Args:
            port: Port number to check
            check_external: If True, check external port availability
            
        Returns:
            True if port is in use, False if available
        """
        import asyncio
        
        def check_port_sync(port: int, check_external: bool = False) -> bool:
            """Synchronous port check."""
            try:
                # Check TCP
                with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
                    sock.settimeout(0.1)  # Quick timeout
                    result = sock.connect_ex(('localhost', port))
                    if result == 0:  # Port is open/in use
                        return True
                        
                # For external check, also test binding
                if check_external:
                    try:
                        with socket.socket(
                            socket.AF_INET, socket.SOCK_STREAM
                        ) as sock:
                            sock.setsockopt(
                                socket.SOL_SOCKET, socket.SO_REUSEADDR, 1
                            )
                            sock.bind(('localhost', port))
                            return False  # Port is available for binding
                    except OSError:
                        # Port is in use or not available for binding
                        return True
                        
                return False  # Port appears available
                
            except Exception as e:
                cluster_logger.debug(f"Error checking port {port}: {e}")
                return False  # Assume available on error
        
        # Run synchronous check in thread pool to make it async
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None, check_port_sync, port, check_external
        )

    async def _establish_ssh_tunnel_async(
        self, local_port: int, remote_port: int, remote_host: str, node: str
    ) -> tuple[bool, Optional[int]]:
        """
        Establish SSH tunnel asynchronously with Circuit Breaker protection,
        timeout and retry logic.
        
        Returns:
            Tuple of (success, ssh_pid)
        """
        import asyncio
        from app.core.config import settings
        
        cluster_logger.info(
            f"🌐 SSH TUNNEL: Starting establishment - "
            f"local_port={local_port}, remote_port={remote_port}, "
            f"remote_host={remote_host}, node={node}"
        )
        
        MAX_RETRIES = 3
        TIMEOUT_SECONDS = 30  # Maximum time for SSH to establish connection
        
        # Check Circuit Breaker first - if open, fail immediately
        if self.circuit_breaker.is_open():
            cluster_logger.warning(
                "❌ SSH TUNNEL: SLURM Circuit Breaker is OPEN - skipping creation"
            )
            return False, None
        
        cluster_logger.info("✅ SSH TUNNEL: Circuit Breaker is CLOSED - proceeding")
        
        # Construct the SSH destination with username
        if settings.SLURM_USER:
            ssh_destination = f"{settings.SLURM_USER}@{remote_host}"
        else:
            ssh_destination = remote_host
        
        cluster_logger.info(f"🔗 SSH TUNNEL: Destination: {ssh_destination}")
        
        ssh_cmd = [
            "ssh",
            "-N",  # No remote command
            "-L", f"{local_port}:{node}:{remote_port}",  # Local forwarding
            "-o", "StrictHostKeyChecking=no",
            "-o", "UserKnownHostsFile=/dev/null",
            "-o", "ServerAliveInterval=30",
            "-o", "ServerAliveCountMax=3",
            "-o", "ExitOnForwardFailure=yes",
            "-o", "ConnectTimeout=10",  # Limit connection time
        ]
        
        cluster_logger.info(f"🖥️ SSH TUNNEL: Command: {' '.join(ssh_cmd)} {ssh_destination}")
        
        # Add SSH key if specified
        if settings.SLURM_KEY_FILE:
            ssh_cmd.extend(["-i", settings.SLURM_KEY_FILE])
            cluster_logger.info(f"🔑 SSH TUNNEL: Using key file: {settings.SLURM_KEY_FILE}")
            
        ssh_cmd.append(ssh_destination)
        
        for attempt in range(MAX_RETRIES):
            try:
                cluster_logger.info(
                    f"🔄 SSH TUNNEL: Attempt {attempt + 1}/{MAX_RETRIES} - "
                    f"{local_port} -> {node}:{remote_port} via {remote_host}"
                )
                
                cluster_logger.info("🚀 SSH TUNNEL: Starting SSH process...")
                # Start SSH process with timeout protection
                process = await asyncio.wait_for(
                    asyncio.create_subprocess_exec(
                        *ssh_cmd,
                        stdout=asyncio.subprocess.PIPE,
                        stderr=asyncio.subprocess.PIPE
                    ),
                    timeout=TIMEOUT_SECONDS
                )
                
                cluster_logger.info(f"⏱️ SSH TUNNEL: Process started with PID {process.pid}, waiting 2s...")
                # Wait a moment to check if tunnel started successfully
                await asyncio.sleep(2)
                
                # Check if process is still running
                if process.returncode is None:
                    cluster_logger.info(
                        f"✅ SSH TUNNEL: Successfully established with PID {process.pid}"
                    )
                    # Report success to Circuit Breaker
                    self.circuit_breaker.record_success()
                    cluster_logger.info("📊 SSH TUNNEL: Recorded success in Circuit Breaker")
                    return True, process.pid
                else:
                    stderr = await process.stderr.read()
                    error_msg = stderr.decode().strip()
                    cluster_logger.error(
                        f"❌ SSH TUNNEL: Failed to start (attempt {attempt + 1}): "
                        f"{error_msg}"
                    )
                    
                    # If this is the last attempt, record failure
                    if attempt == MAX_RETRIES - 1:
                        self.circuit_breaker.record_failure()
                    else:
                        # Wait before retry (exponential backoff)
                        await asyncio.sleep(2 ** attempt)
                    
            except asyncio.TimeoutError:
                cluster_logger.error(
                    f"SSH tunnel creation timeout (attempt {attempt + 1}) - "
                    f"remote host {remote_host} may be unreachable"
                )
                if attempt == MAX_RETRIES - 1:
                    self.circuit_breaker.record_failure()
                else:
                    await asyncio.sleep(2 ** attempt)
                    
            except Exception as e:
                cluster_logger.error(
                    f"Error establishing SSH tunnel (attempt {attempt + 1}): {e}"
                )
                if attempt == MAX_RETRIES - 1:
                    self.circuit_breaker.record_failure()
                else:
                    await asyncio.sleep(2 ** attempt)
        
        # All attempts failed
        cluster_logger.error(
            f"Failed to establish SSH tunnel after {MAX_RETRIES} attempts"
        )
        return False, None

    async def _start_socat_forwarder_async(
        self, external_port: int, internal_port: int
    ) -> tuple[bool, Optional[int]]:
        """
        Start socat forwarder to expose tunnel externally with timeout
        protection.
        
        Returns:
            Tuple of (success, socat_pid)
        """
        import asyncio
        
        cluster_logger.info(
            f"🔌 SOCAT: Starting forwarder - "
            f"external_port={external_port}, internal_port={internal_port}"
        )
        
        TIMEOUT_SECONDS = 10  # socat should start quickly (local)
        
        socat_cmd = [
            "socat",
            f"TCP4-LISTEN:{external_port},fork,reuseaddr",
            f"TCP4:127.0.0.1:{internal_port}"
        ]
        
        cluster_logger.info(f"🖥️ SOCAT: Command: {' '.join(socat_cmd)}")
        
        try:
            cluster_logger.info(
                f"🚀 SOCAT: Starting process for {external_port} -> "
                f"127.0.0.1:{internal_port}"
            )
            
            # Start socat process with timeout protection
            process = await asyncio.wait_for(
                asyncio.create_subprocess_exec(
                    *socat_cmd,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE
                ),
                timeout=TIMEOUT_SECONDS
            )
            
            cluster_logger.info(f"⏱️ SOCAT: Process started with PID {process.pid}, waiting 1s...")
            # Wait a moment to check if forwarder started successfully
            await asyncio.sleep(1)
            
            # Check if process is still running
            if process.returncode is None:
                cluster_logger.info(
                    f"✅ SOCAT: Forwarder started successfully with PID {process.pid}"
                )
                return True, process.pid
            else:
                stderr = await process.stderr.read()
                cluster_logger.error(
                    f"❌ SOCAT: Failed to start: {stderr.decode()}"
                )
                return False, None
                
        except asyncio.TimeoutError:
            cluster_logger.error(
                f"❌ SOCAT: Timeout - ports {external_port} or "
                f"{internal_port} may be in use"
            )
            return False, None
        except Exception as e:
            cluster_logger.error(f"Error starting socat forwarder: {e}")
            return False, None

    async def _kill_ssh_tunnel_async(self, port: int) -> bool:
        """Kill SSH tunnel process using port with proper cleanup."""
        
        try:
            # First try to use tracked PID if available
            if port in self._processes:
                pid = self._processes[port]
                cluster_logger.info(f"Killing tracked SSH tunnel PID {pid} for port {port}")
                success = await self._terminate_process_safely(pid, port)
                if success:
                    return True
            
            # If no tracked PID or tracked PID failed, search for process
            # Use lsof for more reliable process finding
            import asyncio
            import subprocess
            
            try:
                # Use lsof to find process listening on port
                result = subprocess.run(
                    ["lsof", "-ti", f"tcp:{port}"],
                    capture_output=True,
                    text=True,
                    timeout=5
                )
                
                if result.stdout:
                    pids = result.stdout.strip().split('\n')
                    for pid_str in pids:
                        if pid_str.strip():
                            pid = int(pid_str.strip())
                            cluster_logger.info(f"Found SSH tunnel PID {pid} for port {port}")
                            if await self._terminate_process_safely(pid, port):
                                return True
                            
            except (subprocess.TimeoutExpired, FileNotFoundError):
                # lsof not available, fall back to pgrep
                quoted_pattern = shlex.quote(f"ssh.*{port}:")
                result = subprocess.run(
                    ["pgrep", "-f", quoted_pattern],
                    capture_output=True,
                    text=True,
                    timeout=5
                )
                
                if result.stdout:
                    pids = result.stdout.strip().split('\n')
                    for pid_str in pids:
                        if pid_str.strip():
                            pid = int(pid_str.strip())
                            cluster_logger.info(f"Found SSH tunnel PID {pid} for port {port}")
                            if await self._terminate_process_safely(pid, port):
                                return True
            
            # Clean up tracking even if no process found
            self._processes.pop(port, None)
            return False
            
        except Exception as e:
            cluster_logger.error(f"Error killing SSH tunnel for port {port}: {e}")
            self._processes.pop(port, None)
            return False

    async def _kill_socat_forwarder_async(self, port: int) -> bool:
        """Kill socat forwarder process using port with proper cleanup."""
        
        try:
            # First try to use tracked PID if available
            if port in self._processes:
                pid = self._processes[port]
                cluster_logger.info(f"Killing tracked socat PID {pid} for port {port}")
                success = await self._terminate_process_safely(pid, port)
                if success:
                    return True
            
            # If no tracked PID or tracked PID failed, search for process
            import subprocess
            
            try:
                # Use lsof to find process listening on port
                result = subprocess.run(
                    ["lsof", "-ti", f"tcp:{port}"],
                    capture_output=True,
                    text=True,
                    timeout=5
                )
                
                if result.stdout:
                    pids = result.stdout.strip().split('\n')
                    for pid_str in pids:
                        if pid_str.strip():
                            pid = int(pid_str.strip())
                            cluster_logger.info(f"Found socat PID {pid} for port {port}")
                            if await self._terminate_process_safely(pid, port):
                                return True
                            
            except (subprocess.TimeoutExpired, FileNotFoundError):
                # lsof not available, fall back to pgrep
                quoted_pattern = shlex.quote(f"socat.*{port}")
                result = subprocess.run(
                    ["pgrep", "-f", quoted_pattern],
                    capture_output=True,
                    text=True,
                    timeout=5
                )
                
                if result.stdout:
                    pids = result.stdout.strip().split('\n')
                    for pid_str in pids:
                        if pid_str.strip():
                            pid = int(pid_str.strip())
                            cluster_logger.info(f"Found socat PID {pid} for port {port}")
                            if await self._terminate_process_safely(pid, port):
                                return True
            
            # Clean up tracking even if no process found
            self._processes.pop(port, None)
            return False
            
        except Exception as e:
            cluster_logger.error(f"Error killing socat forwarder for port {port}: {e}")
            self._processes.pop(port, None)
            return False

    async def _get_pid_for_pattern(self, pattern: str) -> Optional[int]:
        """
        Get PID for a process matching the given pattern.
        
        Args:
            pattern: Regex pattern to match against process command line
            
        Returns:
            PID if found, None otherwise
        """
        import asyncio
        
        try:
            # Use pgrep to find processes matching pattern
            result = await asyncio.create_subprocess_exec(
                "pgrep", "-f", pattern,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            
            stdout, stderr = await result.communicate()
            
            if result.returncode == 0 and stdout:
                pids = stdout.decode().strip().split('\n')
                if pids and pids[0]:
                    pid = int(pids[0])
                    cluster_logger.debug(
                        f"Found PID {pid} for pattern: {pattern}"
                    )
                    return pid
            
            cluster_logger.debug(f"No PID found for pattern: {pattern}")
            return None
            
        except Exception as e:
            cluster_logger.error(
                f"Error finding PID for pattern {pattern}: {e}"
            )
            return None

    async def test_tunnel(self, port: int, node: Optional[str] = None) -> bool:
        """
        Test if tunnel is working by attempting connection.
        
        Args:
            port: Port to test
            node: Node name (for logging purposes)
            
        Returns:
            True if tunnel is working, False otherwise
        """
        import asyncio
        
        try:
            # Try to connect to the tunnel port
            future = asyncio.open_connection('localhost', port)
            
            # Wait up to 5 seconds for connection
            reader, writer = await asyncio.wait_for(future, timeout=5.0)
            
            # If we got here, connection was successful
            writer.close()
            await writer.wait_closed()
            
            cluster_logger.info(
                f"Tunnel test successful for port {port}" +
                (f" (node: {node})" if node else "")
            )
            return True
            
        except asyncio.TimeoutError:
            cluster_logger.warning(
                f"Tunnel test timeout for port {port}" +
                (f" (node: {node})" if node else "")
            )
            return False
        except Exception as e:
            cluster_logger.warning(
                f"Tunnel test failed for port {port}: {e}" +
                (f" (node: {node})" if node else "")
            )
            return False
