"""
SSH Tunnel Service

Orchestrates tunnel operations using dependency injection for database sessions.
This is the main service class that coordinates between ProcessManager and database.
"""

import asyncio
from datetime import datetime
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
        
        # REMOVED: _background_tasks_started (not needed for synchronous tunnel creation)
    
    async def _send_websocket_event(
        self, job_id: int, event_type: str, data: Dict
    ):
        """Send WebSocket event to tunnel setup channel."""
        try:
            from app.websocket.manager import websocket_manager
            
            # Add common event metadata
            event_data = {
                "type": event_type,
                "job_id": job_id,
                "timestamp": datetime.utcnow().isoformat(),
                **data
            }
            
            # Send to job-specific tunnel setup channel
            channel = f"tunnel_setup_{job_id}"
            await websocket_manager.broadcast_to_channel(channel, event_data)
            
        except Exception as e:
            cluster_logger.warning(
                f"Failed to send WebSocket event for job {job_id}: {e}"
            )
    
    def get_active_tunnel_for_job(self, job_id: int, db: Session) -> Optional[SSHTunnelInfo]:
        """Get existing active tunnel for a job if it exists."""
        existing_tunnel = (
            db.query(SSHTunnel)
            .filter(
                SSHTunnel.job_id == job_id,
                SSHTunnel.status == TunnelStatus.ACTIVE.value
            )
            .first()
        )
        
        if existing_tunnel:
            return self._tunnel_to_info(existing_tunnel)
        return None
        
    async def get_or_create_tunnel_sync(
        self,
        job_id: int,
        db: Session
    ) -> Optional[SSHTunnelInfo]:
        """
        Create or get existing tunnel for a job, wait for full establishment.
        Synchronous version that waits for tunnel to be ACTIVE before returning.
        """
        try:
            # CRITICAL FIX: Use SELECT FOR UPDATE to prevent race conditions
            # This ensures only one request can create tunnel for a job at time
            existing_tunnel = (
                db.query(SSHTunnel)
                .filter(
                    SSHTunnel.job_id == job_id,
                    SSHTunnel.status.in_([TunnelStatus.ACTIVE.value, TunnelStatus.CONNECTING.value])
                )
                .with_for_update()  # Lock row to prevent race conditions
                .first()
            )
            
            if existing_tunnel:
                if existing_tunnel.status == TunnelStatus.ACTIVE.value:
                    cluster_logger.info(f"Found existing active tunnel {existing_tunnel.id} for job {job_id}")
                    return self._tunnel_to_info(existing_tunnel)
                else:
                    # Wait for connecting tunnel to become active
                    cluster_logger.info(f"Found connecting tunnel {existing_tunnel.id}, waiting for completion...")
                    return await self._wait_for_tunnel_active(existing_tunnel.id, db)
            
            # No existing tunnel, create new one synchronously WITH TRANSACTION
            return await self._create_tunnel_sync(job_id, db)
            
        except Exception as e:
            cluster_logger.error(f"Error in get_or_create_tunnel_sync for job {job_id}: {e}")
            return None

    async def _create_tunnel_sync(
        self,
        job_id: int,
        db: Session
    ) -> Optional[SSHTunnelInfo]:
        """Create tunnel synchronously and wait for it to be established.
        
        CRITICAL: This method uses database transactions and proper cleanup
        to prevent resource leaks and inconsistent state.
        """
        
        # Get job
        job = db.query(Job).filter(Job.id == job_id).first()
        if not job:
            cluster_logger.error(f"Job {job_id} not found")
            return None
        
        await self._send_websocket_event(job_id, "setup_progress", {
            "message": "🔄 Allocating ports...",
            "step": "port_allocation"
        })
        
        port_allocation = None
        tunnel_id = None
        
        try:
            # Step 1: Allocate ports
            port_allocation = await self._allocate_ports(job_id)
            if not port_allocation:
                await self._send_websocket_event(job_id, "setup_error", {
                    "message": "❌ No available ports",
                    "step": "port_allocation",
                    "error": "Failed to allocate ports"
                })
                cluster_logger.error(f"Failed to allocate ports for job {job_id}")
                return None

            msg = (f"✅ Ports allocated: {port_allocation.internal_port} "
                   f"-> {port_allocation.external_port}")
            await self._send_websocket_event(job_id, "setup_progress", {
                "message": msg,
                "step": "port_allocation",
                "details": {
                    "internal_port": port_allocation.internal_port,
                    "external_port": port_allocation.external_port
                }
            })
            
            # Step 2: Create tunnel record in database FIRST 
            # (before starting processes to prevent orphaned processes)
            tunnel_id = await self._create_tunnel_record_atomic(
                job_id, port_allocation, db
            )
            if not tunnel_id:
                raise Exception("Failed to create tunnel database record")
                
            # Step 3: Establish tunnel processes
            success = await self._establish_tunnel_sync_internal(
                tunnel_id, job_id, port_allocation, job, db
            )
            
            if success:
                return await self._get_tunnel_info(tunnel_id, db)
            else:
                # If tunnel setup failed, cleanup will happen in except block
                raise Exception("Tunnel establishment failed")
                
        except Exception as e:
            cluster_logger.error(f"Error creating tunnel for job {job_id}: {e}")
            
            # CRITICAL: Cleanup resources on failure
            await self._cleanup_failed_tunnel(tunnel_id, port_allocation, job_id)
            
            await self._send_websocket_event(job_id, "setup_error", {
                "message": f"❌ Tunnel creation failed: {str(e)}",
                "step": "tunnel_creation",
                "error": str(e)
            })
            return None
            # Create tunnel record
            await self._send_websocket_event(job_id, "setup_progress", {
                "message": "💾 Creating tunnel record...",
                "step": "database"
            })
            
            tunnel = SSHTunnel(
                job_id=job_id,
                internal_port=port_allocation.internal_port,
                external_port=port_allocation.external_port,
                remote_port=job.port,
                remote_host=job.node,
                node=job.node,
                status=TunnelStatus.CONNECTING.value,
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
            
            await self._send_websocket_event(job_id, "setup_progress", {
                "message": f"✅ Tunnel record created (ID: {tunnel_id})",
                "step": "database",
                "details": {
                    "tunnel_id": tunnel_id
                }
            })
            
            # Establish tunnel synchronously
            success = await self._establish_tunnel_sync_internal(tunnel_id, job_id, port_allocation, job, db)
            
            if success:
                db.commit()
                # Refresh tunnel from DB
                tunnel = db.query(SSHTunnel).filter(SSHTunnel.id == tunnel_id).first()
                return self._tunnel_to_info(tunnel)
            else:
                db.rollback()
                await self._release_ports(port_allocation)
                return None
                
        except Exception as e:
            await self._send_websocket_event(job_id, "setup_error", {
                "message": f"❌ Database error: {str(e)}",
                "step": "database",
                "error": str(e)
            })
            cluster_logger.error(f"Failed to create tunnel for job {job_id}: {e}")
            db.rollback()
            await self._release_ports(port_allocation)
            return None

    async def _establish_tunnel_sync_internal(
        self,
        tunnel_id: int,
        job_id: int,
        port_allocation: PortAllocation,
        job: Job,
        db: Session
    ) -> bool:
        """Establish tunnel synchronously (internal method)."""
        
        try:
            tunnel = db.query(SSHTunnel).filter(SSHTunnel.id == tunnel_id).first()
            if not tunnel:
                cluster_logger.error(f"Tunnel {tunnel_id} not found for establishment")
                return False
            
            # SSH pre-flight checks
            await self._send_websocket_event(job_id, "tunnel_progress", {
                "message": "🔍 Performing SSH pre-flight checks...",
                "step": "ssh_preflight"
            })
            
            if settings.SLURM_KEY_FILE:
                try:
                    import os
                    key_path = os.path.expanduser(settings.SLURM_KEY_FILE)
                    if not os.path.exists(key_path):
                        await self._send_websocket_event(job_id, "tunnel_error", {
                            "message": f"❌ SSH key not found: {key_path}",
                            "step": "ssh_preflight",
                            "error": f"SSH key not found at {key_path}"
                        })
                        return False
                except Exception as e:
                    await self._send_websocket_event(job_id, "tunnel_error", {
                        "message": f"❌ SSH key check failed: {str(e)}",
                        "step": "ssh_preflight",
                        "error": str(e)
                    })
                    return False
            
            await self._send_websocket_event(job_id, "tunnel_progress", {
                "message": "✅ SSH pre-flight checks passed",
                "step": "ssh_preflight"
            })
            
            # Create SSH tunnel
            await self._send_websocket_event(job_id, "tunnel_progress", {
                "message": f"🔗 Establishing SSH tunnel: {job.node}:{job.port}",
                "step": "ssh_tunnel",
                "details": {
                    "node": job.node,
                    "remote_port": job.port,
                    "local_port": port_allocation.internal_port
                }
            })
            
            ssh_success, ssh_pid = await self.process_manager.create_ssh_tunnel(
                local_port=port_allocation.internal_port,
                remote_port=job.port,
                remote_host=settings.SLURM_HOST,
                node=job.node
            )
            
            if not ssh_success:
                await self._send_websocket_event(job_id, "tunnel_error", {
                    "message": "❌ SSH tunnel creation failed",
                    "step": "ssh_tunnel",
                    "error": "SSH process creation failed"
                })
                return False
                
            tunnel.ssh_pid = ssh_pid
            db.flush()
            
            await self._send_websocket_event(job_id, "tunnel_progress", {
                "message": f"✅ SSH tunnel established (PID: {ssh_pid})",
                "step": "ssh_tunnel",
                "details": {"ssh_pid": ssh_pid}
            })
            
            # Create socat forwarder
            await self._send_websocket_event(job_id, "tunnel_progress", {
                "message": f"🔄 Creating port forwarder: {port_allocation.external_port} -> {port_allocation.internal_port}",
                "step": "socat_forwarder",
                "details": {
                    "external_port": port_allocation.external_port,
                    "internal_port": port_allocation.internal_port
                }
            })
            
            socat_success, socat_pid = await self.process_manager.create_socat_forwarder(
                external_port=port_allocation.external_port,
                internal_port=port_allocation.internal_port
            )
            
            if not socat_success:
                await self._send_websocket_event(job_id, "tunnel_error", {
                    "message": "❌ Port forwarder creation failed",
                    "step": "socat_forwarder",
                    "error": "Socat process creation failed"
                })
                # Clean up SSH
                if ssh_pid:
                    await self.process_manager.terminate_process(ssh_pid)
                return False
            
            tunnel.socat_pid = socat_pid
            db.flush()
            
            await self._send_websocket_event(job_id, "tunnel_progress", {
                "message": f"✅ Port forwarder established (PID: {socat_pid})",
                "step": "socat_forwarder",
                "details": {"socat_pid": socat_pid}
            })
            
            # Final connectivity test
            await self._send_websocket_event(job_id, "tunnel_progress", {
                "message": f"🧪 Testing port connectivity: {port_allocation.external_port}",
                "step": "connectivity_test",
                "details": {"testing_port": port_allocation.external_port}
            })
            
            connectivity_ok = await self.process_manager.test_port_connectivity(
                port_allocation.external_port
            )
            
            if connectivity_ok:
                tunnel.status = TunnelStatus.ACTIVE.value
                tunnel.health_status = HealthStatus.HEALTHY.value
                tunnel.last_health_check = datetime.utcnow()
                tunnel.updated_at = datetime.utcnow()
                
                await self._send_websocket_event(job_id, "tunnel_established", {
                    "message": f"🎉 Tunnel successfully established!",
                    "step": "complete",
                    "tunnel_id": tunnel_id,
                    "details": {
                        "status": "ACTIVE",
                        "health_status": "HEALTHY",
                        "external_port": port_allocation.external_port,
                        "ssh_pid": ssh_pid,
                        "socat_pid": socat_pid
                    }
                })
                return True
            else:
                tunnel.status = TunnelStatus.ACTIVE.value  
                tunnel.health_status = HealthStatus.DEGRADED.value
                tunnel.last_health_check = datetime.utcnow()
                tunnel.updated_at = datetime.utcnow()
                
                await self._send_websocket_event(job_id, "tunnel_warning", {
                    "message": "⚠️ Tunnel established but connectivity test failed",
                    "step": "connectivity_test",
                    "details": {"status": "DEGRADED"}
                })
                return True
                
        except Exception as e:
            await self._send_websocket_event(job_id, "tunnel_error", {
                "message": f"❌ Tunnel establishment failed: {str(e)}",
                "step": "ssh_tunnel",
                "error": str(e)
            })
            cluster_logger.error(f"Failed to establish tunnel {tunnel_id}: {e}")
            return False

    async def _wait_for_tunnel_active(self, tunnel_id: int, db: Session, timeout: int = 120) -> Optional[SSHTunnelInfo]:
        """Wait for existing connecting tunnel to become active."""
        import asyncio
        
        start_time = asyncio.get_event_loop().time()
        
        while True:
            tunnel = db.query(SSHTunnel).filter(SSHTunnel.id == tunnel_id).first()
            if not tunnel:
                return None
                
            if tunnel.status == TunnelStatus.ACTIVE.value:
                return self._tunnel_to_info(tunnel)
            elif tunnel.status == TunnelStatus.FAILED.value:
                return None
                
            if asyncio.get_event_loop().time() - start_time > timeout:
                cluster_logger.error(f"Timeout waiting for tunnel {tunnel_id} to become active")
                return None
                
            await asyncio.sleep(1)

    async def get_or_create_tunnel(
        self,
        job_id: int,
        db: Session = Depends(get_db)
    ) -> Optional[SSHTunnelInfo]:
        """
        DEPRECATED: Use get_or_create_tunnel_sync() instead.
        This method exists only for backwards compatibility.
        """
        cluster_logger.warning(f"DEPRECATED: get_or_create_tunnel() called for job {job_id}. Use get_or_create_tunnel_sync() instead.")
        # Forward to synchronous version for consistency
        return await self.get_or_create_tunnel_sync(job_id, db)
    
    # REMOVED: _create_new_tunnel() - replaced by _create_tunnel_sync()
    
    # REMOVED: _establish_tunnel_async() - replaced by synchronous version
    
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
    
    async def _get_tunnel_info(self, tunnel_id: int, db: Session) -> Optional[SSHTunnelInfo]:
        """Get tunnel info by ID."""
        tunnel = db.query(SSHTunnel).filter(SSHTunnel.id == tunnel_id).first()
        if not tunnel:
            cluster_logger.error(f"Tunnel {tunnel_id} not found in database")
            return None
        
        return self._tunnel_to_info(tunnel)
    
    # REMOVED: Background task functions (_ensure_background_tasks, _periodic_cleanup_task, _cleanup_inactive_tunnels)
    # These were used only by the old asynchronous tunnel creation
    
    async def _create_tunnel_record_atomic(
        self,
        job_id: int,
        port_allocation: 'PortAllocation',
        db: Session
    ) -> Optional[int]:
        """Create tunnel record atomically in database."""
        try:
            # Use explicit transaction
            from app.db.models import SSHTunnel, Job
            from .enums import TunnelStatus
            
            # Get job info for tunnel fields
            job = db.query(Job).filter(Job.id == job_id).first()
            if not job:
                cluster_logger.error(f"Job {job_id} not found for tunnel creation")
                return None
            
            new_tunnel = SSHTunnel(
                job_id=job_id,
                local_port=port_allocation.internal_port,
                external_port=port_allocation.external_port,
                internal_port=port_allocation.internal_port,
                remote_port=job.port,  # Port from job
                remote_host=settings.SLURM_HOST,  # SSH host
                node=job.node,  # Node from job
                status=TunnelStatus.CONNECTING.value,
                ssh_pid=None,  # Will be updated when process starts
                socat_pid=None,
                created_at=datetime.utcnow()
            )
            
            db.add(new_tunnel)
            db.flush()  # Get ID without committing
            tunnel_id = new_tunnel.id
            db.commit()
            
            cluster_logger.info(f"Created tunnel record {tunnel_id} for job {job_id}")
            return tunnel_id
            
        except Exception as e:
            db.rollback()
            cluster_logger.error(f"Failed to create tunnel record: {e}")
            return None
    
    async def _cleanup_failed_tunnel(
        self,
        tunnel_id: Optional[int],
        port_allocation: Optional['PortAllocation'],
        job_id: int
    ) -> None:
        """Cleanup resources after failed tunnel creation."""
        cluster_logger.info(f"Cleaning up failed tunnel creation for job {job_id}")
        
        # Cleanup database record
        if tunnel_id:
            try:
                from app.db.session import SessionLocal
                with SessionLocal() as cleanup_db:
                    tunnel = cleanup_db.query(SSHTunnel).filter(
                        SSHTunnel.id == tunnel_id
                    ).first()
                    if tunnel:
                        await self._cleanup_tunnel(tunnel, cleanup_db)
                        cluster_logger.info(f"Cleaned up tunnel record {tunnel_id}")
            except Exception as e:
                cluster_logger.error(f"Failed to cleanup tunnel record: {e}")
        
        # Cleanup port allocation
        if port_allocation:
            try:
                await self._release_ports(port_allocation)
                cluster_logger.info(f"Deallocated port {port_allocation.internal_port}")
            except Exception as e:
                cluster_logger.error(f"Failed to deallocate port: {e}")
    
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
    
    async def startup_cleanup_all_tunnels(self, db: Session) -> int:
        """
        Clean up all tunnels at startup.

        After backend restart, all SSH processes are dead, so we mark all
        tunnels as FAILED and clean up their resources.
        """
        cluster_logger.info(
            "🧹 STARTUP: Cleaning up all tunnels after backend restart"
        )

        try:
            # Get all tunnels that are not already FAILED or DEAD
            active_tunnels = db.query(SSHTunnel).filter(
                SSHTunnel.status.in_([
                    TunnelStatus.ACTIVE.value,
                    TunnelStatus.CONNECTING.value
                ])
            ).all()

            cleanup_count = 0
            for tunnel in active_tunnels:
                cluster_logger.info(
                    f"🧹 STARTUP: Cleaning up tunnel {tunnel.id} "
                    f"(job {tunnel.job_id}, status {tunnel.status})"
                )

                # Mark as FAILED since processes are dead
                db.query(SSHTunnel).filter(SSHTunnel.id == tunnel.id).update({
                    "status": TunnelStatus.FAILED.value,
                    "updated_at": datetime.utcnow()
                })

                # Clean up processes (best effort, they should be dead anyway)
                try:
                    ssh_pid = getattr(tunnel, 'ssh_pid', None)
                    socat_pid = getattr(tunnel, 'socat_pid', None)

                    if ssh_pid:
                        await self.process_manager.terminate_process(ssh_pid)
                    if socat_pid:
                        await self.process_manager.terminate_process(socat_pid)

                    # Note: ProcessManager doesn't have free_port method
                    # Ports will be reallocated dynamically when needed
                except Exception as e:
                    cluster_logger.debug(
                        f"Process cleanup error for tunnel {tunnel.id}: {e}"
                    )

                cleanup_count += 1

            # Commit all changes
            db.commit()

            cluster_logger.info(
                f"✅ STARTUP: Cleaned up {cleanup_count} tunnels"
            )
            return cleanup_count

        except Exception as e:
            cluster_logger.error(
                f"❌ STARTUP: Error during tunnel cleanup: {e}"
            )
            db.rollback()
            return 0
    
    def get_job_tunnels(
        self, job_id: int, db: Session = Depends(get_db)
    ) -> List[SSHTunnelInfo]:
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
