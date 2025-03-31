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
from datetime import datetime
import socket
import time

class SSHTunnelService:
    MIN_PORT = 8600
    MAX_PORT = 8700
    
    def __init__(self, db: Session):
        self.db = db

    def find_free_local_port(self) -> int:
        """Find a free port on the local machine between MIN_PORT and MAX_PORT"""
        # Zbierz wszystkie używane porty (zarówno external_port jak i internal_port)
        used_ports = set()
        for tunnel in self.db.query(SSHTunnel).all():
            if hasattr(tunnel, 'external_port') and tunnel.external_port:
                used_ports.add(tunnel.external_port)
            if hasattr(tunnel, 'internal_port') and tunnel.internal_port:
                used_ports.add(tunnel.internal_port)
                
        while True:
            port = random.randint(self.MIN_PORT, self.MAX_PORT)
            if port not in used_ports and not self._is_port_in_use(port):
                return port

    def create_tunnel(self, job: Job) -> Optional[SSHTunnelInfo]:
        """Create an SSH tunnel for a job"""
        if not job.port or not job.node:
            return None

        # Najpierw znajdźmy port dla tunelu SSH wewnątrz kontenera
        internal_port = self.find_free_local_port()
        if not internal_port:
            return None

        # Znajdź drugi wolny port do przekierowania za pomocą socat - będzie dostępny z zewnątrz
        external_port = self.find_free_local_port()
        if not external_port:
            return None
        
        # Ustanów tunel SSH do hosta SLURM
        success = self._establish_ssh_tunnel(
            local_port=internal_port,
            remote_port=job.port,
            remote_host=settings.SLURM_HOST,
            node=job.node
        )
        if not success:
            return None
        
        # Uruchom socat do przekierowania portu z 0.0.0.0:external_port na 127.0.0.1:internal_port
        socat_success = self._start_socat_forwarder(
            external_port=external_port,
            internal_port=internal_port
        )
                
        if not socat_success:
            # Jeśli socat się nie powiódł, zamknij tunel SSH
            self._kill_ssh_tunnel(internal_port)
            return None
        
        # Create timestamp for the tunnel
        now = datetime.utcnow()

        tunnel = SSHTunnel(
            job_id=job.id,
            external_port=external_port,  # Port dla socata (dostępny z zewnątrz)
            internal_port=internal_port,  # Wewnętrzny port SSH (tylko localhost)
            remote_port=job.port,
            remote_host=job.node,
            node=job.node,
            status="ACTIVE",
            created_at=now
        )
        
        self.db.add(tunnel)
        self.db.commit()
        self.db.refresh(tunnel)

        return SSHTunnelInfo(
            id=tunnel.id,
            job_id=tunnel.job_id,
            local_port=external_port, # Używamy external_port jako local_port w zwracanym obiekcie
            remote_port=tunnel.remote_port,
            remote_host=tunnel.remote_host,
            node=tunnel.node,
            status=tunnel.status,
            created_at=tunnel.created_at
        )

    def close_tunnel(self, tunnel_id: int) -> bool:
        """Close an SSH tunnel"""
        tunnel = self.db.query(SSHTunnel).filter(SSHTunnel.id == tunnel_id).first()
        if not tunnel:
            return False

        # Zamknij proces socat
        self._kill_socat_forwarder(tunnel.external_port)
        
        # Zamknij proces SSH
        self._kill_ssh_tunnel(tunnel.internal_port)
        

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
            local_port=tunnel.external_port,  # Używamy external_port jako local_port
            remote_port=tunnel.remote_port,
            remote_host=tunnel.remote_host,
            node=tunnel.node,
            status=tunnel.status,
            created_at=tunnel.created_at
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

    def _is_port_in_use(self, port: int, check_external: bool = False) -> bool:
        
        """
        Check if a port is in use with proper timeout and error handling.
        
        Args:
            port: Port number to check
            
        Returns:
            bool: True if port is in use, False otherwise
        """
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.settimeout(0.5)
                address = '0.0.0.0' if check_external else '127.0.0.1'
                result = s.connect_ex((address, port))
                return result == 0
        except (socket.timeout, socket.error):
            return True

    def _establish_ssh_tunnel(self, local_port: int, remote_port: int, remote_host: str, node: str) -> bool:
        """Establish SSH tunnel to the remote host."""
        try:
            cmd = [
                'ssh',
                '-N',  # Don't execute remote command
                '-f',  # Go to background
                '-L', f'{local_port}:{node}:{remote_port}',  # Connect to specific node instead of localhost
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
        import asyncio
        
        url = f"http://localhost:{local_port}"
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(url, timeout=timeout) as response:
                    # Any response (even error) means the tunnel is working
                    # as long as we got something back
                    return True
        except (aiohttp.ClientError, asyncio.TimeoutError):
            return False
            
    def _cleanup_dead_tunnel(self, tunnel_id: int):
        """Remove a dead tunnel from database and kill its process"""
        tunnel = self.db.query(SSHTunnel).filter(SSHTunnel.id == tunnel_id).first()
        if tunnel:
            # Zabij procesy tunelu SSH i socat używając właściwych portów
            if hasattr(tunnel, 'internal_port') and tunnel.internal_port:
                self._kill_ssh_tunnel(tunnel.internal_port)
            if hasattr(tunnel, 'external_port') and tunnel.external_port:
                self._kill_socat_forwarder(tunnel.external_port)
                
            tunnel.status = "DEAD"
            self.db.commit()

    async def get_or_create_tunnel(self, job: Job) -> Optional[SSHTunnelInfo]:
        """Get existing tunnel or create new one if none exists"""
        if not job.port or not job.node:
            return None
            
        # Check for existing active tunnel
        existing_tunnel = (
            self.db.query(SSHTunnel)
            .filter(
                SSHTunnel.job_id == job.id,
                SSHTunnel.status == "ACTIVE"
            )
            .first()
        )
        
        if existing_tunnel:
            # Test if existing tunnel works
            is_working = False
            if hasattr(existing_tunnel, 'external_port') and existing_tunnel.external_port:
                is_working = await self.test_tunnel(existing_tunnel.external_port, existing_tunnel.node)
            
            if is_working:
                return SSHTunnelInfo(
                    id=existing_tunnel.id,
                    job_id=existing_tunnel.job_id,
                    local_port=existing_tunnel.external_port,  # Używamy external_port jako local_port
                    remote_port=existing_tunnel.remote_port,
                    remote_host=existing_tunnel.remote_host,
                    node=existing_tunnel.node,
                    status=existing_tunnel.status,
                    created_at=existing_tunnel.created_at
                )
            else:
                # Clean up dead tunnel
                self._cleanup_dead_tunnel(existing_tunnel.id)
        
        # Jeśli nie ma aktywnego tunelu lub istniejący nie działa, utwórz nowy
        return self.create_tunnel(job)

    def _start_socat_forwarder(self, external_port: int, internal_port: int) -> bool:
        """Start socat process to forward external port to internal localhost port."""
        try:
            # Użyj socat do przekierowania portu z 0.0.0.0:external_port na 127.0.0.1:internal_port
            # Jawnie określamy nasłuchiwanie na 0.0.0.0 aby być dostępnym z innych kontenerów
            cmd = [
                'socat',
                f'TCP-LISTEN:{external_port},reuseaddr,fork',
                f'TCP:127.0.0.1:{internal_port}'
            ]
            cluster_logger.info(f"Starting socat forwarder: {' '.join(cmd)}")
            
            # Uruchom socat w tle
            process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                start_new_session=True  # Utwórz nową sesję, aby proces działał w tle
            )
            
            # Krótkie opóźnienie, aby upewnić się, że socat został uruchomiony
            time.sleep(1)
            
            # Sprawdź, czy proces działa
            if process.poll() is not None:
                # Proces zakończył się - błąd
                stdout, stderr = process.communicate()
                cluster_logger.error(f"Socat forwarder failed: {stderr.decode('utf-8')}")
                return False
                
            return True
        except Exception as e:
            cluster_logger.error(f"Error starting socat forwarder: {str(e)}")
            return False     
        
    def _kill_socat_forwarder(self, port: int):
        """Kill socat process forwarding the specified port."""
        try:
            # Znajdź proces socat używający tego portu i zakończ go
            cmd = f"lsof -ti:{port} | grep socat | xargs kill -9 2>/dev/null || true"
            cluster_logger.info(f"Killing socat forwarder: {cmd}")
        except Exception as e:
            cluster_logger.error(f"Error while killing socat forwarder: {e}")