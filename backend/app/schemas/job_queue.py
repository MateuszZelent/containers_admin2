from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List
from datetime import datetime


class QueueJobBase(BaseModel):
    job_name: str = Field(..., description="Nazwa zadania symulacyjnego")
    simulation_file: Optional[str] = Field(None, description="Ścieżka do pliku symulacji")
    priority: int = Field(0, description="Priorytet zadania w kolejce")
    partition: str = Field("proxima", description="Partycja SLURM")
    num_cpus: int = Field(5, description="Liczba CPU")
    memory_gb: int = Field(24, description="Pamięć w GB")
    num_gpus: int = Field(1, description="Liczba GPU")
    time_limit: str = Field("24:00:00", description="Limit czasu")
    mx_file: Optional[str] = Field(None, description="Ścieżka do pliku .mx3")
    parameters: Optional[Dict[str, Any]] = Field(None, description="Parametry symulacji")


class QueueJobCreate(QueueJobBase):
    """Schemat do tworzenia nowego zadania w kolejce"""
    pass


class QueueJobUpdate(BaseModel):
    """Schemat do aktualizacji zadania w kolejce"""
    status: Optional[str] = None
    priority: Optional[int] = None
    progress: Optional[int] = None
    parameters: Optional[Dict[str, Any]] = None


class QueueJobInDB(QueueJobBase):
    """Schemat dla zadania w bazie danych"""
    id: int
    job_id: Optional[str] = None
    status: str
    node: Optional[str] = None
    output_dir: Optional[str] = None
    progress: int
    results_file: Optional[str] = None
    estimated_time: Optional[str] = None
    queued_at: datetime
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    owner_id: int

    class Config:
        from_attributes = True


class QueueStatus(BaseModel):
    """Status kolejki zadań"""
    total_jobs: int
    queued_jobs: int
    running_jobs: int
    completed_jobs: int
    failed_jobs: int
    avg_wait_time: Optional[str] = None


class SimulationResult(BaseModel):
    """Wyniki symulacji"""
    job_id: int
    status: str
    results_file: Optional[str] = None
    output_data: Optional[Dict[str, Any]] = None
    error_message: Optional[str] = None


class QueueJobWithResults(QueueJobInDB):
    """Zadanie z wynikami symulacji"""
    results: Optional[SimulationResult] = None
