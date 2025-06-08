"""
Professional SSH Tunnel Service with PID tracking and health monitoring.

This module provides a comprehensive SSH tunnel management service with:
- Process ID tracking for SSH and socat processes
- Health monitoring and status checking
- Automatic cleanup and recovery
- Professional error handling and logging
"""

import asyncio
import random
import subprocess
import os
import signal
import psutil
from typing import Optional, List, Dict, Tuple, Set
from enum import Enum
from dataclasses import dataclass
from datetime import datetime, timedelta
import socket
import time
import aiohttp

from sqlalchemy.orm import Session
from app.db.models import SSHTunnel, Job
from app.core.logging import cluster_logger
from app.core.config import settings
from app.schemas.job import SSHTunnelInfo


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


class SSHTunnelServiceOptimized:
    """
    Professional SSH Tunnel Service with enhanced monitoring and PID tracking.

    This service provides comprehensive tunnel management with:
    - Automatic PID tracking for SSH and socat processes
    - Health monitoring with detailed process information
    - Robust error handling and recovery mechanisms
    - Port management with collision detection
    - Background cleanup and maintenance
    """

    # Port range configuration
    MIN_PORT = 8600
    MAX_PORT = 8700

    # Health check configuration
    HEALTH_CHECK_TIMEOUT = 5
    HEALTH_CHECK_INTERVAL = 300  # 5 minutes

    # Process monitoring configuration
    PROCESS_CHECK_TIMEOUT = 2

    def __init__(self, db: Session):
        """
        Initialize the SSH tunnel service.

        Args:
            db: Database session for tunnel persistence
        """
        self.db = db
        self._cleanup_lock: Optional[asyncio.Lock] = None
        self._last_cleanup_time = datetime.min
        self._cleanup_in_progress = False
        self._tunnels_restored = False

        # Enhanced process tracking with metadata
        self._ssh_processes: Dict[int, ProcessInfo] = {}  # {port: ProcessInfo}
        self._socat_processes: Dict[int, ProcessInfo] = {}  # {port: ProcessInfo}

        cluster_logger.info("SSH Tunnel Service initialized with enhanced monitoring")

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
            port_connectivity = await self._test_port_connectivity(
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
            last_check=tunnel.last_health_check,
        )

        cluster_logger.info(
            f"Health check completed for tunnel {tunnel_id}: {health_status.value}"
        )

        return health_info

    async def health_check_all_active_tunnels(self) -> Dict[int, TunnelHealthInfo]:
        """
        Perform health check on all active tunnels.

        Returns:
            Dictionary mapping tunnel IDs to their health information
        """
        cluster_logger.info("Starting health check for all active tunnels")

        active_tunnels = (
            self.db.query(SSHTunnel)
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
                    f"Error during health check for tunnel {tunnel.id}: {str(e)}"
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

        cluster_logger.info(f"Health check completed for {len(health_results)} tunnels")

        return health_results

    async def create_tunnel_enhanced(self, job: Job) -> Optional[SSHTunnelInfo]:
        """
        Create an SSH tunnel with enhanced PID tracking and monitoring.

        Args:
            job: Job object requiring tunnel access

        Returns:
            SSHTunnelInfo if successful, None otherwise
        """
        await self.ensure_tunnels_restored()

        if not job.port or not job.node:
            cluster_logger.error(f"Job {job.id} missing port or node information")
            return None

        cluster_logger.info(f"Creating enhanced tunnel for job {job.id}")

        # Find available ports
        internal_port = await self._find_free_port()
        if not internal_port:
            cluster_logger.error("No free internal port available")
            return None

        external_port = await self._find_free_port()
        if not external_port:
            cluster_logger.error("No free external port available")
            return None

        try:
            # Establish SSH tunnel with PID tracking
            ssh_success, ssh_pid = await self._establish_ssh_tunnel_enhanced(
                local_port=internal_port,
                remote_port=job.port,
                remote_host=settings.SLURM_HOST,
                node=job.node,
            )

            if not ssh_success or not ssh_pid:
                cluster_logger.error("Failed to establish SSH tunnel")
                return None

            # Start socat forwarder with PID tracking
            socat_success, socat_pid = await self._start_socat_forwarder_enhanced(
                external_port=external_port, internal_port=internal_port
            )

            if not socat_success or not socat_pid:
                # Clean up SSH tunnel if socat fails
                await self._terminate_process_safely(ssh_pid)
                cluster_logger.error("Failed to establish socat forwarder")
                return None

            # Create tunnel record with PID information
            now = datetime.utcnow()
            tunnel = SSHTunnel(
                job_id=job.id,
                external_port=external_port,
                internal_port=internal_port,
                remote_port=job.port,
                remote_host=job.node,
                node=job.node,
                status=TunnelStatus.ACTIVE.value,
                ssh_pid=ssh_pid,
                socat_pid=socat_pid,
                health_status=HealthStatus.HEALTHY.value,
                created_at=now,
                last_health_check=now,
            )

            self.db.add(tunnel)
            self.db.commit()
            self.db.refresh(tunnel)

            # Store process information for tracking
            await self._update_process_tracking(tunnel)

            cluster_logger.info(
                f"Successfully created tunnel {tunnel.id} for job {job.id} "
                f"(SSH PID: {ssh_pid}, socat PID: {socat_pid})"
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

        except Exception as e:
            cluster_logger.error(f"Error creating enhanced tunnel: {str(e)}")
            return None

    async def close_tunnel_safely(self, tunnel_id: int) -> bool:
        """
        Safely close a tunnel with proper process cleanup.

        Args:
            tunnel_id: ID of the tunnel to close

        Returns:
            True if successful, False otherwise
        """
        cluster_logger.info(f"Safely closing tunnel {tunnel_id}")

        tunnel = self.db.query(SSHTunnel).filter(SSHTunnel.id == tunnel_id).first()
        if not tunnel:
            cluster_logger.warning(f"Tunnel {tunnel_id} not found")
            return False

        success = True

        # Terminate SSH process
        if tunnel.ssh_pid:
            if not await self._terminate_process_safely(tunnel.ssh_pid):
                success = False

        # Terminate socat process
        if tunnel.socat_pid:
            if not await self._terminate_process_safely(tunnel.socat_pid):
                success = False

        # Clean up process tracking
        if tunnel.internal_port in self._ssh_processes:
            del self._ssh_processes[tunnel.internal_port]
        if tunnel.external_port in self._socat_processes:
            del self._socat_processes[tunnel.external_port]

        # Update tunnel status
        tunnel.status = TunnelStatus.CLOSED.value
        tunnel.health_status = HealthStatus.UNKNOWN.value
        self.db.commit()

        cluster_logger.info(
            f"Tunnel {tunnel_id} closed {'successfully' if success else 'with errors'}"
        )

        return success

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

    async def _test_port_connectivity(self, port: int, node: str) -> bool:
        """
        Test if a port is accessible and responding.

        Args:
            port: Port number to test
            node: Node name for logging

        Returns:
            True if port is accessible, False otherwise
        """
        try:
            async with aiohttp.ClientSession() as session:
                url = f"http://localhost:{port}"
                async with session.get(
                    url, timeout=aiohttp.ClientTimeout(total=self.HEALTH_CHECK_TIMEOUT)
                ) as response:
                    # Any response indicates connectivity
                    return True
        except (aiohttp.ClientError, asyncio.TimeoutError):
            return False
        except Exception as e:
            cluster_logger.debug(f"Port connectivity test failed: {str(e)}")
            return False

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
        if ssh_process and socat_process and port_connectivity:
            return HealthStatus.HEALTHY
        elif ssh_process and socat_process:
            return HealthStatus.UNHEALTHY  # Processes running but no connectivity
        else:
            return HealthStatus.UNHEALTHY  # Missing processes

    async def _establish_ssh_tunnel_enhanced(
        self, local_port: int, remote_port: int, remote_host: str, node: str
    ) -> Tuple[bool, Optional[int]]:
        """
        Establish SSH tunnel with enhanced PID tracking.

        Args:
            local_port: Local port for SSH tunnel
            remote_port: Remote port on target node
            remote_host: Remote host (SLURM head node)
            node: Target compute node

        Returns:
            Tuple of (success, pid)
        """
        try:
            cmd = [
                "ssh",
                "-N",  # Don't execute remote command
                "-f",  # Go to background
                "-o",
                "StrictHostKeyChecking=no",
                "-o",
                "UserKnownHostsFile=/dev/null",
                "-o",
                "ServerAliveInterval=30",
                "-o",
                "ServerAliveCountMax=3",
                "-L",
                f"{local_port}:{node}:{remote_port}",
                f"{settings.SLURM_USER}@{remote_host}",
            ]

            cluster_logger.debug(f"Starting SSH tunnel: {' '.join(cmd)}")

            process = await asyncio.create_subprocess_exec(
                *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
            )

            stdout, stderr = await process.communicate()

            if process.returncode != 0:
                error_msg = stderr.decode("utf-8") if stderr else "Unknown error"
                cluster_logger.error(f"SSH tunnel failed: {error_msg}")
                return False, None

            # Wait for tunnel establishment
            await asyncio.sleep(2)

            # Find the SSH process PID
            ssh_pid = await self._find_process_by_command(
                f"ssh.*{local_port}:{node}:{remote_port}"
            )

            if not ssh_pid:
                cluster_logger.error("Could not find SSH process PID")
                return False, None

            # Verify port is listening
            if not await self._is_port_listening(local_port):
                cluster_logger.error(f"SSH tunnel port {local_port} not listening")
                return False, None

            cluster_logger.info(f"SSH tunnel established with PID {ssh_pid}")
            return True, ssh_pid

        except Exception as e:
            cluster_logger.error(f"Error establishing SSH tunnel: {str(e)}")
            return False, None

    async def _start_socat_forwarder_enhanced(
        self, external_port: int, internal_port: int
    ) -> Tuple[bool, Optional[int]]:
        """
        Start socat forwarder with enhanced PID tracking.

        Args:
            external_port: External port to listen on
            internal_port: Internal port to forward to

        Returns:
            Tuple of (success, pid)
        """
        try:
            cmd = [
                "socat",
                f"TCP-LISTEN:{external_port},reuseaddr,fork",
                f"TCP:127.0.0.1:{internal_port}",
            ]

            cluster_logger.debug(f"Starting socat forwarder: {' '.join(cmd)}")

            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                start_new_session=True,
            )

            # Wait for socat to start
            await asyncio.sleep(1)

            # Check if process is still running
            if process.returncode is not None:
                stdout, stderr = await process.communicate()
                error_msg = stderr.decode("utf-8") if stderr else "Unknown error"
                cluster_logger.error(f"Socat forwarder failed: {error_msg}")
                return False, None

            socat_pid = process.pid

            # Verify port is listening
            if not await self._is_port_listening(external_port, external=True):
                cluster_logger.error(f"Socat port {external_port} not listening")
                return False, None

            cluster_logger.info(f"Socat forwarder started with PID {socat_pid}")
            return True, socat_pid

        except Exception as e:
            cluster_logger.error(f"Error starting socat forwarder: {str(e)}")
            return False, None

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

    async def _find_process_by_command(self, pattern: str) -> Optional[int]:
        """
        Find process PID by command pattern.

        Args:
            pattern: Regex pattern to match against command line

        Returns:
            Process PID if found, None otherwise
        """
        try:
            cmd = f"pgrep -f '{pattern}'"
            process = await asyncio.create_subprocess_shell(
                cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
            )

            stdout, _ = await process.communicate()
            output = stdout.decode().strip()

            if output:
                # Return first PID if multiple found
                return int(output.split("\n")[0])

            return None

        except Exception as e:
            cluster_logger.error(
                f"Error finding process by pattern '{pattern}': {str(e)}"
            )
            return None

    async def _is_port_listening(self, port: int, external: bool = False) -> bool:
        """
        Check if a port is listening for connections.

        Args:
            port: Port number to check
            external: Whether to check external interface (0.0.0.0) or localhost

        Returns:
            True if port is listening, False otherwise
        """
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.settimeout(1)
                address = "0.0.0.0" if external else "127.0.0.1"
                result = s.connect_ex((address, port))
                return result == 0
        except Exception:
            return False

    async def _find_free_port(self) -> Optional[int]:
        """
        Find a free port within the configured range.

        Returns:
            Free port number if available, None otherwise
        """
        # Get used ports from database
        used_ports = set()
        for tunnel in (
            self.db.query(SSHTunnel)
            .filter(SSHTunnel.status.in_([TunnelStatus.ACTIVE.value]))
            .all()
        ):
            if tunnel.external_port:
                used_ports.add(tunnel.external_port)
            if tunnel.internal_port:
                used_ports.add(tunnel.internal_port)

        # Try random ports within range
        all_ports = list(range(self.MIN_PORT, self.MAX_PORT + 1))
        random.shuffle(all_ports)

        for port in all_ports:
            if port in used_ports:
                continue

            if not await self._is_port_listening(port, external=True):
                return port

        cluster_logger.error("No free ports available in configured range")
        return None

    async def _update_process_tracking(self, tunnel: SSHTunnel):
        """
        Update internal process tracking information.

        Args:
            tunnel: Tunnel object with process information
        """
        if tunnel.ssh_pid and tunnel.internal_port:
            ssh_info = await self._check_process_health(tunnel.ssh_pid)
            if ssh_info:
                self._ssh_processes[tunnel.internal_port] = ssh_info

        if tunnel.socat_pid and tunnel.external_port:
            socat_info = await self._check_process_health(tunnel.socat_pid)
            if socat_info:
                self._socat_processes[tunnel.external_port] = socat_info

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
            await self.close_tunnel_safely(tunnel.id)

            # Get associated job
            job = self.db.query(Job).filter(Job.id == tunnel.job_id).first()
            if not job:
                cluster_logger.error(f"Job {tunnel.job_id} not found for tunnel repair")
                return False

            # Create new tunnel
            new_tunnel = await self.create_tunnel_enhanced(job)

            if new_tunnel:
                cluster_logger.info(f"Successfully repaired tunnel {tunnel.id}")
                return True
            else:
                cluster_logger.error(f"Failed to repair tunnel {tunnel.id}")
                return False

        except Exception as e:
            cluster_logger.error(f"Error during tunnel repair: {str(e)}")
            return False

    # Maintain compatibility with existing methods
    async def ensure_tunnels_restored(self):
        """Ensure tunnels are restored - compatibility method."""
        if not self._tunnels_restored:
            # Simplified restoration for now
            self._tunnels_restored = True
