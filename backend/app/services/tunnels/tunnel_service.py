"""
SSH Tunnel Service

Orchestrates tunnel operations using dependency injection for database sessions.
This is the main service class that coordinates between ProcessManager and database.
"""

import asyncio
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Set
from sqlalchemy.orm import Session
from fastapi import Depends

from app.core.config import settings
from app.db.session import get_db
from app.db.models import SSHTunnel, Job
from app.schemas.job import SSHTunnelInfo
from app.core.logging import cluster_logger
from .process_manager import ProcessManager
from .enums import TunnelStatus, HealthStatus
from .schemas import PortAllocation


class SSHTunnelService:
    """
    Main SSH Tunnel Service using dependency injection.
    
    This service orchestrates tunnel operations by:
    1. Managing tunnel lifecycle in database
    2. Delegating process management to ProcessManager
    3. Coordinating between database state and process state
    
    Database sessions are injected via FastAPI dependencies.
    """
    
    MIN_PORT = 9000
    MAX_PORT = 9099
    
    def __init__(self):
        """Initialize tunnel service."""
        self.process_manager = ProcessManager()
        
        # Port allocation tracking
        self._port_allocation_lock = asyncio.Semaphore(1)
        self._allocated_ports: Set[int] = set()
        
        # Background task control
        self._background_tasks_started = False
        
    async def get_or_create_tunnel(
        self, 
        job_id: int,
        db: Session = Depends(get_db)
    ) -> Optional[SSHTunnelInfo]:
        """
        Get existing tunnel or create new one for job.
        
        Uses database session dependency injection.
        
        Args:
            job_id: ID of job requiring tunnel
            db: Database session (injected)
            
        Returns:
            SSHTunnelInfo or None if creation fails
        """
        cluster_logger.info(f"Getting or creating tunnel for job {job_id}")
        
        # Ensure background tasks are running
        await self._ensure_background_tasks()
        
        async with self._port_allocation_lock:
            try:
                # Check for existing active tunnels
                existing_tunnel = db.query(SSHTunnel).filter(
                    SSHTunnel.job_id == job_id,
                    SSHTunnel.status == TunnelStatus.ACTIVE.value
                ).first()
                
                if existing_tunnel:
                    # Verify tunnel is actually healthy
                    health_info = await self.process_manager.get_comprehensive_health(
                        tunnel_id=existing_tunnel.id,
                        ssh_pid=existing_tunnel.ssh_pid,
                        socat_pid=existing_tunnel.socat_pid,
                        external_port=existing_tunnel.external_port,
                        node=existing_tunnel.node
                    )
                    
                    if health_info.is_healthy:
                        cluster_logger.info(
                            f"Found healthy existing tunnel {existing_tunnel.id} "
                            f"for job {job_id}"
                        )
                        
                        # Update health status in database
                        existing_tunnel.health_status = health_info.health_status.value
                        existing_tunnel.last_health_check = datetime.utcnow()
                        db.commit()
                        
                        return self._tunnel_to_info(existing_tunnel)
                    else:
                        cluster_logger.warning(
                            f"Existing tunnel {existing_tunnel.id} is unhealthy, "
                            f"cleaning up"
                        )
                        await self._cleanup_tunnel(existing_tunnel, db)
                
                # Create new tunnel
                return await self._create_new_tunnel(job_id, db)
                
            except Exception as e:
                cluster_logger.error(
                    f"Error in get_or_create_tunnel for job {job_id}: {e}",
                    exc_info=True
                )
                db.rollback()
                return None
    
    async def _create_new_tunnel(
        self, 
        job_id: int, 
        db: Session
    ) -> Optional[SSHTunnelInfo]:
        """Create a new tunnel for the given job."""
        # Get job information
        job = db.query(Job).filter(Job.id == job_id).first()
        if not job or not job.port or not job.node:
            cluster_logger.error(f"Job {job_id} not found or incomplete")
            return None
            
        # Allocate ports
        port_allocation = await self._allocate_ports(job_id)
        if not port_allocation:
            cluster_logger.error(f"Failed to allocate ports for job {job_id}")
            return None
            
        try:
            # Create tunnel record
            tunnel = SSHTunnel(
                job_id=job_id,
                internal_port=port_allocation.internal_port,
                external_port=port_allocation.external_port,
                remote_port=job.port,
                remote_host=job.node,
                node=job.node,
                status=TunnelStatus.PENDING.value,
                health_status=HealthStatus.PENDING.value,
                created_at=datetime.utcnow(),
                last_health_check=datetime.utcnow()
            )
            
            db.add(tunnel)
            db.flush()  # Get ID without committing
            tunnel_id = tunnel.id
            
            cluster_logger.info(
                f"Created tunnel record {tunnel_id} for job {job_id}: "
                f"{port_allocation.internal_port} -> {port_allocation.external_port}"
            )
            
            # Start async tunnel creation
            asyncio.create_task(
                self._establish_tunnel_async(tunnel_id, job_id, port_allocation, db)
            )
            
            db.commit()
            return self._tunnel_to_info(tunnel)
            
        except Exception as e:
            cluster_logger.error(f"Failed to create tunnel for job {job_id}: {e}")
            db.rollback()
            await self._release_ports(port_allocation)
            return None
    
    async def _establish_tunnel_async(
        self,
        tunnel_id: int,
        job_id: int, 
        port_allocation: PortAllocation,
        original_db: Session
    ):
        """
        Establish tunnel processes asynchronously.
        
        This runs in background and updates tunnel status as it progresses.
        """
        # Create new DB session for background task
        from app.db.session import SessionLocal
        db = SessionLocal()
        
        try:
            # Update status to CONNECTING
            tunnel = db.query(SSHTunnel).filter(SSHTunnel.id == tunnel_id).first()
            if not tunnel:
                cluster_logger.error(f"Tunnel {tunnel_id} not found for establishment")
                return
                
            tunnel.status = TunnelStatus.CONNECTING.value
            tunnel.updated_at = datetime.utcnow()
            db.commit()
            
            # Get job info
            job = db.query(Job).filter(Job.id == job_id).first()
            if not job:
                cluster_logger.error(f"Job {job_id} not found for tunnel establishment")
                tunnel.status = TunnelStatus.FAILED.value
                db.commit()
                return
                
            # Pre-flight SSH checks
            cluster_logger.info(f"Starting SSH pre-flight checks for tunnel {tunnel_id}")
            if settings.SLURM_KEY_FILE:
                try:
                    import os
                    key_path = os.path.expanduser(settings.SLURM_KEY_FILE)
                    key_exists = os.path.exists(key_path)
                    cluster_logger.info(f"SSH key path: {key_path}")
                    cluster_logger.info(f"SSH key exists: {key_exists}")
                    
                    if key_exists:
                        # Check permissions
                        stat_info = os.stat(key_path)
                        cluster_logger.info(f"SSH key permissions: {oct(stat_info.st_mode)}")
                        cluster_logger.info(f"SSH key owner: {stat_info.st_uid}:{stat_info.st_gid}")
                    else:
                        cluster_logger.error(f"SSH key not found at {key_path}")
                        tunnel.status = TunnelStatus.FAILED.value
                        db.commit()
                        return
                except Exception as e:
                    cluster_logger.error(f"Error checking SSH key: {e}")
                    tunnel.status = TunnelStatus.FAILED.value
                    db.commit()
                    return
            else:
                cluster_logger.warning("No SSH key configured (SLURM_KEY_FILE not set)")
            
            cluster_logger.info(f"SSH pre-flight checks passed for tunnel {tunnel_id}")
            
            cluster_logger.info(f"Establishing SSH tunnel for tunnel {tunnel_id}")
            cluster_logger.info(f"SSH tunnel parameters: node={job.node}, remote_port={job.port}, local_port={port_allocation.internal_port}, remote_host={settings.SLURM_HOST}")
            
            # Create SSH tunnel
            ssh_success, ssh_pid = await self.process_manager.create_ssh_tunnel(
                local_port=port_allocation.internal_port,
                remote_port=job.port,
                remote_host=settings.SLURM_HOST,
                node=job.node
            )
            
            if not ssh_success:
                cluster_logger.error(f"SSH tunnel creation failed for tunnel {tunnel_id}")
                tunnel.status = TunnelStatus.FAILED.value
                tunnel.health_status = HealthStatus.UNHEALTHY.value
                db.commit()
                await self._release_ports(port_allocation)
                return
                
            # Update SSH PID
            tunnel.ssh_pid = ssh_pid
            db.commit()
            cluster_logger.info(f"SSH tunnel established for tunnel {tunnel_id}, PID={ssh_pid}")
            
            cluster_logger.info(f"Creating socat forwarder for tunnel {tunnel_id}")
            
            # Create socat forwarder
            socat_success, socat_pid = await self.process_manager.create_socat_forwarder(
                external_port=port_allocation.external_port,
                internal_port=port_allocation.internal_port
            )
            
            if not socat_success:
                cluster_logger.error(f"Socat creation failed for tunnel {tunnel_id}")
                # Clean up SSH process
                if ssh_pid:
                    cluster_logger.info(f"Cleaning up SSH process {ssh_pid}")
                    await self.process_manager.terminate_process(ssh_pid)
                tunnel.status = TunnelStatus.FAILED.value
                tunnel.health_status = HealthStatus.UNHEALTHY.value
                db.commit()
                await self._release_ports(port_allocation)
                return
            
            # Update socat PID
            tunnel.socat_pid = socat_pid
            db.commit()
            cluster_logger.info(f"Socat forwarder established for tunnel {tunnel_id}, PID={socat_pid}")
            
            # Final connectivity test
            cluster_logger.info(f"Testing connectivity for tunnel {tunnel_id}")
            connectivity_ok = await self.process_manager.test_port_connectivity(
                port_allocation.external_port
            )
            
            if connectivity_ok:
                tunnel.status = TunnelStatus.ACTIVE.value
                tunnel.health_status = HealthStatus.HEALTHY.value
                tunnel.last_health_check = datetime.utcnow()
                tunnel.updated_at = datetime.utcnow()
                cluster_logger.info(f"Tunnel {tunnel_id} successfully established and active")
            else:
                cluster_logger.warning(f"Connectivity test failed for tunnel {tunnel_id}, but tunnel processes are running")
                tunnel.status = TunnelStatus.ACTIVE.value  # Keep as active since processes work
                tunnel.health_status = HealthStatus.DEGRADED.value
                tunnel.last_health_check = datetime.utcnow()
                tunnel.updated_at = datetime.utcnow()
                cluster_logger.info(f"Tunnel {tunnel_id} established with degraded connectivity")
            
            db.commit()
            
        except Exception as e:
            cluster_logger.error(
                f"Error establishing tunnel {tunnel_id}: {e}", 
                exc_info=True
            )
            if 'tunnel' in locals():
                tunnel.status = TunnelStatus.FAILED.value
                tunnel.health_status = HealthStatus.UNHEALTHY.value
                db.commit()
            await self._release_ports(port_allocation)
        finally:
            db.close()
    
    async def _allocate_ports(self, job_id: int) -> Optional[PortAllocation]:
        """Allocate internal and external ports for a tunnel."""
        try:
            cluster_logger.info(f"Allocating ports for job {job_id}")
            cluster_logger.debug(f"Currently allocated ports: {self._allocated_ports}")
            
            # Find available ports
            internal_port = await self._find_free_port(exclude=self._allocated_ports)
            if not internal_port:
                cluster_logger.error(f"No free internal port available for job {job_id}")
                return None
                
            cluster_logger.info(f"Found internal port {internal_port} for job {job_id}")
                
            external_port = await self._find_free_port(
                exclude=self._allocated_ports | {internal_port}
            )
            if not external_port:
                cluster_logger.error(f"No free external port available for job {job_id}")
                return None
                
            cluster_logger.info(f"Found external port {external_port} for job {job_id}")
                
            # Reserve ports
            self._allocated_ports.add(internal_port)
            self._allocated_ports.add(external_port)
            
            cluster_logger.info(
                f"Allocated ports for job {job_id}: "
                f"internal={internal_port}, external={external_port}"
            )
            
            return PortAllocation(
                internal_port=internal_port,
                external_port=external_port,
                job_id=job_id,
                allocated_at=datetime.utcnow()
            )
            
        except Exception as e:
            cluster_logger.error(f"Error allocating ports for job {job_id}: {e}")
            return None
    
    async def _release_ports(self, port_allocation: PortAllocation):
        """Release previously allocated ports."""
        self._allocated_ports.discard(port_allocation.internal_port)
        self._allocated_ports.discard(port_allocation.external_port)
        cluster_logger.debug(
            f"Released ports {port_allocation.internal_port}, "
            f"{port_allocation.external_port}"
        )
    
    async def _find_free_port(self, exclude: Set[int] = None) -> Optional[int]:
        """Find a free port in the allowed range."""
        if exclude is None:
            exclude = set()
            
        cluster_logger.debug(f"Looking for free port in range {self.MIN_PORT}-{self.MAX_PORT}, excluding {len(exclude)} ports")
            
        ports_checked = 0
        for port in range(self.MIN_PORT, self.MAX_PORT + 1):
            ports_checked += 1
            if port in exclude:
                continue
                
            # Check if port is not in use by binding to it
            try:
                import socket
                with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                    s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
                    s.bind(('localhost', port))
                    # If we can bind, port is free
                    cluster_logger.debug(f"Found free port {port} after checking {ports_checked} ports")
                    return port
            except OSError as e:
                # Port is in use, continue
                if ports_checked <= 5:  # Log first few attempts
                    cluster_logger.debug(f"Port {port} in use: {e}")
                continue
                
        cluster_logger.error(f"No free ports found in range {self.MIN_PORT}-{self.MAX_PORT} after checking {ports_checked} ports")
        return None
    
    async def _cleanup_tunnel(self, tunnel: SSHTunnel, db: Session):
        """Clean up a tunnel's processes and database record."""
        cluster_logger.info(f"Cleaning up tunnel {tunnel.id}")
        
        # Terminate processes
        if tunnel.ssh_pid:
            await self.process_manager.terminate_process(tunnel.ssh_pid)
        if tunnel.socat_pid:
            await self.process_manager.terminate_process(tunnel.socat_pid)
            
        # Release ports
        if tunnel.internal_port:
            self._allocated_ports.discard(tunnel.internal_port)
        if tunnel.external_port:
            self._allocated_ports.discard(tunnel.external_port)
            
        # Delete from database
        db.delete(tunnel)
        db.commit()
        
        cluster_logger.info(f"Cleaned up tunnel {tunnel.id}")
    
    def _tunnel_to_info(self, tunnel: SSHTunnel) -> SSHTunnelInfo:
        """Convert database model to schema."""
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
            updated_at=tunnel.updated_at
        )
    
    async def _ensure_background_tasks(self):
        """Ensure background maintenance tasks are running."""
        if not self._background_tasks_started:
            asyncio.create_task(self._periodic_cleanup_task())
            self._background_tasks_started = True
            cluster_logger.info("Background tasks started")
    
    async def _periodic_cleanup_task(self):
        """Periodic cleanup of inactive tunnels."""
        while True:
            try:
                await asyncio.sleep(300)  # 5 minutes
                await self._cleanup_inactive_tunnels()
            except asyncio.CancelledError:
                cluster_logger.info("Cleanup task cancelled")
                break
            except Exception as e:
                cluster_logger.error(f"Error in cleanup task: {e}")
                await asyncio.sleep(60)  # Wait before retry
    
    async def _cleanup_inactive_tunnels(self):
        """Clean up inactive tunnels."""
        from app.db.session import SessionLocal
        db = SessionLocal()
        
        try:
            # Find old or unhealthy tunnels
            old_time = datetime.utcnow() - timedelta(hours=2)
            old_tunnels = db.query(SSHTunnel).filter(
                SSHTunnel.created_at < old_time
            ).all()
            
            cleanup_count = 0
            for tunnel in old_tunnels:
                health_info = await self.process_manager.get_comprehensive_health(
                    tunnel_id=tunnel.id,
                    ssh_pid=tunnel.ssh_pid,
                    socat_pid=tunnel.socat_pid,
                    external_port=tunnel.external_port,
                    node=tunnel.node
                )
                
                if not health_info.is_healthy:
                    await self._cleanup_tunnel(tunnel, db)
                    cleanup_count += 1
                    
            if cleanup_count > 0:
                cluster_logger.info(f"Cleaned up {cleanup_count} inactive tunnels")
                
        except Exception as e:
            cluster_logger.error(f"Error in cleanup: {e}")
        finally:
            db.close()
    
    async def close_tunnel(self, tunnel_id: int, db: Session = Depends(get_db)) -> bool:
        """Close a specific tunnel."""
        tunnel = db.query(SSHTunnel).filter(SSHTunnel.id == tunnel_id).first()
        if not tunnel:
            return False
            
        await self._cleanup_tunnel(tunnel, db)
        return True
    
    async def close_job_tunnels(self, job_id: int, db: Session = Depends(get_db)) -> int:
        """Close all tunnels for a job."""
        tunnels = db.query(SSHTunnel).filter(SSHTunnel.job_id == job_id).all()
        
        cleanup_count = 0
        for tunnel in tunnels:
            await self._cleanup_tunnel(tunnel, db)
            cleanup_count += 1
            
        return cleanup_count
    
    def get_job_tunnels(self, job_id: int, db: Session = Depends(get_db)) -> List[SSHTunnelInfo]:
        """Get all tunnels for a job."""
        tunnels = db.query(SSHTunnel).filter(SSHTunnel.job_id == job_id).all()
        return [self._tunnel_to_info(tunnel) for tunnel in tunnels]
    
    async def health_check(
        self, 
        tunnel_id: int, 
        db: Session = Depends(get_db)
    ):
        """Get comprehensive health information for a tunnel."""
        tunnel = db.query(SSHTunnel).filter(SSHTunnel.id == tunnel_id).first()
        if not tunnel:
            return None
            
        # Extract values from SQLAlchemy model
        tunnel_data = {
            'ssh_pid': tunnel.ssh_pid,
            'socat_pid': tunnel.socat_pid,
            'external_port': tunnel.external_port,
            'node': tunnel.node
        }
        
        health_info = await self.process_manager.get_comprehensive_health(
            tunnel_id=tunnel_id,
            ssh_pid=tunnel_data['ssh_pid'],
            socat_pid=tunnel_data['socat_pid'],
            external_port=tunnel_data['external_port'],
            node=tunnel_data['node']
        )
        
        # Update health status in database
        db.query(SSHTunnel).filter(SSHTunnel.id == tunnel_id).update({
            'health_status': health_info.health_status.value,
            'last_health_check': datetime.utcnow()
        })
        db.commit()
        
        return health_info
