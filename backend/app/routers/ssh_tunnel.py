# import asyncio
# import random
# import subprocess
# import os
# from typing import Optional, List
# from sqlalchemy.orm import Session
# from app.db.models import SSHTunnel, Job
# from app.core.logging import cluster_logger
# from app.core.config import settings
# from app.schemas.job import SSHTunnelInfo
# import socket
# import time

# class SSHTunnelService:
#     MIN_PORT = 8600
#     MAX_PORT = 8700

#     def __init__(self, db: Session):
#         self.db = db

#     def find_free_local_port(self) -> int:
#         """Find a free port on the local machine between MIN_PORT and MAX_PORT"""
#         used_ports = set(tunnel.local_port for tunnel in self.db.query(SSHTunnel).all())
#         while True:
#             port = random.randint(self.MIN_PORT, self.MAX_PORT)
#             if port not in used_ports and not self._is_port_in_use(port):
#                 return port

#     def create_tunnel(self, job: Job) -> Optional[SSHTunnelInfo]:
#         """Create an SSH tunnel for a job"""
#         if not job.port or not job.node:
#             return None

#         # Najpierw znajdźmy port dla tunelu SSH wewnątrz kontenera
#         local_port = self.find_free_local_port()
#         if not local_port:
#             return None

#         # Znajdź drugi wolny port do przekierowania za pomocą socat - będzie dostępny z zewnątrz
#         external_port = self.find_free_local_port()
#         if not external_port:
#             return None

#         # Ustanów tunel SSH do hosta SLURM
#         success = self._establish_ssh_tunnel(
#             local_port=local_port,
#             remote_port=job.port,
#             remote_host=settings.SLURM_HOST,
#             node=job.node
#         )

#         if not success:
#             return None

#         # Uruchom socat do przekierowania portu z 0.0.0.0:external_port na 127.0.0.1:local_port
#         socat_success = self._start_socat_forwarder(
#             external_port=external_port,
#             internal_port=local_port
#         )

#         if not socat_success:
#             # Jeśli socat się nie powiódł, zamknij tunel SSH
#             self._kill_ssh_tunnel(local_port)
#             return None

#         # Zapisz informacje o tunelu w bazie danych
#         tunnel = SSHTunnel(
#             job_id=job.id,
#             local_port=external_port,  # Używamy zewnętrznego portu jako głównego portu dla tunelu
#             remote_port=job.port,
#             remote_host=job.node,
#             node=job.node,
#             status="ACTIVE"
#         )
#         self.db.add(tunnel)
#         self.db.commit()
#         self.db.refresh(tunnel)

#         return SSHTunnelInfo(
#             id=tunnel.id,
#             job_id=tunnel.job_id,
#             local_port=external_port,
#             remote_port=tunnel.remote_port,
#             remote_host=tunnel.remote_host,
#             status=tunnel.status,
#             created_at=tunnel.created_at
#         )

#     def close_tunnel(self, tunnel_id: int) -> bool:
#         """Close an SSH tunnel and associated socat forwarder"""
#         tunnel = self.db.query(SSHTunnel).filter(SSHTunnel.id == tunnel_id).first()
#         if not tunnel:
#             return False

#         # Zamknij wszystkie procesy socat korzystające z tego portu
#         self._kill_socat_forwarder(tunnel.local_port)

#         # Zamknij wszystkie procesy ssh używające tego portu (może być kilka)
#         self._kill_ssh_tunnel(tunnel.local_port)

#         # Dodatkowe zabezpieczenie - zabij wszystkie procesy używające tego portu
#         self._kill_port_processes(tunnel.local_port)

#         tunnel.status = "CLOSED"
#         self.db.commit()
#         return True

#     def close_job_tunnels(self, job_id: int) -> bool:
#         """Close all tunnels for a specific job"""
#         tunnels = self.db.query(SSHTunnel).filter(SSHTunnel.job_id == job_id).all()
#         success = True
#         for tunnel in tunnels:
#             if not self.close_tunnel(tunnel.id):
#                 success = False
#         return success

#     @staticmethod
#     def get_active_tunnels(db: Session) -> List[SSHTunnel]:
#         """Get all active SSH tunnels."""
#         return db.query(SSHTunnel).filter(SSHTunnel.status == "ACTIVE").all()

#     def get_job_tunnels(self, db: Session, job_id: int) -> List[SSHTunnelInfo]:
#         """Get all tunnels for a specific job."""
#         tunnels = db.query(SSHTunnel).filter(SSHTunnel.job_id == job_id).all()
#         return [SSHTunnelInfo(
#             id=tunnel.id,
#             job_id=tunnel.job_id,
#             local_port=tunnel.local_port,
#             remote_port=tunnel.remote_port,
#             status=tunnel.status
#         ) for tunnel in tunnels]

#     def _find_available_port(self, start_port: int = 10000) -> Optional[int]:
#         """Find an available local port starting from start_port."""
#         port = start_port
#         max_attempts = 100

#         while port < start_port + max_attempts:
#             if not self._is_port_in_use(port):
#                 return port
#             port += 1
#         return None

