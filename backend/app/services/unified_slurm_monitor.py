"""
Unified SLURM Monitor Service
Centralized service for all SLURM communication, job monitoring,
and synchronization. Replaces SlurmMonitorService, SlurmSyncService,
and individual job monitors.
"""

import asyncio
import socket
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, List, Set
from dataclasses import dataclass
from enum import Enum
from contextlib import asynccontextmanager

from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy import create_engine, func

from app.core.config import settings
from app.core.logging import cluster_logger
from app.db.models import Job, TaskQueueJob, User, SSHTunnel, ClusterStatus
from app.services.slurm import SlurmSSHService
# Remove old SSH tunnel service import


class MonitorState(str, Enum):
    """Monitor service states"""
    STOPPED = "stopped"
    STARTING = "starting"
    RUNNING = "running"
    STOPPING = "stopping"
    ERROR = "error"


@dataclass
class PortAllocation:
    """Port allocation information"""
    port: int
    allocated_to: str  # 'job', 'tunnel_external', 'tunnel_internal'
    resource_id: int
    allocated_at: datetime


@dataclass
class MonitorMetrics:
    """Monitoring metrics"""
    total_jobs_monitored: int
    total_tasks_monitored: int
    active_tunnels: int
    last_slurm_sync: Optional[datetime]
    sync_errors: int
    port_allocations: int


