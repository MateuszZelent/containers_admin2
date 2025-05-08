from typing import List, Optional, Dict, Any
from datetime import datetime
from sqlalchemy.orm import Session

from app.db.models import QueueJob, User
from app.schemas.job_queue import QueueJobCreate, QueueJobUpdate, QueueStatus
from app.services.slurm import SlurmSSHService
from app.core.logging import cluster_logger


class JobQueueService:
    def __init__(self, db: Session):
        self.db = db
        self.slurm_service = SlurmSSHService()

    def get_queue_job(self, job_id: int) -> Optional[QueueJob]:
        """Pobierz zadanie kolejki po ID"""
        return self.db.query(QueueJob).filter(QueueJob.id == job_id).first()

    def get_queue_jobs(self, owner_id: int, skip: int = 0, limit: int = 100) -> List[QueueJob]:
        """Pobierz wszystkie zadania użytkownika"""
        return (
            self.db.query(QueueJob)
            .filter(QueueJob.owner_id == owner_id)
            .order_by(QueueJob.priority.desc(), QueueJob.queued_at.asc())
            .offset(skip)
            .limit(limit)
            .all()
        )

    def create_queue_job(self, job_data: QueueJobCreate, owner_id: int) -> QueueJob:
        """Utwórz nowe zadanie w kolejce"""
        db_job = QueueJob(
            **job_data.dict(),
            status="QUEUED",
            owner_id=owner_id
        )
        self.db.add(db_job)
        self.db.commit()
        self.db.refresh(db_job)
        
        # Log job creation
        cluster_logger.info(f"Zadanie {db_job.id} dodane do kolejki przez użytkownika {owner_id}")
        
        # Tutaj można dodać logikę sprawdzającą i uruchamiającą zadanie, jeśli zasoby są dostępne
        
        return db_job

    def update_queue_job(self, job_id: int, job_update: QueueJobUpdate) -> Optional[QueueJob]:
        """Aktualizuj zadanie w kolejce"""
        db_job = self.get_queue_job(job_id)
        if not db_job:
            return None
            
        update_data = job_update.dict(exclude_unset=True)
        for field, value in update_data.items():
            setattr(db_job, field, value)
            
        # Jeśli aktualizowany jest status, zaktualizuj odpowiednie znaczniki czasowe
        if "status" in update_data:
            if update_data["status"] == "RUNNING":
                db_job.started_at = datetime.now()
            elif update_data["status"] in ["COMPLETED", "FAILED", "CANCELLED"]:
                db_job.finished_at = datetime.now()
                
        self.db.add(db_job)
        self.db.commit()
        self.db.refresh(db_job)
        return db_job
        
    def delete_queue_job(self, job_id: int) -> bool:
        """Usuń zadanie z kolejki"""
        db_job = self.get_queue_job(job_id)
        if not db_job:
            return False
            
        # Jeśli zadanie jest uruchomione, anuluj je w SLURM
        if db_job.status == "RUNNING" and db_job.job_id:
            # W przyszłości: dodać logikę anulowania zadania w SLURM
            pass
            
        self.db.delete(db_job)
        self.db.commit()
        return True
        
    def get_queue_status(self, owner_id: Optional[int] = None) -> QueueStatus:
        """Pobierz status kolejki zadań"""
        query = self.db.query(QueueJob)
        
        if owner_id:
            query = query.filter(QueueJob.owner_id == owner_id)
            
        total = query.count()
        queued = query.filter(QueueJob.status == "QUEUED").count()
        running = query.filter(QueueJob.status == "RUNNING").count()
        completed = query.filter(QueueJob.status == "COMPLETED").count()
        failed = query.filter(QueueJob.status == "FAILED").count()
        
        # W przyszłości: dodać obliczanie średniego czasu oczekiwania
        
        return QueueStatus(
            total_jobs=total,
            queued_jobs=queued,
            running_jobs=running,
            completed_jobs=completed,
            failed_jobs=failed,
            avg_wait_time=None  # Do implementacji w przyszłości
        )
        
    async def process_queue(self) -> int:
        """Przetwarzaj kolejkę, uruchamiając zadania oczekujące, jeśli zasoby są dostępne"""
        # Ta metoda będzie wywoływana przez zadanie cykliczne
        # W przyszłości: implementacja logiki sprawdzającej dostępne zasoby i uruchamiającej zadania
        
        # Tymczasowa implementacja: zwracamy liczbę zadań w kolejce
        return self.db.query(QueueJob).filter(QueueJob.status == "QUEUED").count()
        
    async def submit_job_to_slurm(self, queue_job: QueueJob) -> bool:
        """Zgłoś zadanie do SLURM"""
        # W przyszłości: implementacja logiki przygotowującej skrypt i uruchamiającej zadanie
        return False
        
    async def check_job_status(self, queue_job: QueueJob) -> str:
        """Sprawdź status zadania w SLURM"""
        # W przyszłości: implementacja logiki sprawdzającej status zadania w SLURM
        return queue_job.status
        
    async def get_job_results(self, queue_job: QueueJob) -> Dict[str, Any]:
        """Pobierz wyniki zadania"""
        # W przyszłości: implementacja logiki pobierającej wyniki zadania
        return {"status": queue_job.status}
