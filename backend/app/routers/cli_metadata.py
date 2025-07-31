"""
Dodatkowe endpointy dla klientów CLI - metadane i schematy
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import Dict, Any, List
from app.db.session import get_db
from app.core.auth import get_current_active_user_with_cli_support
from app.db.models import User
import json

router = APIRouter()


@router.get("/cli/info", response_model=Dict[str, Any])
async def get_cli_info(
    current_user: User = Depends(get_current_active_user_with_cli_support),
) -> Dict[str, Any]:
    """
    Endpoint dedykowany dla klientów CLI - podstawowe informacje o API
    """
    return {
        "api_version": "v1",
        "api_base_url": "/api/v1",
        "authentication": {
            "methods": ["cli_token", "jwt"],
            "cli_login_endpoint": "/api/v1/auth/cli-login",
            "user_info_endpoint": "/api/v1/auth/me"
        },
        "endpoints": {
            "jobs": {
                "list": "GET /api/v1/jobs/",
                "create": "POST /api/v1/jobs/",
                "get": "GET /api/v1/jobs/{job_id}",
                "delete": "DELETE /api/v1/jobs/{job_id}",
                "status": "GET /api/v1/jobs/{job_id}/status",
                "log": "GET /api/v1/jobs/{job_id}/log",
                "templates": "GET /api/v1/jobs/templates"
            },
            "tasks": {
                "list": "GET /api/v1/tasks/",
                "create": "POST /api/v1/tasks/",
                "get": "GET /api/v1/tasks/{task_id}",
                "delete": "DELETE /api/v1/tasks/{task_id}",
                "cancel": "POST /api/v1/tasks/{task_id}/cancel"
            },
            "cluster": {
                "stats": "GET /api/v1/cluster/stats",
                "usage_history": "GET /api/v1/cluster/usage/history"
            },
            "cli_tokens": {
                "list": "GET /api/v1/cli-tokens/",
                "create": "POST /api/v1/cli-tokens/",
                "delete": "DELETE /api/v1/cli-tokens/{token_id}"
            }
        },
        "models": {
            "job_create": {
                "required_fields": ["job_name", "template_name"],
                "optional_fields": ["partition", "num_cpus", "memory_gb", "num_gpus", "max_time_hours", "script_content"]
            },
            "task_create": {
                "required_fields": ["name", "simulation_file"],
                "optional_fields": ["partition", "num_cpus", "memory_gb", "num_gpus", "max_time_hours", "priority"]
            }
        },
        "user_limits": {
            "max_containers": current_user.max_containers or 6,
            "max_gpus": current_user.max_gpus or 24
        }
    }


@router.get("/cli/schemas", response_model=Dict[str, Any])
async def get_cli_schemas() -> Dict[str, Any]:
    """
    Endpoint zwracający schematy modeli w formacie przyjaznym dla CLI
    """
    return {
        "JobCreate": {
            "type": "object",
            "required": ["job_name", "template_name"],
            "properties": {
                "job_name": {"type": "string", "description": "Nazwa zadania"},
                "template_name": {"type": "string", "description": "Nazwa szablonu"},
                "partition": {"type": "string", "description": "Partycja SLURM", "default": "gpu"},
                "num_cpus": {"type": "integer", "description": "Liczba CPU", "default": 4},
                "memory_gb": {"type": "integer", "description": "Pamięć RAM w GB", "default": 16},
                "num_gpus": {"type": "integer", "description": "Liczba GPU", "default": 1},
                "max_time_hours": {"type": "integer", "description": "Maksymalny czas w godzinach", "default": 24},
                "script_content": {"type": "string", "description": "Treść skryptu (opcjonalne)"}
            }
        },
        "TaskCreate": {
            "type": "object",
            "required": ["name", "simulation_file"],
            "properties": {
                "name": {"type": "string", "description": "Nazwa zadania"},
                "simulation_file": {"type": "string", "description": "Ścieżka do pliku symulacji"},
                "partition": {"type": "string", "description": "Partycja SLURM", "default": "gpu"},
                "num_cpus": {"type": "integer", "description": "Liczba CPU", "default": 4},
                "memory_gb": {"type": "integer", "description": "Pamięć RAM w GB", "default": 16},
                "num_gpus": {"type": "integer", "description": "Liczba GPU", "default": 1},
                "max_time_hours": {"type": "integer", "description": "Maksymalny czas w godzinach", "default": 24},
                "priority": {"type": "integer", "description": "Priorytet (1-10)", "default": 5}
            }
        },
        "CLITokenCreate": {
            "type": "object",
            "required": ["name"],
            "properties": {
                "name": {"type": "string", "description": "Nazwa tokenu"},
                "expires_days": {"type": "integer", "description": "Wygaśnięcie w dniach", "default": 30}
            }
        }
    }


@router.get("/cli/templates", response_model=List[Dict[str, Any]])
async def get_cli_templates(
    current_user: User = Depends(get_current_active_user_with_cli_support),
) -> List[Dict[str, Any]]:
    """
    Endpoint zwracający dostępne szablony w formacie przyjaznym dla CLI
    """
    # Tu możesz zaimplementować logikę pobierania szablonów
    # Na razie zwracam przykładowe dane
    return [
        {
            "name": "amumax-gpu",
            "description": "AMUMAX simulation with GPU support",
            "requirements": {
                "min_gpus": 1,
                "min_memory_gb": 8,
                "min_cpus": 2
            },
            "parameters": {
                "input_file": {"required": True, "type": "file", "description": "Input .mx3 file"},
                "output_dir": {"required": False, "type": "string", "description": "Output directory"}
            }
        },
        {
            "name": "python-notebook",
            "description": "Jupyter Notebook with Python",
            "requirements": {
                "min_gpus": 0,
                "min_memory_gb": 4,
                "min_cpus": 1
            },
            "parameters": {
                "notebook_file": {"required": False, "type": "file", "description": "Notebook file"}
            }
        }
    ]


@router.get("/cli/status-codes", response_model=Dict[str, Any])
async def get_cli_status_codes() -> Dict[str, Any]:
    """
    Endpoint zwracający mapowanie kodów statusu dla CLI
    """
    return {
        "job_statuses": {
            "PENDING": "Zadanie oczekuje na uruchomienie",
            "CONFIGURING": "Zadanie jest konfigurowane",
            "RUNNING": "Zadanie jest uruchomione",
            "COMPLETED": "Zadanie zakończone pomyślnie",
            "FAILED": "Zadanie zakończone błędem",
            "CANCELLED": "Zadanie anulowane",
            "TIMEOUT": "Zadanie przekroczyło limit czasu"
        },
        "task_statuses": {
            "pending": "Zadanie w kolejce",
            "running": "Zadanie wykonywane",
            "completed": "Zadanie zakończone",
            "failed": "Zadanie nie powiodło się",
            "cancelled": "Zadanie anulowane"
        },
        "priority_levels": {
            "1": "Bardzo niski",
            "3": "Niski", 
            "5": "Normalny",
            "7": "Wysoki",
            "10": "Bardzo wysoki"
        }
    }


@router.get("/cli/limits", response_model=Dict[str, Any])
async def get_cli_limits(
    current_user: User = Depends(get_current_active_user_with_cli_support),
) -> Dict[str, Any]:
    """
    Endpoint zwracający limity użytkownika
    """
    return {
        "user_limits": {
            "max_containers": current_user.max_containers or 6,
            "max_gpus": current_user.max_gpus or 24,
            "max_memory_gb_per_job": 128,
            "max_time_hours": 168  # 7 dni
        },
        "cluster_limits": {
            "available_partitions": ["gpu", "cpu", "test"],
            "max_gpus_per_partition": {"gpu": 8, "cpu": 0, "test": 2},
            "max_time_hours_per_partition": {"gpu": 168, "cpu": 72, "test": 4}
        }
    }
