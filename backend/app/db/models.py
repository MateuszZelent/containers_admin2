from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

Base = declarative_base()


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    first_name = Column(String, nullable=True)
    last_name = Column(String, nullable=True)
    hashed_password = Column(String)
    email = Column(String, unique=True, index=True)
    is_active = Column(Boolean, default=True)
    is_superuser = Column(Boolean, default=False)
    jobs = relationship("Job", back_populates="owner")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


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
    
    # SLURM job parameters
    partition = Column(String, default="proxima")
    num_nodes = Column(Integer, default=1)
    tasks_per_node = Column(Integer, default=1)
    num_cpus = Column(Integer, default=1)
    memory_gb = Column(Integer, default=1)
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
    local_port = Column(Integer)  # Port na serwerze aplikacji
    remote_port = Column(Integer)  # Port na węźle obliczeniowym
    node = Column(String)  # Węzeł na którym działa kontener
    tunnel_pid = Column(Integer, nullable=True)  # PID procesu tunelu SSH
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    status = Column(String)  # ACTIVE, INACTIVE, FAILED
    job = relationship("Job", back_populates="tunnels")
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())