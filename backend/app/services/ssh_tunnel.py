import asyncio
import random
import subprocess
import os
from typing import Optional, List
from sqlalchemy.orm import Session
from app.db.models import SSHTunnel, Job
from app.core.logging import cluster_logger
from app.core.config import settings
from app.schemas.job import SSHTunnelInfo

class SSHTunnelService:
    MIN_PORT = 8600
    MAX_PORT = 8700
    
    def __init__(self, db: Session):
        self.db = db

    def find_free_local_port(self) -> int:
        """Find a free port on the local machine between MIN_PORT and MAX_PORT"""
        used_ports = set(tunnel.local_port for tunnel in self.db.query(SSHTunnel).all())
        while True:
            port = random.randint(self.MIN_PORT, self.MAX_PORT)
            if port not in used_ports and not self._is_port_in_use(port):
                return port

    def create_tunnel(self, job: Job) -> Optional[SSHTunnelInfo]:
        """Create an SSH tunnel for a job"""
        if not job.port or not job.node:
            return None

        local_port = self.find_free_local_port()
        if not local_port:
            return None

        success = self._establish_ssh_tunnel(
            local_port=local_port,
            remote_port=job.port,
            remote_host=settings.SLURM_HOST,
            node=job.node
        )
        
        if not success:
            return None

        tunnel = SSHTunnel(
            job_id=job.id,
            local_port=local_port,
            remote_port=job.port,
            node=job.node,
            status="ACTIVE"
        )
        self.db.add(tunnel)
        self.db.commit()
        self.db.refresh(tunnel)

        return SSHTunnelInfo(
            id=tunnel.id,
            job_id=tunnel.job_id,
            local_port=local_port,
            remote_port=tunnel.remote_port,
            status=tunnel.status
        )

    def close_tunnel(self, tunnel_id: int) -> bool:
        """Close an SSH tunnel"""
        tunnel = self.db.query(SSHTunnel).filter(SSHTunnel.id == tunnel_id).first()
        if not tunnel:
            return False

        self._kill_ssh_tunnel(tunnel.local_port)

        tunnel.status = "closed"
        self.db.commit()
        return True

    def close_job_tunnels(self, job_id: int) -> bool:
        """Close all tunnels for a specific job"""
        tunnels = self.db.query(SSHTunnel).filter(SSHTunnel.job_id == job_id).all()
        success = True
        for tunnel in tunnels:
            if not self.close_tunnel(tunnel.id):
                success = False
        return success

    @staticmethod
    def get_active_tunnels(db: Session) -> List[SSHTunnel]:
        """Get all active SSH tunnels."""
        return db.query(SSHTunnel).filter(SSHTunnel.status == "ACTIVE").all()
        
    def get_job_tunnels(self, db: Session, job_id: int) -> List[SSHTunnelInfo]:
        """Get all tunnels for a specific job."""
        tunnels = db.query(SSHTunnel).filter(SSHTunnel.job_id == job_id).all()
        return [SSHTunnelInfo(
            id=tunnel.id,
            job_id=tunnel.job_id,
            local_port=tunnel.local_port,
            remote_port=tunnel.remote_port,
            status=tunnel.status
        ) for tunnel in tunnels]

    def _find_available_port(self, start_port: int = 10000) -> Optional[int]:
        """Find an available local port starting from start_port."""
        port = start_port
        max_attempts = 100

        while port < start_port + max_attempts:
            if not self._is_port_in_use(port):
                return port
            port += 1
        return None

    def _is_port_in_use(self, port: int) -> bool:
        """Check if a port is in use."""
        import socket
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            return s.connect_ex(('localhost', port)) == 0

    def _establish_ssh_tunnel(self, local_port: int, remote_port: int, remote_host: str, node: str) -> bool:
        """Establish SSH tunnel to the remote host."""
        try:
            cmd = [
                'ssh',
                '-N',  # Don't execute remote command
                '-f',  # Go to background
                '-L', f'{local_port}:localhost:{remote_port}',
                f'{settings.SLURM_USER}@{remote_host}'
            ]
            subprocess.run(cmd, check=True)
            return True
        except subprocess.CalledProcessError:
            return False

    def _kill_ssh_tunnel(self, local_port: int):
        """Kill SSH tunnel process using the local port."""
        try:
            cmd = f"lsof -ti:{local_port} | xargs kill -9"
            subprocess.run(cmd, shell=True, check=True)
        except subprocess.CalledProcessError:
            pass  # Process might already be dead