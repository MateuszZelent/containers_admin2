from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import json
from sqlalchemy.ext.hybrid import hybrid_property
from sqlalchemy.types import TypeDecorator, TEXT

Base = declarative_base()

class JSONEncodedDict(TypeDecorator):
    """Represents a JSON serializable dictionary as text."""
    impl = TEXT

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        return json.dumps(value)

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        return json.loads(value)


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True)
    email = Column(String(100), unique=True, index=True, nullable=True)
    first_name = Column(String(50), nullable=True)
    last_name = Column(String(50), nullable=True)
    hashed_password = Column(String(255))
    is_active = Column(Boolean, default=True)
    is_superuser = Column(Boolean, default=False)
    code_server_password = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), nullable=True)
    jobs = relationship("Job", back_populates="owner")
    
class Job(Base):
    __tablename__ = "jobs"

    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(String, index=True, unique=True)  # SLURM job ID
    job_name = Column(String, default="Unknown Job")
    template_name = Column(String, default="unknown")
    status = Column(String, default="UNKNOWN")  # PENDING, RUNNING, COMPLETED, FAILED, etc.
    node = Column(String, nullable=True)  # Node where the job is running
    port = Column(Integer, nullable=True)  # Port for the container
    password = Column(String, nullable=True)  # Password for code-server
    owner = relationship("User", back_populates="jobs")
    
    # SLURM job parameters
    partition = Column(String, default="proxima")
    num_nodes = Column(Integer, default=1)
    tasks_per_node = Column(Integer, default=1)
    num_cpus = Column(Integer, default=5)
    memory_gb = Column(Integer, default=24)
    num_gpus = Column(Integer, default=0)
    time_limit = Column(String, default="24:00:00")
    script = Column(Text, default="")  # Store the generated script for reference
    
    # Timestamps and relations
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    owner_id = Column(Integer, ForeignKey("users.id"))
    owner = relationship("User", back_populates="jobs")
    tunnels = relationship("SSHTunnel", back_populates="job")


class SSHTunnel(Base):
    __tablename__ = "ssh_tunnels"
    
    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(Integer, ForeignKey("jobs.id"))
    local_port = Column(Integer)  # Port lokalny (socat)
    external_port = Column(Integer)  # Port dostępny z zewnątrz (socat)
    internal_port = Column(Integer)  # Wewnętrzny port tunelu SSH
    remote_port = Column(Integer)  # Port na węźle obliczeniowym
    remote_host = Column(String)  # Węzeł na którym działa kontener
    node = Column(String)  # Węzeł na którym działa kontener
    status = Column(String)  # ACTIVE, INACTIVE, FAILED
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    job = relationship("Job", back_populates="tunnels")


class QueueJob(Base):
    __tablename__ = "queue_jobs"
    
    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(String, index=True, unique=True)  # SLURM job ID
    job_name = Column(String, default="Amumax Simulation")
    simulation_file = Column(String, nullable=True)  # Ścieżka do pliku symulacji
    status = Column(String, default="QUEUED")  # QUEUED, RUNNING, COMPLETED, FAILED, etc.
    priority = Column(Integer, default=0)  # Priorytet w kolejce (wyższy = ważniejszy)
    node = Column(String, nullable=True)  # Węzeł, na którym zadanie jest uruchomione
    output_dir = Column(String, nullable=True)  # Katalog wyjściowy dla wyników
    
    # Parametry zadania SLURM
    partition = Column(String, default="proxima")
    num_cpus = Column(Integer, default=5)
    memory_gb = Column(Integer, default=24)
    num_gpus = Column(Integer, default=1)  # Domyślnie 1 dla obliczeń amumax
    time_limit = Column(String, default="24:00:00")
    script = Column(Text, default="")  # Wygenerowany skrypt
    
    # Parametry specyficzne dla symulacji amumax
    mx_file = Column(String, nullable=True)  # Ścieżka do pliku .mx3
    parameters = Column(JSONEncodedDict, nullable=True)  # Parametry symulacji w formacie JSON
    results_file = Column(String, nullable=True)  # Ścieżka do pliku wyników
    
    # Statusy i czasy
    progress = Column(Integer, default=0)  # Postęp symulacji (0-100%)
    estimated_time = Column(String, nullable=True)  # Szacowany czas zakończenia
    queued_at = Column(DateTime(timezone=True), server_default=func.now())
    started_at = Column(DateTime(timezone=True), nullable=True)
    finished_at = Column(DateTime(timezone=True), nullable=True)
    
    # Relacje z innymi tabelami
    owner_id = Column(Integer, ForeignKey("users.id"))
    owner = relationship("User", backref="queue_jobs")