#     async def get_or_create_tunnel(self, job: Job) -> Optional[SSHTunnelInfo]:
#         """Get existing active tunnel for a job or create a new one if it doesn't exist."""
#         # Sprawdź czy istnieje aktywny tunel dla tego zadania
#         tunnel = self.db.query(SSHTunnel).filter(
#             SSHTunnel.job_id == job.id,
#             SSHTunnel.status == "ACTIVE"
#         ).first()

#         if tunnel:
#             # Sprawdź, czy tunel faktycznie działa (port jest otwarty)
#             if self._is_port_in_use(tunnel.local_port):
#                 return SSHTunnelInfo(
#                     id=tunnel.id,
#                     job_id=tunnel.job_id,
#                     local_port=tunnel.local_port,
#                     remote_port=tunnel.remote_port,
#                     remote_host=tunnel.remote_host,
#                     status=tunnel.status,
#                     created_at=tunnel.created_at
#                 )
#             else:
#                 # Tunel nie działa, zamknij go i utwórz nowy
#                 tunnel.status = "CLOSED"
#                 self.db.commit()

#         # Utwórz nowy tunel
#         return self.create_tunnel(job)

#     def _is_port_in_use(self, port: int) -> bool:
#         """
#         Check if a port is in use with proper timeout and error handling.

#         Args:
#             port: Port number to check

#         Returns:
#             bool: True if port is in use, False otherwise
#         """
#         try:
#             with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
#                 s.settimeout(0.5)  # Set 500ms timeout
#                 result = s.connect_ex(('127.0.0.1', port))
#                 return result == 0
#         except (socket.timeout, socket.error):
#             # If we get any socket error, assume the port is in use
#             # to be on the safe side
#             return True

#     def _establish_ssh_tunnel(self, local_port: int, remote_port: int, remote_host: str, node: str) -> bool:
#         """Establish SSH tunnel to the remote host."""
#         try:
#             cmd = [
#                 'ssh',
#                 '-N',  # Don't execute remote command
#                 '-f',  # Go to background
#                 '-L', f'127.0.0.1:{local_port}:localhost:{remote_port}',  # Bind only to localhost inside container
#                 f'{settings.SLURM_USER}@{remote_host}'
#             ]
#             cluster_logger.info(f"Establishing SSH tunnel: {' '.join(cmd)}")
#             subprocess.run(cmd, check=True)

#             # Krótkie opóźnienie, aby upewnić się, że tunel został utworzony
#             time.sleep(1)

#             # Sprawdź, czy tunel działa
#             if not self._is_port_in_use(local_port):
#                 cluster_logger.error(f"SSH tunnel for port {local_port} not established")
#                 return False

#             return True
#         except subprocess.CalledProcessError as e:
#             cluster_logger.error(f"Error establishing SSH tunnel: {str(e)}")
#             return False

#     def _start_socat_forwarder(self, external_port: int, internal_port: int) -> bool:
#         """Start socat process to forward external port to internal localhost port."""
#         try:
#             # Użyj socat do przekierowania portu z 0.0.0.0:external_port na 127.0.0.1:internal_port
#             # Jawnie określamy nasłuchiwanie na 0.0.0.0 aby być dostępnym z innych kontenerów
#             cmd = [
#                 'socat',
#                 f'TCP-LISTEN:{external_port},reuseaddr,fork',
#                 f'TCP:127.0.0.1:{internal_port}'
#             ]
#             cluster_logger.info(f"Starting socat forwarder: {' '.join(cmd)}")

#             # Uruchom socat w tle
#             process = subprocess.Popen(
#                 cmd,
#                 stdout=subprocess.PIPE,
#                 stderr=subprocess.PIPE,
#                 start_new_session=True  # Utwórz nową sesję, aby proces działał w tle
#             )

#             # Krótkie opóźnienie, aby upewnić się, że socat został uruchomiony
#             time.sleep(1)

#             # Sprawdź, czy proces działa
#             if process.poll() is not None:
#                 # Proces zakończył się - błąd
#                 stdout, stderr = process.communicate()
#                 cluster_logger.error(f"Socat forwarder failed: {stderr.decode('utf-8')}")
#                 return False

#             return True
#         except Exception as e:
#             cluster_logger.error(f"Error starting socat forwarder: {str(e)}")
#             return False

#     def _kill_ssh_tunnel(self, local_port: int):
#         """Kill SSH tunnel process using the local port."""
#         try:
#             # Znajdź proces SSH używający tego portu i zakończ go
#             cmd = f"lsof -ti:{local_port} | grep ssh | xargs kill -9 2>/dev/null || true"
#             cluster_logger.info(f"Killing SSH tunnel: {cmd}")
#             subprocess.run(cmd, shell=True)
#         except Exception as e:
#             cluster_logger.error(f"Error killing SSH tunnel: {str(e)}")

#     def _kill_socat_forwarder(self, port: int):
#         """Kill socat process forwarding the specified port."""
#         try:
#             # Znajdź proces socat używający tego portu i zakończ go
#             cmd = f"lsof -ti:{port} | grep socat | xargs kill -9 2>/dev/null || true"
#             cluster_logger.info(f"Killing socat forwarder: {cmd}")
