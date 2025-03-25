from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Dict, Any

from app.db.session import get_db

router = APIRouter()

class HealthResponse(BaseModel):
    status: str
    database_connection: bool
    version: str
    details: Dict[str, Any] = {}

@router.get("/", response_model=HealthResponse)
def health_check(db: Session = Depends(get_db)):
    """
    Endpoint służący do sprawdzania stanu backendu.
    Testuje połączenie z bazą danych i zwraca podstawowe informacje o aplikacji.
    """
    database_ok = False
    details = {}
    
    # Sprawdź połączenie z bazą danych
    try:
        # Wykonaj proste zapytanie
        db.execute("SELECT 1")
        database_ok = True
    except Exception as e:
        details["database_error"] = str(e)
    
    return HealthResponse(
        status="ok" if database_ok else "error",
        database_connection=database_ok,
        version="1.0.0",  # Możesz aktualizować tę wartość
        details=details
    )
