"""
Process Manager for SSH Tunnels

Handles creation, monitoring, and termination of SSH and socat processes.
Operates independently of database layer for better separation of concerns.
"""

import asyncio
import psutil
import signal
import subprocess
from datetime import datetime
from typing import Dict, Optional, Tuple, List
from app.core.config import settings
from app.core.logging import cluster_logger
from .enums import ProcessType, HealthStatus
from .schemas import ProcessInfo, TunnelHealthInfo


class ProcessManager:
    """
    Manages SSH and socat processes for tunnel operations.
    
    This class is responsible for:
    - Creating SSH tunnels and socat forwarders
    - Monitoring process health
    - Terminating processes safely
    - Port connectivity testing
    
    It does NOT interact with database - that's handled by TunnelService.
    """
    
    def __init__(self):
        """Initialize process manager."""
        # Track processes by port for cleanup
        self._processes: Dict[int, ProcessInfo] = {}
        
    async def create_ssh_tunnel(
        self, 
        local_port: int,
        remote_port: int, 
        remote_host: str,
        node: str
    ) -> Tuple[bool, Optional[int]]:
        """
        Create SSH tunnel process.
        
        Args:
            local_port: Local port to bind
            remote_port: Remote port to forward to
            remote_host: Remote host (usually SLURM_HOST)
            node: Target node name
            
        Returns:
            Tuple of (success, pid)
        """
        try:
            cluster_logger.info(
                f"Creating SSH tunnel: localhost:{local_port} -> "
                f"{remote_host}:{node}:{remote_port}"
            )
            
            cmd = [
                "ssh",
                "-v",  # Verbose output for debugging
                "-N",  # Don't execute remote command
                "-L", f"{local_port}:{node}:{remote_port}",
                "-o", "StrictHostKeyChecking=no",
                "-o", "UserKnownHostsFile=/dev/null",
                "-o", "ServerAliveInterval=30",
                "-o", "ServerAliveCountMax=3",
                "-o", "ExitOnForwardFailure=yes",
                "-o", "ConnectTimeout=10",
            ]
            
            # Add SSH key if available
            if settings.SLURM_KEY_FILE:
                # Expand user path
                import os
                key_path = os.path.expanduser(settings.SLURM_KEY_FILE)
                cmd.extend(["-i", key_path])
                cluster_logger.info(
                    f"Using SSH key: {key_path} (from {settings.SLURM_KEY_FILE})"
                )
                
            # Add destination
            if settings.SLURM_USER:
                destination = f"{settings.SLURM_USER}@{remote_host}"
                cmd.append(destination)
                cluster_logger.info(f"SSH destination: {destination}")
            else:
                cmd.append(remote_host)
                cluster_logger.info(f"SSH destination: {remote_host}")
            
            cluster_logger.info(f"SSH command: {' '.join(cmd)}")
            
            # Start process with better output handling
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            
            cluster_logger.info(f"SSH process started with PID: {process.pid}")
            
            # Give process time to establish and capture initial output
            await asyncio.sleep(3)
            
            # Check if process is still running and capture output
            if process.returncode is not None:
                # Process died - get all output
                stdout_data = await process.stdout.read()
                stderr_data = await process.stderr.read()
                
                cluster_logger.error(
                    f"SSH tunnel failed to start: "
                    f"returncode={process.returncode}"
                )
                cluster_logger.error(
                    f"SSH stdout: {stdout_data.decode()}"
                )
                cluster_logger.error(
                    f"SSH stderr: {stderr_data.decode()}"
                )
                return False, None
            else:
                # Process is running - check for any initial output
                # Read available data without blocking
                try:
                    stdout_data = await asyncio.wait_for(
                        process.stdout.read(1024), timeout=0.5
                    )
                    if stdout_data:
                        cluster_logger.info(
                            f"SSH stdout: {stdout_data.decode()}"
                        )
                except asyncio.TimeoutError:
                    pass
                
                try:
                    stderr_data = await asyncio.wait_for(
                        process.stderr.read(1024), timeout=0.5
                    )
                    if stderr_data:
                        cluster_logger.info(
                            f"SSH stderr: {stderr_data.decode()}"
                        )
                except asyncio.TimeoutError:
                    pass
                
            # Track the process
            process_info = ProcessInfo(
                pid=process.pid,
                port=local_port,
                process_type=ProcessType.SSH,
                is_alive=True,
                created_at=datetime.utcnow()
            )
            self._processes[local_port] = process_info
            
            cluster_logger.info(
                f"SSH tunnel created successfully: PID={process.pid}, "
                f"port={local_port}"
            )
            return True, process.pid
            
        except Exception as e:
            cluster_logger.error(f"Failed to create SSH tunnel: {e}")
            return False, None
    
    async def create_socat_forwarder(
        self,
        external_port: int,
        internal_port: int
    ) -> Tuple[bool, Optional[int]]:
        """
        Create socat forwarder process.
        
        Args:
            external_port: External port to listen on
            internal_port: Internal port to forward to
            
        Returns:
            Tuple of (success, pid)
        """
        try:
            cluster_logger.info(
                f"Creating socat forwarder: {external_port} -> {internal_port}"
            )
            
            cmd = [
                "socat",
                f"TCP-LISTEN:{external_port},fork,reuseaddr",
                f"TCP:localhost:{internal_port}"
            ]
            
            cluster_logger.info(f"Socat command: {' '.join(cmd)}")
            
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            
            cluster_logger.info(f"Socat process started with PID: {process.pid}")
            
            # Give process time to bind port
            await asyncio.sleep(1)
            
            # Check if process is still running
            if process.returncode is not None:
                stderr = await process.stderr.read()
                stdout = await process.stdout.read()
                cluster_logger.error(
                    f"Socat forwarder failed to start: "
                    f"returncode={process.returncode}, "
                    f"stderr={stderr.decode()}, "
                    f"stdout={stdout.decode()}"
                )
                return False, None
                
            # Track the process
            process_info = ProcessInfo(
                pid=process.pid,
                port=external_port,
                process_type=ProcessType.SOCAT,
                is_alive=True,
                created_at=datetime.utcnow()
            )
            self._processes[external_port] = process_info
            
            cluster_logger.info(
                f"Socat forwarder created successfully: PID={process.pid}, "
                f"port={external_port}"
            )
            return True, process.pid
            
        except Exception as e:
            cluster_logger.error(f"Failed to create socat forwarder: {e}")
            return False, None
    
    async def check_process_health(self, pid: int) -> bool:
        """Check if process with given PID is alive and healthy."""
        try:
            process = psutil.Process(pid)
            return process.is_running() and process.status() != psutil.STATUS_ZOMBIE
        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
            return False
    
    async def terminate_process(self, pid: int, port: Optional[int] = None) -> bool:
        """
        Safely terminate a process.
        
        Args:
            pid: Process ID to terminate
            port: Port associated with process (for cleanup)
            
        Returns:
            True if successfully terminated
        """
        try:
            if not await self.check_process_health(pid):
                cluster_logger.debug(f"Process {pid} already dead")
                if port and port in self._processes:
                    del self._processes[port]
                return True
                
            process = psutil.Process(pid)
            
            # Try graceful termination first
            process.terminate()
            
            # Wait for graceful termination
            try:
                process.wait(timeout=5)
                cluster_logger.info(f"Process {pid} terminated gracefully")
            except psutil.TimeoutExpired:
                # Force kill if graceful termination failed
                process.kill()
                process.wait(timeout=2)
                cluster_logger.warning(f"Process {pid} force killed")
                
            # Clean up tracking
            if port and port in self._processes:
                del self._processes[port]
                
            return True
            
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            # Process already dead
            if port and port in self._processes:
                del self._processes[port]
            return True
        except Exception as e:
            cluster_logger.error(f"Failed to terminate process {pid}: {e}")
            return False
    
    async def test_port_connectivity(
        self, 
        port: int, 
        host: str = "localhost",
        timeout: float = 3.0
    ) -> bool:
        """Test if port is accessible."""
        try:
            reader, writer = await asyncio.wait_for(
                asyncio.open_connection(host, port),
                timeout=timeout
            )
            writer.close()
            await writer.wait_closed()
            return True
        except (asyncio.TimeoutError, ConnectionRefusedError, OSError):
            return False
    
    async def get_comprehensive_health(
        self,
        tunnel_id: int,
        ssh_pid: Optional[int],
        socat_pid: Optional[int], 
        external_port: int,
        node: Optional[str] = None
    ) -> TunnelHealthInfo:
        """
        Get comprehensive health information for a tunnel.
        
        Returns detailed health status including process and connectivity checks.
        """
        health_info = TunnelHealthInfo(
            tunnel_id=tunnel_id,
            is_healthy=False,
            last_test=datetime.utcnow()
        )
        
        try:
            # Check SSH process
            if ssh_pid:
                ssh_alive = await self.check_process_health(ssh_pid)
                if ssh_pid in [p.pid for p in self._processes.values()]:
                    process_info = next(
                        p for p in self._processes.values() 
                        if p.pid == ssh_pid
                    )
                    process_info.is_alive = ssh_alive
                    process_info.last_check = datetime.utcnow()
                    health_info.ssh_process = process_info
                    
            # Check socat process  
            if socat_pid:
                socat_alive = await self.check_process_health(socat_pid)
                if socat_pid in [p.pid for p in self._processes.values()]:
                    process_info = next(
                        p for p in self._processes.values()
                        if p.pid == socat_pid
                    )
                    process_info.is_alive = socat_alive
                    process_info.last_check = datetime.utcnow()
                    health_info.socat_process = process_info
                    
            # Test port connectivity
            health_info.port_connectivity = await self.test_port_connectivity(
                external_port
            )
            
            # Determine overall health
            ssh_healthy = (health_info.ssh_process and 
                          health_info.ssh_process.is_alive)
            socat_healthy = (health_info.socat_process and 
                            health_info.socat_process.is_alive)
            
            # Check if we have PIDs but processes are dead/zombie
            ssh_expected = ssh_pid is not None
            socat_expected = socat_pid is not None
            ssh_dead = ssh_expected and not ssh_healthy
            socat_dead = socat_expected and not socat_healthy
            
            if ssh_healthy and socat_healthy and health_info.port_connectivity:
                # All processes alive and port works
                health_info.is_healthy = True
                health_info.health_status = HealthStatus.HEALTHY
            elif (ssh_dead or socat_dead):
                # One or more expected processes are dead/zombie
                health_info.is_healthy = False
                health_info.health_status = HealthStatus.UNHEALTHY
                if ssh_dead and socat_dead:
                    health_info.error_message = (
                        "Both SSH and socat processes are dead"
                    )
                elif ssh_dead:
                    health_info.error_message = "SSH process is dead/zombie"
                else:
                    health_info.error_message = "Socat process is dead/zombie"
            elif health_info.port_connectivity:
                # Port works, but processes may be untracked (legacy tunnels)
                health_info.is_healthy = True
                health_info.health_status = HealthStatus.DEGRADED
            else:
                # Port doesn't work
                health_info.is_healthy = False
                health_info.health_status = HealthStatus.UNHEALTHY
                
        except Exception as e:
            health_info.error_message = str(e)
            health_info.health_status = HealthStatus.UNKNOWN
            cluster_logger.error(
                f"Error checking tunnel {tunnel_id} health: {e}"
            )
            
        return health_info
    
    async def cleanup_all_processes(self) -> int:
        """
        Clean up all tracked processes.
        
        Returns:
            Number of processes cleaned up
        """
        cleanup_count = 0
        processes_to_cleanup = list(self._processes.values())
        
        for process_info in processes_to_cleanup:
            success = await self.terminate_process(
                process_info.pid, process_info.port
            )
            if success:
                cleanup_count += 1
                
        cluster_logger.info(f"Cleaned up {cleanup_count} processes")
        return cleanup_count
    
    def get_tracked_processes(self) -> List[ProcessInfo]:
        """Get list of all tracked processes."""
        return list(self._processes.values())