class UnifiedSlurmMonitor:
    """
    Unified SLURM monitoring service that handles:
    - Job status synchronization
    - Task queue monitoring
    - Port allocation management
    - SSH tunnel coordination
    - Centralized SLURM communication
    """
    
    # Port allocation ranges
    JOB_PORT_MIN = 8600
    JOB_PORT_MAX = 8700
    TUNNEL_PORT_MIN = 9000
    TUNNEL_PORT_MAX = 9500
    
    # Monitoring intervals
    SYNC_INTERVAL = 60  # Main sync every 60 seconds
    HEALTH_CHECK_INTERVAL = 300  # Health checks every 5 minutes
    
    def __init__(self, db_session_factory: sessionmaker = None):
        """Initialize the unified monitor"""
        self.slurm_service = SlurmSSHService()
        
        if db_session_factory:
            self.SessionLocal = db_session_factory
        else:
            engine = create_engine(settings.DATABASE_URL)
            self.SessionLocal = sessionmaker(
                autocommit=False, autoflush=False, bind=engine
            )
        
        # Service state
        self._state = MonitorState.STOPPED
        self._monitor_task: Optional[asyncio.Task] = None
        self._health_task: Optional[asyncio.Task] = None
        self._shutdown_event = asyncio.Event()
        
        # Port allocation tracking
        self._allocated_ports: Dict[int, PortAllocation] = {}
        self._port_lock = asyncio.Lock()
        
        # Metrics tracking
        self._metrics = MonitorMetrics(
            total_jobs_monitored=0,
            total_tasks_monitored=0,
            active_tunnels=0,
            last_slurm_sync=None,
            sync_errors=0,
            port_allocations=0
        )
        
        # Circuit breaker for SLURM failures
        self._slurm_failures = 0
        self._max_slurm_failures = 5
        self._slurm_backoff_until: Optional[datetime] = None
        
        cluster_logger.info("Unified SLURM Monitor initialized")
    
    @property
    def state(self) -> MonitorState:
        """Get current monitor state"""
        return self._state
    
    @property
    def metrics(self) -> MonitorMetrics:
        """Get current monitoring metrics"""
        return self._metrics
    
    async def start(self) -> bool:
        """Start the monitoring service"""
        if self._state != MonitorState.STOPPED:
            cluster_logger.warning(f"Monitor already running in state: {self._state}")
            return False
        
        try:
            self._state = MonitorState.STARTING
            cluster_logger.info("Starting Unified SLURM Monitor")
            
            # Initialize port allocations from database
            await self._initialize_port_allocations()
            
            # Start main monitoring task
            self._monitor_task = asyncio.create_task(self._monitor_loop())
            self._health_task = asyncio.create_task(self._health_check_loop())
            
            self._state = MonitorState.RUNNING
            cluster_logger.info("Unified SLURM Monitor started successfully")
            return True
            
        except Exception as e:
            self._state = MonitorState.ERROR
            cluster_logger.error(f"Failed to start monitor: {e}")
            return False
    
    async def stop(self) -> bool:
        """Stop the monitoring service"""
        if self._state == MonitorState.STOPPED:
            return True
        
        try:
            self._state = MonitorState.STOPPING
            cluster_logger.info("Stopping Unified SLURM Monitor")
            
            # Signal shutdown
            self._shutdown_event.set()
            
            # Cancel tasks
            if self._monitor_task:
                self._monitor_task.cancel()
                try:
                    await self._monitor_task
                except asyncio.CancelledError:
                    pass
            
            if self._health_task:
                self._health_task.cancel()
                try:
                    await self._health_task
                except asyncio.CancelledError:
                    pass
            
            self._state = MonitorState.STOPPED
            cluster_logger.info("Unified SLURM Monitor stopped")
            return True
            
        except Exception as e:
            cluster_logger.error(f"Error stopping monitor: {e}")
            return False
    
    async def _monitor_loop(self):
        """Main monitoring loop"""
        while not self._shutdown_event.is_set():
            try:
                # Check circuit breaker
                if self._is_slurm_circuit_open():
                    cluster_logger.warning("SLURM circuit breaker open, skipping sync")
                    await asyncio.sleep(self.SYNC_INTERVAL)
                    continue
                
                # Perform main synchronization
                await self._sync_all_jobs()
                
                # Reset failure counter on success
                self._slurm_failures = 0
                self._slurm_backoff_until = None
                self._metrics.last_slurm_sync = datetime.now(timezone.utc)
                
            except Exception as e:
                self._handle_slurm_error(e)
            
            # Wait for next sync or shutdown
            try:
                await asyncio.wait_for(
                    self._shutdown_event.wait(), 
                    timeout=self.SYNC_INTERVAL
                )
                break  # Shutdown requested
            except asyncio.TimeoutError:
                continue  # Continue monitoring
    
    async def _health_check_loop(self):
        """Health check loop for tunnels and system status"""
        while not self._shutdown_event.is_set():
            try:
                await self._perform_health_checks()
            except Exception as e:
                cluster_logger.error(f"Health check error: {e}")
            
            try:
                await asyncio.wait_for(
                    self._shutdown_event.wait(),
                    timeout=self.HEALTH_CHECK_INTERVAL
                )
                break
            except asyncio.TimeoutError:
                continue
    
    async def _sync_all_jobs(self):
        """Synchronize all jobs and tasks with SLURM"""
        async with self._get_db_session() as db:
            try:
                # Get all active jobs from SLURM
                slurm_jobs = await self.slurm_service.get_active_jobs()
                slurm_job_ids = {job["job_id"] for job in slurm_jobs}
                
                # Update container jobs
                await self._sync_container_jobs(db, slurm_jobs)
                
                # Update task queue jobs
                await self._sync_task_queue_jobs(db, slurm_jobs)
                
                # Mark inactive jobs as completed
                await self._mark_inactive_jobs_completed(db, slurm_job_ids)
                
                # Update metrics
                self._metrics.total_jobs_monitored = len(slurm_jobs)
                
                cluster_logger.debug(f"Synchronized {len(slurm_jobs)} jobs with SLURM")
                
            except Exception as e:
                cluster_logger.error(f"Sync error: {e}")
                raise
    
    async def _sync_container_jobs(self, db: Session, slurm_jobs: List[Dict]):
        """Sync container jobs (Job table)"""
        # Get container jobs from SLURM (pattern: container_*)
        container_jobs = [job for job in slurm_jobs 
                         if job.get("name", "").startswith("container_")]
        
        for slurm_job in container_jobs:
            job_id = slurm_job["job_id"]
            db_job = db.query(Job).filter(Job.job_id == job_id).first()
            
            if db_job:
                # Update existing job
                await self._update_container_job(db, db_job, slurm_job)
            else:
                # Create new job (SLURM job not in our DB)
                await self._create_container_job_from_slurm(db, slurm_job)
    
    async def _sync_task_queue_jobs(self, db: Session, slurm_jobs: List[Dict]):
        """Sync task queue jobs (TaskQueueJob table)"""
        # Get task queue jobs from SLURM (pattern: amumax_*, amp_*, etc.)
        task_jobs = [job for job in slurm_jobs 
                    if any(job.get("name", "").startswith(prefix) 
                          for prefix in ["amumax_", "amp_", "python_", "simulation_", "task_"])]
        
        for slurm_job in task_jobs:
            job_id = slurm_job["job_id"]
            db_task = db.query(TaskQueueJob).filter(TaskQueueJob.slurm_job_id == job_id).first()
            
            if db_task:
                # Update existing task
                await self._update_task_queue_job(db, db_task, slurm_job)
            else:
                # Create new task (SLURM job not in our DB)
                await self._create_task_queue_job_from_slurm(db, slurm_job)
    
    async def _update_container_job(self, db: Session, job: Job, slurm_data: Dict):
        """Update container job from SLURM data"""
        old_status = job.status
        new_status = self._map_slurm_status(slurm_data["state"])
        
        # Update status and node
        if old_status != new_status:
            job.status = new_status
            job.updated_at = datetime.now(timezone.utc)
            
            # Handle status transitions
            if old_status == "PENDING" and new_status == "RUNNING":
                job.node = slurm_data.get("node") if slurm_data.get("node") != "(None)" else None
                
                # Create SSH tunnel for running job
                if job.node and job.port:
                    await self._create_tunnel_for_job(db, job)
            
            cluster_logger.info(f"Job {job.job_id}: {old_status} → {new_status}")
        
        # Update node if changed
        node = slurm_data.get("node") if slurm_data.get("node") != "(None)" else None
        if node and job.node != node:
            job.node = node
        
        db.add(job)
    
    async def _update_task_queue_job(self, db: Session, task: TaskQueueJob, slurm_data: Dict):
        """Update task queue job from SLURM data"""
        old_status = task.status
        new_status = self._map_slurm_status(slurm_data["state"])
        
        if old_status != new_status:
            task.status = new_status
            task.updated_at = datetime.now(timezone.utc)
            
            # Handle status transitions
            if new_status == "RUNNING" and not task.started_at:
                task.started_at = datetime.now(timezone.utc)
            elif new_status in ["COMPLETED", "ERROR", "CANCELLED"] and not task.finished_at:
                task.finished_at = datetime.now(timezone.utc)
            
            cluster_logger.info(f"Task {task.slurm_job_id}: {old_status} → {new_status}")
        
        # Update node
        node = slurm_data.get("node") if slurm_data.get("node") != "(None)" else None
        if node:
            task.node = node
        
        db.add(task)
    
    async def _create_container_job_from_slurm(self, db: Session, slurm_data: Dict):
        """Create container job from SLURM data (orphaned job)"""
        job_name = slurm_data.get("name", "")
        
        # Try to extract username from job name
        username = self._extract_username_from_job_name(job_name)
        user = db.query(User).filter(User.username == username).first()
        
        if not user:
            cluster_logger.warning(f"Cannot create job {slurm_data['job_id']}: user {username} not found")
            return
        
        # Allocate port for the job
        port = await self.allocate_port_for_job(slurm_data["job_id"])
        
        job = Job(
            job_id=slurm_data["job_id"],
            job_name=job_name,
            status=self._map_slurm_status(slurm_data["state"]),
            node=slurm_data.get("node") if slurm_data.get("node") != "(None)" else None,
            owner_id=user.id,
            port=port,
            template_name="slurm_imported",
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc)
        )
        
        db.add(job)
        cluster_logger.info(f"Created job {job.job_id} from SLURM data")
    
    async def _create_task_queue_job_from_slurm(self, db: Session, slurm_data: Dict):
        """Create task queue job from SLURM data (orphaned task)"""
        job_name = slurm_data.get("name", "")
        username = self._extract_username_from_job_name(job_name)
        user = db.query(User).filter(User.username == username).first()
        
        if not user:
            cluster_logger.warning(f"Cannot create task {slurm_data['job_id']}: user {username} not found")
            return
        
        task = TaskQueueJob(
            task_id=f"slurm_import_{slurm_data['job_id']}",
            slurm_job_id=slurm_data["job_id"],
            name=job_name,
            status=self._map_slurm_status(slurm_data["state"]),
            node=slurm_data.get("node") if slurm_data.get("node") != "(None)" else None,
            owner_id=user.id,
            simulation_file="/tmp/imported.mx3",
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc)
        )
        
        db.add(task)
        cluster_logger.info(f"Created task {task.slurm_job_id} from SLURM data")
    
    async def _mark_inactive_jobs_completed(self, db: Session, active_slurm_ids: Set[str]):
        """Mark jobs/tasks as completed if they're no longer in SLURM"""
        # Mark inactive container jobs
        inactive_jobs = (
            db.query(Job)
            .filter(
                Job.status.in_(["PENDING", "RUNNING", "CONFIGURING"]),
                Job.job_id.notin_(active_slurm_ids) if active_slurm_ids else True
            )
            .all()
        )
        
        for job in inactive_jobs:
            job.status = "COMPLETED"
            job.updated_at = datetime.now(timezone.utc)
            
            # Close associated tunnels
            await self._close_job_tunnels(db, job.id)
            
            cluster_logger.info(f"Marked job {job.job_id} as completed")
        
        # Mark inactive task queue jobs
        inactive_tasks = (
            db.query(TaskQueueJob)
            .filter(
                TaskQueueJob.status.in_(["PENDING", "RUNNING", "CONFIGURING"]),
                TaskQueueJob.slurm_job_id.notin_(active_slurm_ids) if active_slurm_ids else True
            )
            .all()
        )
        
        for task in inactive_tasks:
            task.status = "COMPLETED"
            task.updated_at = datetime.now(timezone.utc)
            if not task.finished_at:
                task.finished_at = datetime.now(timezone.utc)
            
            cluster_logger.info(f"Marked task {task.slurm_job_id} as completed")
    
    # Port Allocation Methods
    async def allocate_port_for_job(self, job_id: str) -> Optional[int]:
        """Allocate a port for a container job"""
        async with self._port_lock:
            port = await self._find_free_port_in_range(
                self.JOB_PORT_MIN, 
                self.JOB_PORT_MAX,
                "job"
            )
            
            if port:
                allocation = PortAllocation(
                    port=port,
                    allocated_to="job",
                    resource_id=int(job_id) if job_id.isdigit() else hash(job_id) % 1000000,
                    allocated_at=datetime.now(timezone.utc)
                )
                self._allocated_ports[port] = allocation
                self._metrics.port_allocations += 1
                
                cluster_logger.debug(f"Allocated port {port} for job {job_id}")
            
            return port
    
    async def allocate_port_for_tunnel(self, tunnel_type: str, tunnel_id: int) -> Optional[int]:
        """Allocate a port for SSH tunnel (external or internal)"""
        async with self._port_lock:
            port = await self._find_free_port_in_range(
                self.TUNNEL_PORT_MIN,
                self.TUNNEL_PORT_MAX,
                f"tunnel_{tunnel_type}"
            )
            
            if port:
                allocation = PortAllocation(
                    port=port,
                    allocated_to=f"tunnel_{tunnel_type}",
                    resource_id=tunnel_id,
                    allocated_at=datetime.now(timezone.utc)
                )
                self._allocated_ports[port] = allocation
                self._metrics.port_allocations += 1
                
                cluster_logger.debug(f"Allocated port {port} for tunnel {tunnel_id} ({tunnel_type})")
            
            return port
    
    async def deallocate_port(self, port: int):
        """Deallocate a port"""
        async with self._port_lock:
            if port in self._allocated_ports:
                allocation = self._allocated_ports.pop(port)
                cluster_logger.debug(f"Deallocated port {port} from {allocation.allocated_to}")
    
    async def _find_free_port_in_range(self, min_port: int, max_port: int, port_type: str) -> Optional[int]:
        """Find a free port in the specified range"""
        # Check database for used ports
        used_ports = set()
        
        async with self._get_db_session() as db:
            # Get ports from jobs
            job_ports = db.query(Job.port).filter(
                Job.port.isnot(None),
                Job.status.in_(["PENDING", "RUNNING", "CONFIGURING"]),
                Job.port >= min_port,
                Job.port <= max_port
            ).all()
            used_ports.update(port[0] for port in job_ports)
            
            # Get ports from tunnels
            tunnel_ports = db.query(SSHTunnel.external_port, SSHTunnel.internal_port).filter(
                SSHTunnel.status == "ACTIVE"
            ).all()
            
            for ext_port, int_port in tunnel_ports:
                if ext_port and min_port <= ext_port <= max_port:
                    used_ports.add(ext_port)
                if int_port and min_port <= int_port <= max_port:
                    used_ports.add(int_port)
        
        # Add currently allocated ports
        used_ports.update(self._allocated_ports.keys())
        
        # Find free port
        import random
        available_ports = [p for p in range(min_port, max_port + 1) if p not in used_ports]
        
        if not available_ports:
            cluster_logger.error(f"No free ports in range {min_port}-{max_port} for {port_type}")
            return None
        
        # Test ports for actual availability
        for _ in range(min(10, len(available_ports))):  # Try up to 10 random ports
            port = random.choice(available_ports)
            if await self._is_port_actually_free(port):
                return port
            available_ports.remove(port)
        
        cluster_logger.error(f"Could not find actually free port in range {min_port}-{max_port}")
        return None
    
    async def _is_port_actually_free(self, port: int) -> bool:
        """Check if port is actually free in the system"""
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(1)
            result = sock.connect_ex(('127.0.0.1', port))
            sock.close()
            return result != 0  # Port is free if connection fails
        except Exception:
            return False
    
    async def _initialize_port_allocations(self):
        """Initialize port allocations from database"""
        async with self._get_db_session() as db:
            # Load job ports
            jobs = db.query(Job).filter(
                Job.port.isnot(None),
                Job.status.in_(["PENDING", "RUNNING", "CONFIGURING"])
            ).all()
            
            for job in jobs:
                allocation = PortAllocation(
                    port=job.port,
                    allocated_to="job",
                    resource_id=job.id,
                    allocated_at=job.created_at or datetime.now(timezone.utc)
                )
                self._allocated_ports[job.port] = allocation
            
            # Load tunnel ports
            tunnels = db.query(SSHTunnel).filter(SSHTunnel.status == "ACTIVE").all()
            
            for tunnel in tunnels:
                if tunnel.external_port:
                    allocation = PortAllocation(
                        port=tunnel.external_port,
                        allocated_to="tunnel_external",
                        resource_id=tunnel.id,
                        allocated_at=tunnel.created_at or datetime.now(timezone.utc)
                    )
                    self._allocated_ports[tunnel.external_port] = allocation
                
                if tunnel.internal_port:
                    allocation = PortAllocation(
                        port=tunnel.internal_port,
                        allocated_to="tunnel_internal",
                        resource_id=tunnel.id,
                        allocated_at=tunnel.created_at or datetime.now(timezone.utc)
                    )
                    self._allocated_ports[tunnel.internal_port] = allocation
            
            self._metrics.port_allocations = len(self._allocated_ports)
            cluster_logger.info(f"Initialized {len(self._allocated_ports)} port allocations")
    
    # Helper methods
    async def _create_tunnel_for_job(self, db: Session, job: Job):
        """Create SSH tunnel for a running job"""
        try:
            from app.dependencies.tunnel_service import get_tunnel_service
            tunnel_service = get_tunnel_service()
            tunnel = await tunnel_service.get_or_create_tunnel(job.id, db)  # type: ignore
            
            if tunnel:
                self._metrics.active_tunnels += 1
                cluster_logger.info(f"Created tunnel for job {job.job_id}")
            else:
                cluster_logger.warning(f"Failed to create tunnel for job {job.job_id}")
        except Exception as e:
            cluster_logger.error(f"Error creating tunnel for job {job.job_id}: {e}")
    
    async def _close_job_tunnels(self, db: Session, job_id: int):
        """Close SSH tunnels for a job"""
        try:
            from app.dependencies.tunnel_service import get_tunnel_service
            tunnel_service = get_tunnel_service()
            await tunnel_service.close_job_tunnels(job_id, db)
            self._metrics.active_tunnels = max(0, self._metrics.active_tunnels - 1)
        except Exception as e:
            cluster_logger.error(f"Error closing tunnels for job {job_id}: {e}")
    
    async def _perform_health_checks(self):
        """Perform health checks on tunnels and system"""
        async with self._get_db_session() as db:
            # Count active tunnels
            active_tunnels = db.query(func.count(SSHTunnel.id)).filter(
                SSHTunnel.status == "ACTIVE"
            ).scalar()
            
            self._metrics.active_tunnels = active_tunnels or 0
            
            # Additional health checks can be added here
            cluster_logger.debug(f"Health check: {active_tunnels} active tunnels")
    
    def _map_slurm_status(self, slurm_state: str) -> str:
        """Map SLURM state to our internal status"""
        from app.services.task_queue import TaskQueueService
        
        mapped_enum = TaskQueueService.SLURM_STATE_MAPPING.get(slurm_state, "UNKNOWN")
        if hasattr(mapped_enum, 'value'):
            return mapped_enum.value
        return str(mapped_enum)
    
    def _extract_username_from_job_name(self, job_name: str) -> str:
        """Extract username from job name"""
        if job_name.startswith("container_"):
            parts = job_name.split("_")
            if len(parts) > 1:
                return parts[1]
        
        # Default to admin if can't extract
        return "admin"
    
    def _handle_slurm_error(self, error: Exception):
        """Handle SLURM communication errors with circuit breaker"""
        self._slurm_failures += 1
        self._metrics.sync_errors += 1
        
        cluster_logger.error(f"SLURM error ({self._slurm_failures}/{self._max_slurm_failures}): {error}")
        
        if self._slurm_failures >= self._max_slurm_failures:
            backoff_minutes = min(30, self._slurm_failures * 2)  # Exponential backoff, max 30 min
            self._slurm_backoff_until = datetime.now(timezone.utc) + timedelta(minutes=backoff_minutes)
            cluster_logger.warning(f"SLURM circuit breaker opened, backing off for {backoff_minutes} minutes")
    
    def _is_slurm_circuit_open(self) -> bool:
        """Check if SLURM circuit breaker is open"""
        if self._slurm_backoff_until:
            if datetime.now(timezone.utc) > self._slurm_backoff_until:
                # Reset circuit breaker
                self._slurm_failures = 0
                self._slurm_backoff_until = None
                cluster_logger.info("SLURM circuit breaker reset")
                return False
            return True
        return False
    
    @asynccontextmanager
    async def _get_db_session(self):
        """Get database session with proper cleanup"""
        db = self.SessionLocal()
        try:
            yield db
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()
    
    async def get_latest_cluster_status(self, db: Session) -> Optional[ClusterStatus]:
        """Get the latest cluster status from database."""
        try:
            return (
                db.query(ClusterStatus)
                .order_by(ClusterStatus.last_check.desc())
                .first()
            )
        except Exception as e:
            cluster_logger.error(f"Error getting latest cluster status: {e}")
            return None

    async def get_user_active_jobs(self, db: Session, username: str):
        """Get active jobs for a specific user"""
        try:
            user = db.query(User).filter(User.username == username).first()
            
            if not user:
                cluster_logger.warning(f"User not found: {username}")
                return []
                
            # Get active jobs for the user
            jobs = (
                db.query(Job)
                .filter(
                    Job.owner_id == user.id,
                    Job.status.in_(["PENDING", "RUNNING", "CONFIGURING"])
                )
                .all()
            )
            
            cluster_logger.debug(
                f"Retrieved {len(jobs)} jobs for user {username}"
            )
            
            return jobs
            
        except Exception as e:
            cluster_logger.error(
                f"Error getting jobs for user {username}: {e}"
            )
            return []


# Global instance
_unified_monitor: Optional[UnifiedSlurmMonitor] = None


def get_unified_monitor() -> UnifiedSlurmMonitor:
    """Get the global unified monitor instance"""
    global _unified_monitor
    if _unified_monitor is None:
        _unified_monitor = UnifiedSlurmMonitor()
    return _unified_monitor


async def start_unified_monitor() -> bool:
    """Start the unified monitor service"""
    monitor = get_unified_monitor()
    return await monitor.start()


async def stop_unified_monitor() -> bool:
    """Stop the unified monitor service"""
    monitor = get_unified_monitor()
    return await monitor.stop()
