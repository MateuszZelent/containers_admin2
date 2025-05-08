from typing import Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, status
from sqlalchemy.orm import Session

from app.core.auth import get_current_active_user
from app.db.session import get_db
from app.db.models import User
from app.schemas.job_queue import (
    QueueJobCreate, 
    QueueJobUpdate, 
    QueueJobInDB, 
    QueueStatus, 
    SimulationResult,
    QueueJobWithResults
)
from app.services.job_queue import JobQueueService

router = APIRouter()


@router.get("/", response_model=List[QueueJobInDB])
def get_queue_jobs(
    db: Session = Depends(get_db),
    skip: int = 0,
    limit: int = 100,
    current_user: User = Depends(get_current_active_user),
) -> Any:
    """
    Pobierz wszystkie zadania w kolejce dla aktualnego użytkownika.
    """
    queue_service = JobQueueService(db)
    return queue_service.get_queue_jobs(current_user.id, skip, limit)


@router.post("/", response_model=QueueJobInDB)
def create_queue_job(
    *,
    db: Session = Depends(get_db),
    job_in: QueueJobCreate,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_active_user),
) -> Any:
    """
    Utwórz nowe zadanie w kolejce.
    """
    queue_service = JobQueueService(db)
    return queue_service.create_queue_job(job_in, current_user.id)


@router.get("/status", response_model=QueueStatus)
def get_queue_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> Any:
    """
    Pobierz status kolejki zadań dla aktualnego użytkownika.
    """
    queue_service = JobQueueService(db)
    return queue_service.get_queue_status(current_user.id)


@router.get("/{job_id}", response_model=QueueJobInDB)
def get_queue_job(
    *,
    db: Session = Depends(get_db),
    job_id: int,
    current_user: User = Depends(get_current_active_user),
) -> Any:
    """
    Pobierz szczegóły zadania w kolejce.
    """
    queue_service = JobQueueService(db)
    job = queue_service.get_queue_job(job_id)
    
    if not job:
        raise HTTPException(status_code=404, detail="Zadanie nie zostało znalezione")
    if job.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Brak uprawnień")
        
    return job


@router.put("/{job_id}", response_model=QueueJobInDB)
def update_queue_job(
    *,
    db: Session = Depends(get_db),
    job_id: int,
    job_update: QueueJobUpdate,
    current_user: User = Depends(get_current_active_user),
) -> Any:
    """
    Aktualizuj zadanie w kolejce.
    """
    queue_service = JobQueueService(db)
    job = queue_service.get_queue_job(job_id)
    
    if not job:
        raise HTTPException(status_code=404, detail="Zadanie nie zostało znalezione")
    if job.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Brak uprawnień")
        
    return queue_service.update_queue_job(job_id, job_update)


@router.delete("/{job_id}")
def delete_queue_job(
    *,
    db: Session = Depends(get_db),
    job_id: int,
    current_user: User = Depends(get_current_active_user),
) -> Any:
    """
    Usuń zadanie z kolejki.
    """
    queue_service = JobQueueService(db)
    job = queue_service.get_queue_job(job_id)
    
    if not job:
        raise HTTPException(status_code=404, detail="Zadanie nie zostało znalezione")
    if job.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Brak uprawnień")
        
    success = queue_service.delete_queue_job(job_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Nie udało się usunąć zadania"
        )
    
    return {"message": "Zadanie zostało usunięte"}


@router.get("/{job_id}/results", response_model=SimulationResult)
async def get_job_results(
    *,
    db: Session = Depends(get_db),
    job_id: int,
    current_user: User = Depends(get_current_active_user),
) -> Any:
    """
    Pobierz wyniki zadania.
    """
    queue_service = JobQueueService(db)
    job = queue_service.get_queue_job(job_id)
    
    if not job:
        raise HTTPException(status_code=404, detail="Zadanie nie zostało znalezione")
    if job.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Brak uprawnień")
        
    if job.status not in ["COMPLETED", "FAILED"]:
        return SimulationResult(
            job_id=job.id,
            status=job.status,
            error_message="Zadanie nie zostało jeszcze zakończone"
        )
        
    results = await queue_service.get_job_results(job)
    return SimulationResult(
        job_id=job.id,
        status=job.status,
        results_file=job.results_file,
        output_data=results,
        error_message="Oczekiwanie na implementację pobierania wyników"
    )


@router.post("/{job_id}/cancel")
async def cancel_queue_job(
    *,
    db: Session = Depends(get_db),
    job_id: int,
    current_user: User = Depends(get_current_active_user),
) -> Any:
    """
    Anuluj zadanie w kolejce.
    """
    queue_service = JobQueueService(db)
    job = queue_service.get_queue_job(job_id)
    
    if not job:
        raise HTTPException(status_code=404, detail="Zadanie nie zostało znalezione")
    if job.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Brak uprawnień")
        
    if job.status not in ["QUEUED", "RUNNING"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Nie można anulować zadania o statusie {job.status}"
        )
        
    job_update = QueueJobUpdate(status="CANCELLED")
    updated_job = queue_service.update_queue_job(job_id, job_update)
    
    # Obsługa anulowania w SLURM będzie zaimplementowana w przyszłości
    
    return {"message": "Zadanie zostało anulowane"}
