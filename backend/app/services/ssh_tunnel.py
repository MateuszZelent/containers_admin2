import asyncio
import random
import subprocess
import os
import psutil
from typing import Optional, List, Dict, Tuple
from enum import Enum
from dataclasses import dataclass
from sqlalchemy.orm import Session
from app.db.models import SSHTunnel, Job
from app.core.logging import cluster_logger
from app.core.config import settings
from app.schemas.job import SSHTunnelInfo
from datetime import datetime, timedelta
import socket
import time
import aiohttp


class TunnelStatus(Enum):
    """Enum for tunnel status values."""
    ACTIVE = "ACTIVE"
    INACTIVE = "INACTIVE"
    FAILED = "FAILED"
    DEAD = "DEAD"
    CLOSED = "CLOSED"


class HealthStatus(Enum):
    """Enum for health check status values."""
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
    MIN_PORT = 8600
    MAX_PORT = 8700

    def __init__(self, db: Session):
        self.db = db
        # Track PIDs of processes we start for better cleanup
        self._processes: Dict[int, int] = {}  # {port: pid}
        # Don't create asyncio.Lock at initialization time
        self._cleanup_lock = None
        # Track last cleanup time to avoid too frequent cleanups
        self._last_cleanup_time = datetime.min
        # Track cleanup in progress
        self._cleanup_in_progress = False
        # Flag to track if tunnels have been restored after restart
        self._tunnels_restored = False

    async def restore_active_tunnels(self) -> Dict[str, int]:
        """
        Restore active tunnels from database after service restart.
        This method should be called during application startup or first service access.
        """
        if self._tunnels_restored:
            return {"restored": 0, "failed": 0}

        cluster_logger.info(
            "Starting restoration of active tunnels after backend restart"
        )

        # Get all tunnels marked as ACTIVE in the database
        active_tunnels = (
            self.db.query(SSHTunnel).filter(SSHTunnel.status == "ACTIVE").all()
        )

        if not active_tunnels:
            cluster_logger.info("No active tunnels found in database to restore")
            self._tunnels_restored = True
            return {"restored": 0, "failed": 0}

        cluster_logger.info(
            f"Found {len(active_tunnels)} tunnels marked as ACTIVE in database"
        )

        restored_count = 0
        failed_count = 0

        for tunnel in active_tunnels:
            try:
                # Skip tunnels with missing required attributes
                if (
                    not hasattr(tunnel, "internal_port")
                    or not tunnel.internal_port
                    or not hasattr(tunnel, "external_port")
                    or not tunnel.external_port
                    or not hasattr(tunnel, "remote_port")
                    or not tunnel.remote_port
                    or not hasattr(tunnel, "remote_host")
                    or not tunnel.remote_host
                    or not hasattr(tunnel, "node")
                    or not tunnel.node
                    or not hasattr(tunnel, "job_id")
                    or not tunnel.job_id
                ):
                    cluster_logger.warning(
                        f"Tunnel id={tunnel.id} has missing required attributes - marking as DEAD"
                    )
                    tunnel.status = "DEAD"
                    failed_count += 1
                    continue

                # Check if the ports are already in use
                internal_port_in_use = await self._is_port_in_use_async(
                    tunnel.internal_port, check_external=False
                )
                external_port_in_use = await self._is_port_in_use_async(
                    tunnel.external_port, check_external=True
                )

                # If both ports are in use, check if the tunnel is actually working
                if internal_port_in_use and external_port_in_use:
                    is_working = await self.test_tunnel(
                        tunnel.external_port, tunnel.node
                    )
                    if is_working:
                        cluster_logger.info(
                            f"Tunnel id={tunnel.id} is already working - reattaching"
                        )

                        # Try to get PIDs of the processes for tracking
                        ssh_pid = await self._get_pid_for_pattern(
                            f"ssh.*{tunnel.internal_port}:{tunnel.node}:{tunnel.remote_port}"
                        )
                        socat_pid = await self._get_pid_for_pattern(
                            f"socat.*TCP-LISTEN:{tunnel.external_port}"
                        )

                        if ssh_pid:
                            self._processes[tunnel.internal_port] = ssh_pid
                        if socat_pid:
                            self._processes[tunnel.external_port] = socat_pid

                        restored_count += 1
                        continue

                # If we get here, we need to recreate the tunnel
                cluster_logger.info(
                    f"Recreating tunnel id={tunnel.id} for job_id={tunnel.job_id}"
                )

                # Clean up any existing processes on these ports
                if internal_port_in_use:
                    await self._kill_ssh_tunnel_async(tunnel.internal_port)
                if external_port_in_use:
                    await self._kill_socat_forwarder_async(tunnel.external_port)

                # Wait a moment for ports to be released
                await asyncio.sleep(1)

                # Try to get the job to verify it still exists and has necessary info
                job = self.db.query(Job).filter(Job.id == tunnel.job_id).first()
                if not job or not job.port or not job.node:
                    cluster_logger.warning(
                        f"Job {tunnel.job_id} is missing or has insufficient data - marking tunnel as DEAD"
                    )
                    tunnel.status = "DEAD"
                    failed_count += 1
                    continue

                # Set up the SSH tunnel first
                ssh_success, ssh_pid = await self._establish_ssh_tunnel_async(
                    local_port=tunnel.internal_port,
                    remote_port=tunnel.remote_port,
                    remote_host=tunnel.remote_host,
                    node=tunnel.node,
                )

                if not ssh_success:
                    cluster_logger.error(
                        f"Failed to restore SSH tunnel for id={tunnel.id} - marking as DEAD"
                    )
                    tunnel.status = "DEAD"
                    failed_count += 1
                    continue

                # Keep track of SSH process if we got the PID
                if ssh_pid:
                    self._processes[tunnel.internal_port] = ssh_pid

                # Now set up the socat forwarder
                socat_success, socat_pid = await self._start_socat_forwarder_async(
                    external_port=tunnel.external_port,
                    internal_port=tunnel.internal_port,
                )

                if not socat_success:
                    # If socat fails, clean up the SSH tunnel we just created
                    await self._kill_ssh_tunnel_async(tunnel.internal_port)
                    cluster_logger.error(
                        f"Failed to restore socat forwarder for tunnel id={tunnel.id} - marking as DEAD"
                    )
                    tunnel.status = "DEAD"
                    failed_count += 1
                    continue

                # Keep track of socat process if we got the PID
                if socat_pid:
                    self._processes[tunnel.external_port] = socat_pid

                # The tunnel has been successfully restored
                cluster_logger.info(f"Successfully restored tunnel id={tunnel.id}")
                restored_count += 1

            except Exception as e:
                cluster_logger.error(f"Error restoring tunnel id={tunnel.id}: {str(e)}")
                # Mark as DEAD on error
                tunnel.status = "DEAD"
                failed_count += 1

        # Commit all changes to the database
        self.db.commit()

        # Set flag to indicate restoration has been performed
        self._tunnels_restored = True

        # Log the summary
        cluster_logger.info(
            f"Tunnel restoration complete: {restored_count} restored, {failed_count} failed"
        )
        return {"restored": restored_count, "failed": failed_count}

    async def ensure_tunnels_restored(self):
        """
        Ensure that tunnel restoration has been performed.
        This should be called by any method that depends on tunnels being properly initialized.
        """
        if not self._tunnels_restored:
            await self.restore_active_tunnels()

    def _get_cleanup_lock(self):
        """Get the cleanup lock lazily, only when needed in an async context."""
        if self._cleanup_lock is None:
            try:
                # Only create the lock when we're in an async context
                loop = asyncio.get_running_loop()
                self._cleanup_lock = asyncio.Lock()
            except RuntimeError:
                # We're not in an async context, so we don't need a lock
                pass
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
            # First check tunnels marked as ACTIVE but actually not working
            active_tunnels = (
                self.db.query(SSHTunnel).filter(SSHTunnel.status == "ACTIVE").all()
            )
            cluster_logger.info(
                f"Found {len(active_tunnels)} tunnels marked as ACTIVE in database"
            )

            for tunnel in active_tunnels:
                if not hasattr(tunnel, "external_port") or not tunnel.external_port:
                    continue

                # Check if the port is actually in use - retry up to 3 times with backoff
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
                            f"Error checking port {tunnel.external_port} on attempt {attempt + 1}: {str(e)}"
                        )

                if not port_in_use:
                    cluster_logger.info(
                        f"Tunnel id={tunnel.id} with port {tunnel.external_port} is marked ACTIVE but not in use - DELETING"
                    )
                    try:
                        # Instead of just marking as DEAD, actually delete the tunnel
                        await self._kill_tunnel_processes_async(tunnel)
                        self.db.delete(tunnel)
                        cleaned_count += 1
                    except Exception as e:
                        cluster_logger.error(
                            f"Failed to delete tunnel id={tunnel.id}: {str(e)}"
                        )

            # Clean up old tunnels (older than 12 hours)
            old_time = datetime.utcnow() - timedelta(hours=12)
            old_tunnels = (
                self.db.query(SSHTunnel).filter(SSHTunnel.created_at < old_time).all()
            )

            for tunnel in old_tunnels:
                cluster_logger.info(
                    f"Deleting old tunnel id={tunnel.id} created at {tunnel.created_at}"
                )
                try:
                    await self._kill_tunnel_processes_async(tunnel)
                    self.db.delete(tunnel)
                    cleaned_count += 1
                except Exception as e:
                    cluster_logger.error(
                        f"Failed to delete old tunnel id={tunnel.id}: {str(e)}"
                    )

            # Clean up any tunnels marked as DEAD or closed
            dead_tunnels = (
                self.db.query(SSHTunnel)
                .filter(SSHTunnel.status.in_(["DEAD", "closed"]))
                .all()
            )

            for tunnel in dead_tunnels:
                cluster_logger.info(
                    f"Deleting tunnel id={tunnel.id} with status={tunnel.status}"
                )
                try:
                    # No need to kill processes for already dead/closed tunnels
                    self.db.delete(tunnel)
                    cleaned_count += 1
                except Exception as e:
                    cluster_logger.error(
                        f"Failed to delete dead tunnel id={tunnel.id}: {str(e)}"
                    )

            # Commit all deletions
            if cleaned_count > 0:
                self.db.commit()
                cluster_logger.info(f"Deleted {cleaned_count} inactive tunnels")

            cleanup_duration = time.time() - cleanup_start_time
            cluster_logger.info(f"Cleanup completed in {cleanup_duration:.2f} seconds")
            return cleaned_count

        except Exception as e:
            cluster_logger.error(f"Error during tunnel cleanup: {str(e)}")
            # Try to commit any successful deletions
            if cleaned_count > 0:
                try:
                    self.db.commit()
                    cluster_logger.info(
                        f"Committed {cleaned_count} deletions despite error"
                    )
                except Exception as commit_error:
                    cluster_logger.error(
                        f"Failed to commit after cleanup error: {str(commit_error)}"
                    )
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

    async def find_free_local_port(self) -> Optional[int]:
        """Find a free port on the local machine between MIN_PORT and MAX_PORT (async version)"""
        # Ensure tunnels are restored first
        await self.ensure_tunnels_restored()

        # First clean up inactive tunnels to free up ports in database
        await self.cleanup_inactive_tunnels()

        # Get used ports from database
        used_ports = set()
        for tunnel in self.db.query(SSHTunnel).all():
            if hasattr(tunnel, "external_port") and tunnel.external_port:
                used_ports.add(tunnel.external_port)
            if hasattr(tunnel, "internal_port") and tunnel.internal_port:
                used_ports.add(tunnel.internal_port)

        # Log ports already registered in database
        cluster_logger.info(
            f"Ports registered in database after cleanup: {sorted(list(used_ports))}"
        )

        # Special case: if all ports in our range are registered but none are in use by OS
        # we have a database inconsistency - try a random port anyway
        if len(used_ports) >= (self.MAX_PORT - self.MIN_PORT):
            cluster_logger.warning(
                "All ports are registered in database, checking if any are actually free"
            )
            os_used_ports = set()
            for port in range(self.MIN_PORT, self.MAX_PORT + 1):
                if await self._is_port_in_use_async(port, check_external=True):
                    os_used_ports.add(port)

            if len(os_used_ports) < len(used_ports):
                cluster_logger.warning(
                    f"Found discrepancy: {len(os_used_ports)} ports used by OS, {len(used_ports)} registered in DB"
                )
                # Try a more aggressive cleanup - delete all non-active tunnels
                await self._emergency_cleanup_async()
                # Re-gather used ports
                used_ports = set()
                for tunnel in self.db.query(SSHTunnel).all():
                    if hasattr(tunnel, "external_port") and tunnel.external_port:
                        if await self._is_port_in_use_async(
                            tunnel.external_port, check_external=True
                        ):
                            used_ports.add(tunnel.external_port)
                    if hasattr(tunnel, "internal_port") and tunnel.internal_port:
                        if await self._is_port_in_use_async(tunnel.internal_port):
                            used_ports.add(tunnel.internal_port)

        # Set timeout and attempt limits
        start_time = time.time()
        max_time = 30  # seconds
        attempts = 0
        max_attempts = min(
            self.MAX_PORT - self.MIN_PORT, 100
        )  # Limit based on range size

        # Get a list of all ports in the range and shuffle it
        all_ports = list(range(self.MIN_PORT, self.MAX_PORT + 1))
        random.shuffle(all_ports)

        # Track ports we check for diagnostics
        ports_in_use = set()
        free_ports = set()

        while time.time() - start_time < max_time and attempts < max_attempts:
            attempts += 1

            # If we've tried all ports in the shuffled list, we're out of options
            if not all_ports:
                cluster_logger.warning(
                    f"All ports in range {self.MIN_PORT}-{self.MAX_PORT} have been checked and are in use"
                )
                cluster_logger.warning(f"Ports in use: {sorted(list(ports_in_use))}")
                cluster_logger.warning(
                    f"Free ports that were otherwise excluded: {sorted(list(free_ports))}"
                )
                return None

            # Get next port from shuffled list instead of random generation
            port = all_ports.pop(0)

            if port in used_ports:
                cluster_logger.debug(
                    f"Port {port} already registered in database - skipping"
                )
                continue

            port_in_use = await self._is_port_in_use_async(port, check_external=True)
            if port_in_use:
                ports_in_use.add(port)
                cluster_logger.debug(f"Port {port} is in use by a process")
            else:
                free_ports.add(port)
                cluster_logger.info(f"Found free port {port} after {attempts} attempts")
                return port

            # Small sleep to prevent CPU hogging
            await asyncio.sleep(0.1)

        # If we get here, we couldn't find a free port
        cluster_logger.error(
            f"Could not find free port after {attempts} attempts and {time.time() - start_time:.2f} seconds"
        )
        cluster_logger.error(f"Ports status summary:")
        cluster_logger.error(f"- Database registered ports: {len(used_ports)}")
        cluster_logger.error(f"- Ports found in use by OS: {len(ports_in_use)}")
        cluster_logger.error(
            f"- Free ports that were excluded for other reasons: {len(free_ports)}"
        )
        cluster_logger.error(f"Detailed ports in use: {sorted(list(ports_in_use))}")
        return None

    async def create_tunnel(self, job: Job) -> Optional[SSHTunnelInfo]:
        """Create an SSH tunnel for a job with enhanced PID tracking"""
        # Ensure tunnels are restored first
        await self.ensure_tunnels_restored()

        if not job.port or not job.node:
            return None

        # Find ports for internal and external connections
        internal_port = await self.find_free_local_port()
        if not internal_port:
            return None

        external_port = await self.find_free_local_port()
        if not external_port:
            return None

        # Establish SSH tunnel
        success, ssh_pid = await self._establish_ssh_tunnel_async(
            local_port=internal_port,
            remote_port=job.port,
            remote_host=settings.SLURM_HOST,
            node=job.node,
        )
        if not success:
            return None

        # Keep track of SSH process
        if ssh_pid:
            self._processes[internal_port] = ssh_pid

        # Start socat forwarder
        socat_success, socat_pid = await self._start_socat_forwarder_async(
            external_port=external_port, internal_port=internal_port
        )

        if not socat_success:
            # If socat failed, close the SSH tunnel
            await self._kill_ssh_tunnel_async(internal_port)
            return None

        # Keep track of socat process
        if socat_pid:
            self._processes[external_port] = socat_pid

        # Create timestamp for the tunnel
        now = datetime.utcnow()

        tunnel = SSHTunnel(
            job_id=job.id,
            external_port=external_port,
            internal_port=internal_port,
            remote_port=job.port,
            remote_host=job.node,
            node=job.node,
            status="ACTIVE",
            ssh_pid=ssh_pid,  # Store SSH process PID
            socat_pid=socat_pid,  # Store socat process PID
            health_status=HealthStatus.HEALTHY.value,  # Initial health status
            created_at=now,
            last_health_check=now,  # Initial health check timestamp
        )

        self.db.add(tunnel)
        self.db.commit()
        self.db.refresh(tunnel)

        cluster_logger.info(
            f"Created tunnel {tunnel.id} with SSH PID: {ssh_pid}, socat PID: {socat_pid}"
        )

        return SSHTunnelInfo(
            id=tunnel.id,
            job_id=tunnel.job_id,
            local_port=external_port,
            remote_port=tunnel.remote_port,
            remote_host=tunnel.remote_host,
            node=tunnel.node,
            status=tunnel.status,
            created_at=tunnel.created_at,
        )

    async def close_tunnel(self, tunnel_id: int) -> bool:
        """Close an SSH tunnel (async version)"""
        # Ensure tunnels are restored first
        await self.ensure_tunnels_restored()

        tunnel = self.db.query(SSHTunnel).filter(SSHTunnel.id == tunnel_id).first()
        if not tunnel:
            return False

        # Close the processes
        if hasattr(tunnel, "external_port") and tunnel.external_port:
            await self._kill_socat_forwarder_async(tunnel.external_port)

        if hasattr(tunnel, "internal_port") and tunnel.internal_port:
            await self._kill_ssh_tunnel_async(tunnel.internal_port)

        tunnel.status = "closed"
        self.db.commit()
        return True

    async def close_job_tunnels(self, job_id: int) -> bool:
        """Close all tunnels for a specific job (async version)"""
        # Ensure tunnels are restored first
        await self.ensure_tunnels_restored()

        tunnels = self.db.query(SSHTunnel).filter(SSHTunnel.job_id == job_id).all()
        success = True
        for tunnel in tunnels:
            if not await self.close_tunnel(tunnel.id):
                success = False
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

    async def _is_port_in_use_async(
        self, port: int, check_external: bool = True
    ) -> bool:
        """
        Check if a port is in use with proper timeout and error handling (async version).

        Args:
            port: Port number to check
            check_external: Whether to check on all interfaces (0.0.0.0) or just localhost

        Returns:
            bool: True if port is in use, False otherwise
        """

        # Run the socket check in a thread to avoid blocking the event loop
        def _check_port():
            try:
                with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                    s.settimeout(0.5)
                    address = "0.0.0.0" if check_external else "127.0.0.1"
                    result = s.connect_ex((address, port))
                    return result == 0
            except (socket.timeout, socket.error) as e:
                cluster_logger.warning(f"Error checking port {port}: {str(e)}")
                return True

        # Execute socket operation in a thread pool to avoid blocking the event loop
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, _check_port)

        if result:
            cluster_logger.debug(
                f"Port {port} is in use on {'0.0.0.0' if check_external else '127.0.0.1'}"
            )

        return result

    async def _establish_ssh_tunnel_async(
        self, local_port: int, remote_port: int, remote_host: str, node: str
    ) -> Tuple[bool, Optional[int]]:
        """Establish SSH tunnel to the remote host (async version)."""
        try:
            cmd = [
                "ssh",
                "-N",  # Don't execute remote command
                "-f",  # Go to background
                "-L",
                f"{local_port}:{node}:{remote_port}",
                f"{settings.SLURM_USER}@{remote_host}",
            ]

            cmd_str = " ".join(cmd)
            cluster_logger.debug(f"Starting SSH tunnel: {cmd_str}")

            process = await asyncio.create_subprocess_exec(
                *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
            )

            stdout, stderr = await process.communicate()

            if process.returncode != 0:
                error_msg = stderr.decode("utf-8") if stderr else "Unknown error"
                cluster_logger.error(f"Failed to establish SSH tunnel: {error_msg}")
                return False, None

            # Wait for the tunnel to be established
            await asyncio.sleep(1)

            # Check if the port is now in use (verification)
            if not await self._is_port_in_use_async(local_port, check_external=False):
                cluster_logger.error(
                    f"SSH tunnel port {local_port} is not listening after start attempt"
                )
                return False, None

            # Try to get the PID of the SSH process
            pid = await self._get_pid_for_pattern(
                f"ssh.*{local_port}:{node}:{remote_port}"
            )

            if pid:
                cluster_logger.debug(f"SSH tunnel established with PID {pid}")
                return True, pid
            else:
                cluster_logger.debug(
                    f"SSH tunnel established, but couldn't determine PID"
                )
                return True, None

        except Exception as e:
            cluster_logger.error(f"Error establishing SSH tunnel: {str(e)}")
            return False, None

    async def _kill_ssh_tunnel_async(self, local_port: int):
        """Kill SSH tunnel process using the local port (async version)."""
        try:
            # If we have the PID stored, use it
            if local_port in self._processes:
                pid = self._processes[local_port]
                cluster_logger.debug(f"Killing SSH tunnel with stored PID {pid}")
                try:
                    cmd = f"kill -9 {pid}"
                    process = await asyncio.create_subprocess_shell(
                        cmd,
                        stdout=asyncio.subprocess.PIPE,
                        stderr=asyncio.subprocess.PIPE,
                    )
                    await process.communicate()
                    # Remove from our tracking
                    del self._processes[local_port]
                    return
                except Exception as e:
                    cluster_logger.warning(
                        f"Error killing SSH tunnel with PID {pid}: {str(e)}"
                    )

            # If we don't have the PID or killing by PID failed, try to find it by port
            pattern = f"ssh.*-L.*{local_port}:"
            pid = await self._get_pid_for_pattern(pattern)

            if pid:
                # Kill by found PID
                cmd = f"kill -9 {pid}"
                process = await asyncio.create_subprocess_shell(
                    cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
                )
                await process.communicate()
                cluster_logger.debug(
                    f"Killed SSH tunnel on port {local_port} with PID {pid}"
                )
            else:
                # Fall back to lsof as a last resort
                cmd = f"lsof -ti:{local_port} | xargs -r kill -9"
                cluster_logger.debug(f"Killing SSH tunnel with fallback: {cmd}")
                process = await asyncio.create_subprocess_shell(
                    cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
                )
                await process.communicate()
        except Exception as e:
            cluster_logger.error(f"Error killing SSH tunnel: {str(e)}")

    async def test_tunnel(self, local_port: int, node: str, timeout: int = 5) -> bool:
        """
        Test if tunnel is working by trying to connect to it.

        Args:
            local_port: The local port to test
            node: The node to test connection to
            timeout: Timeout in seconds

        Returns:
            bool: True if tunnel is working, False otherwise
        """
        import aiohttp

        url = f"http://localhost:{local_port}"

        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(url, timeout=timeout) as response:
                    # Any response (even error) means the tunnel is working
                    return True
        except (aiohttp.ClientError, asyncio.TimeoutError):
            return False

    async def _cleanup_dead_tunnel(self, tunnel_id: int):
        """Remove a dead tunnel from database and kill its process (async version)"""
        tunnel = self.db.query(SSHTunnel).filter(SSHTunnel.id == tunnel_id).first()
        if tunnel:
            # Kill the processes
            await self._kill_tunnel_processes_async(tunnel)

            tunnel.status = "DEAD"
            self.db.commit()

    async def get_or_create_tunnel(self, job: Job) -> Optional[SSHTunnelInfo]:
        """Get existing tunnel or create new one if none exists (async version)"""
        # Ensure tunnels are restored first
        await self.ensure_tunnels_restored()

        if not job.port or not job.node:
            cluster_logger.warning(f"Job {job.id} missing port or node information")
            return None

        # Check for existing active tunnel
        existing_tunnel = (
            self.db.query(SSHTunnel)
            .filter(SSHTunnel.job_id == job.id, SSHTunnel.status == "ACTIVE")
            .first()
        )

        if existing_tunnel:
            # Test if existing tunnel works
            cluster_logger.debug(
                f"Found existing tunnel id={existing_tunnel.id} for job {job.id}"
            )
            is_working = False
            if (
                hasattr(existing_tunnel, "external_port")
                and existing_tunnel.external_port
            ):
                is_working = await self.test_tunnel(
                    existing_tunnel.external_port, existing_tunnel.node
                )

            if is_working:
                cluster_logger.info(f"Existing tunnel for job {job.id} is working")
                return SSHTunnelInfo(
                    id=existing_tunnel.id,
                    job_id=existing_tunnel.job_id,
                    local_port=existing_tunnel.external_port,
                    remote_port=existing_tunnel.remote_port,
                    remote_host=existing_tunnel.remote_host,
                    node=existing_tunnel.node,
                    status=existing_tunnel.status,
                    created_at=existing_tunnel.created_at,
                )
            else:
                cluster_logger.warning(
                    f"Existing tunnel for job {job.id} is not working - cleaning up"
                )
                await self._cleanup_dead_tunnel(existing_tunnel.id)

        # If no active tunnel or it wasn't working, create a new one
        cluster_logger.info(f"Creating new tunnel for job {job.id}")
        return await self.create_tunnel(job)

    async def _start_socat_forwarder_async(
        self, external_port: int, internal_port: int
    ) -> Tuple[bool, Optional[int]]:
        """Start socat process to forward external port to internal localhost port (async version)."""
        try:
            # First ensure the port is really free by double-checking
            if await self._is_port_in_use_async(external_port, check_external=True):
                cluster_logger.warning(
                    f"Port {external_port} is already in use despite earlier checks"
                )

                # Try to forcefully kill any process using this port
                await self._kill_process_on_port_async(external_port)

                # Wait a moment for the port to be released
                await asyncio.sleep(1)

                # Check again if the port is free now
                if await self._is_port_in_use_async(external_port, check_external=True):
                    cluster_logger.error(
                        f"Port {external_port} still in use after attempted cleanup"
                    )
                    return False, None

            cmd = [
                "socat",
                f"TCP-LISTEN:{external_port},reuseaddr,fork",
                f"TCP:127.0.0.1:{internal_port}",
            ]

            cmd_str = " ".join(cmd)
            cluster_logger.info(f"Starting socat forwarder: {cmd_str}")

            # Start socat in background
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                start_new_session=True,
            )

            # Wait a moment for socat to start
            await asyncio.sleep(1)

            # Check if process is still running
            if process.returncode is not None:
                # Process exited early - error
                stdout, stderr = await process.communicate()
                error_msg = stderr.decode("utf-8") if stderr else "Unknown error"
                cluster_logger.error(f"Socat forwarder failed: {error_msg}")
                return False, None

            # Verify the port is now in use
            if not await self._is_port_in_use_async(external_port, check_external=True):
                cluster_logger.warning(
                    f"Socat started but port {external_port} is not listening"
                )
                return False, None

            # Get the PID if possible
            pid = process.pid

            if not pid:
                # Try to find the PID using pgrep
                pid = await self._get_pid_for_pattern(
                    f"socat.*TCP-LISTEN:{external_port}"
                )

            if pid:
                cluster_logger.info(
                    f"Socat forwarder started with PID {pid} on port {external_port}"
                )
            else:
                cluster_logger.info(
                    f"Socat forwarder started on port {external_port} but couldn't determine PID"
                )

            return True, pid
        except Exception as e:
            cluster_logger.error(f"Error starting socat forwarder: {str(e)}")
            return False, None

    async def _kill_process_on_port_async(self, port: int):
        """Kill any process using the specified port (async version)."""
        try:
            # First try to find what process is using the port
            cmd = f"lsof -i:{port} -t"
            process = await asyncio.create_subprocess_shell(
                cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
            )
            stdout, _ = await process.communicate()
            pids = stdout.decode().strip().split("\n")

            if pids and pids[0]:
                # We found PIDs, kill them individually
                for pid in pids:
                    if pid.strip():
                        cluster_logger.debug(
                            f"Killing process with PID {pid} using port {port}"
                        )
                        kill_cmd = f"kill -9 {pid}"
                        kill_process = await asyncio.create_subprocess_shell(
                            kill_cmd,
                            stdout=asyncio.subprocess.PIPE,
                            stderr=asyncio.subprocess.PIPE,
                        )
                        await kill_process.communicate()
            else:
                # Fall back to the old method if no PIDs found
                cmd = f"lsof -ti:{port} | xargs -r kill -9"
                cluster_logger.debug(f"Killing any process on port {port}: {cmd}")
                process = await asyncio.create_subprocess_shell(
                    cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
                )
                await process.communicate()

            # Verify port is released
            await asyncio.sleep(0.5)
            if await self._is_port_in_use_async(port, check_external=True):
                cluster_logger.warning(
                    f"Port {port} is still in use after kill attempt"
                )
        except Exception as e:
            cluster_logger.error(f"Error killing process on port {port}: {str(e)}")

    async def _kill_socat_forwarder_async(self, port: int):
        """Kill socat process forwarding the specified port (async version)."""
        try:
            # If we have the PID stored, use it
            if port in self._processes:
                pid = self._processes[port]
                cluster_logger.debug(f"Killing socat forwarder with stored PID {pid}")
                try:
                    cmd = f"kill -9 {pid}"
                    process = await asyncio.create_subprocess_shell(
                        cmd,
                        stdout=asyncio.subprocess.PIPE,
                        stderr=asyncio.subprocess.PIPE,
                    )
                    await process.communicate()
                    # Remove from our tracking
                    del self._processes[port]
                    return
                except Exception as e:
                    cluster_logger.warning(
                        f"Error killing socat with PID {pid}: {str(e)}"
                    )

            # Try to find and kill any socat process using this port
            pattern = f"socat.*TCP-LISTEN:{port}"
            pid = await self._get_pid_for_pattern(pattern)

            if pid:
                # Kill by found PID
                cmd = f"kill -9 {pid}"
                process = await asyncio.create_subprocess_shell(
                    cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
                )
                await process.communicate()
                cluster_logger.info(f"Killed socat on port {port} with PID {pid}")
            else:
                # Use the old method as fallback
                cmd = f"lsof -ti:{port} | grep socat | xargs -r kill -9 2>/dev/null || true"
                cluster_logger.info(f"Killing socat forwarder with fallback: {cmd}")
                process = await asyncio.create_subprocess_shell(
                    cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
                )
                await process.communicate()

            # Verify the process was killed
            await asyncio.sleep(0.5)
            if await self._is_port_in_use_async(port, check_external=True):
                cluster_logger.warning(
                    f"Port {port} is still in use after killing socat"
                )
                # Try more aggressive approach
                await self._kill_process_on_port_async(port)
            else:
                cluster_logger.info(f"Successfully killed socat process on port {port}")

        except Exception as e:
            cluster_logger.error(
                f"Error while killing socat forwarder on port {port}: {e}"
            )

    async def _emergency_cleanup_async(self):
        """Emergency cleanup when we have DB inconsistency (async version)"""
        cluster_logger.warning("Performing emergency cleanup of database tunnels")
        count = 0

        # Get all tunnels
        all_tunnels = self.db.query(SSHTunnel).all()

        for tunnel in all_tunnels:
            should_delete = True

            # Check if processes are actually running on these ports
            if hasattr(tunnel, "external_port") and tunnel.external_port:
                if await self._is_port_in_use_async(
                    tunnel.external_port, check_external=True
                ):
                    should_delete = False

            if should_delete:
                cluster_logger.info(
                    f"Emergency cleanup: Deleting tunnel id={tunnel.id}"
                )
                await self._kill_tunnel_processes_async(tunnel)
                self.db.delete(tunnel)
                count += 1

        self.db.commit()
        cluster_logger.warning(f"Emergency cleanup: Deleted {count} inactive tunnels")

    async def _get_pid_for_pattern(self, pattern: str) -> Optional[int]:
        """Helper method to find a process PID given a pattern"""
        try:
            cmd = f"pgrep -f '{pattern}'"
            process = await asyncio.create_subprocess_shell(
                cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
            )
            stdout, _ = await process.communicate()
            output = stdout.decode().strip()

            if output:
                # Return the first PID if multiple are found
                try:
                    return int(output.split("\n")[0])
                except (ValueError, IndexError):
                    return None
            return None
        except Exception as e:
            cluster_logger.error(f"Error getting PID for pattern '{pattern}': {str(e)}")
            return None

    async def health_check(self, tunnel_id: int) -> TunnelHealthInfo:
        """
        Perform comprehensive health check on a specific tunnel.
        
        Args:
            tunnel_id: ID of the tunnel to check
            
        Returns:
            TunnelHealthInfo with detailed health status
        """
        cluster_logger.info(f"Performing health check for tunnel {tunnel_id}")
        
        tunnel = self.db.query(SSHTunnel).filter(SSHTunnel.id == tunnel_id).first()
        if not tunnel:
            return TunnelHealthInfo(
                tunnel_id=tunnel_id,
                status=HealthStatus.UNKNOWN,
                ssh_process=None,
                socat_process=None,
                port_connectivity=False,
                last_check=datetime.utcnow(),
                error_message="Tunnel not found in database"
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
        self.db.commit()
        
        health_info = TunnelHealthInfo(
            tunnel_id=tunnel_id,
            status=health_status,
            ssh_process=ssh_process,
            socat_process=socat_process,
            port_connectivity=port_connectivity,
            last_check=tunnel.last_health_check
        )
        
        cluster_logger.info(
            f"Health check completed for tunnel {tunnel_id}: {health_status.value}"
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
            cmdline = ' '.join(process.cmdline())
            memory_info = process.memory_info()
            cpu_percent = process.cpu_percent()
            
            return ProcessInfo(
                pid=pid,
                command=cmdline,
                is_running=True,
                memory_usage=memory_info.rss / 1024 / 1024,  # MB
                cpu_usage=cpu_percent
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
        port_connectivity: bool
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
        if ssh_process and socat_process and port_connectivity:
            return HealthStatus.HEALTHY
        elif ssh_process and socat_process:
            return HealthStatus.UNHEALTHY  # Processes running but no connectivity
        else:
            return HealthStatus.UNHEALTHY  # Missing processes

    async def _terminate_process_safely(self, pid: int) -> bool:
        """
        Safely terminate a process with escalating signals.
        
        Args:
            pid: Process ID to terminate
            
        Returns:
            True if successful, False otherwise
        """
        try:
            process = psutil.Process(pid)
            
            if not process.is_running():
                return True
            
            # Try SIGTERM first (graceful)
            process.terminate()
            
            # Wait up to 5 seconds for graceful termination
            try:
                process.wait(timeout=5)
                cluster_logger.debug(f"Process {pid} terminated gracefully")
                return True
            except psutil.TimeoutExpired:
                pass
            
            # If still running, use SIGKILL
            if process.is_running():
                process.kill()
                process.wait(timeout=2)
                cluster_logger.debug(f"Process {pid} killed forcefully")
                return True
                
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            # Process already gone or no permission
            return True
        except Exception as e:
            cluster_logger.error(f"Error terminating process {pid}: {str(e)}")
            return False

    async def health_check_all_active_tunnels(self) -> Dict[int, TunnelHealthInfo]:
        """
        Perform health check on all active tunnels.
        
        Returns:
            Dictionary mapping tunnel IDs to their health information
        """
        cluster_logger.info("Starting health check for all active tunnels")
        
        active_tunnels = self.db.query(SSHTunnel).filter(
            SSHTunnel.status == TunnelStatus.ACTIVE.value
        ).all()
        
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
                    f"Error during health check for tunnel {tunnel.id}: {str(e)}"
                )
                health_results[tunnel.id] = TunnelHealthInfo(
                    tunnel_id=tunnel.id,
                    status=HealthStatus.UNKNOWN,
                    ssh_process=None,
                    socat_process=None,
                    port_connectivity=False,
                    last_check=datetime.utcnow(),
                    error_message=str(e)
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
            job = self.db.query(Job).filter(Job.id == tunnel.job_id).first()
            if not job:
                cluster_logger.error(f"Job {tunnel.job_id} not found for tunnel repair")
                return False
            
            # Create new tunnel
            new_tunnel = await self.create_tunnel(job)
            
            if new_tunnel:
                cluster_logger.info(f"Successfully repaired tunnel {tunnel.id}")
                return True
            else:
                cluster_logger.error(f"Failed to repair tunnel {tunnel.id}")
                return False
                
        except Exception as e:
            cluster_logger.error(f"Error during tunnel repair: {str(e)}")
            return False

    # ...existing code...
