"""
Minimalistyczny klient API wygenerowany automatycznie
na podstawie specyfikacji OpenAPI
"""

import requests
import json
from typing import Optional, Dict, Any
from dataclasses import dataclass
from datetime import datetime


@dataclass
class CLIConfig:
    """Konfiguracja klienta CLI"""
    base_url: str = "https://amucontainers.orion.zfns.eu.org"
    cli_token: Optional[str] = None
    jwt_token: Optional[str] = None
    timeout: int = 30


class ContainersAdminClient:
    """
    Klient API dla SLURM Container Manager
    Automatycznie wygenerowany z OpenAPI spec
    """
    
    def __init__(self, config: CLIConfig):
        self.config = config
        self.session = requests.Session()
        self.session.timeout = config.timeout
        
        # Ustaw bazowe headers
        self.session.headers.update({
            "Content-Type": "application/json",
            "Accept": "application/json"
        })
    
    def authenticate_with_cli_token(self, cli_token: str) -> Dict[str, Any]:
        """Uwierzytelnienie za pomocą CLI token"""
        response = self.session.post(
            f"{self.config.base_url}/api/v1/auth/cli-login",
            json={"cli_token": cli_token}
        )
        response.raise_for_status()
        
        auth_data = response.json()
        self.config.jwt_token = auth_data["access_token"]
        
        # Ustaw token w headers dla przyszłych żądań
        self.session.headers["Authorization"] = f"Bearer {self.config.jwt_token}"
        
        return auth_data
    
    def get_current_user(self) -> Dict[str, Any]:
        """Pobiera informacje o aktualnym użytkowniku"""
        response = self.session.get(f"{self.config.base_url}/api/v1/auth/me")
        response.raise_for_status()
        return response.json()
    
    def get_jobs(self) -> list[Dict[str, Any]]:
        """Pobiera listę zadań użytkownika"""
        response = self.session.get(f"{self.config.base_url}/api/v1/jobs/")
        response.raise_for_status()
        return response.json()
    
    def create_job(self, job_data: Dict[str, Any]) -> Dict[str, Any]:
        """Tworzy nowe zadanie"""
        response = self.session.post(
            f"{self.config.base_url}/api/v1/jobs/",
            json=job_data
        )
        response.raise_for_status()
        return response.json()
    
    def get_job(self, job_id: int) -> Dict[str, Any]:
        """Pobiera szczegóły zadania"""
        response = self.session.get(f"{self.config.base_url}/api/v1/jobs/{job_id}")
        response.raise_for_status()
        return response.json()
    
    def delete_job(self, job_id: int) -> Dict[str, Any]:
        """Usuwa zadanie"""
        response = self.session.delete(f"{self.config.base_url}/api/v1/jobs/{job_id}")
        response.raise_for_status()
        return response.json()
    
    def get_job_status(self, job_id: int) -> Dict[str, Any]:
        """Pobiera status zadania"""
        response = self.session.get(f"{self.config.base_url}/api/v1/jobs/{job_id}/status")
        response.raise_for_status()
        return response.json()
    
    def get_job_log(self, job_id: int) -> str:
        """Pobiera logi zadania"""
        response = self.session.get(f"{self.config.base_url}/api/v1/jobs/{job_id}/log")
        response.raise_for_status()
        return response.text
    
    def get_templates(self) -> list[Dict[str, Any]]:
        """Pobiera dostępne szablony"""
        response = self.session.get(f"{self.config.base_url}/api/v1/jobs/templates")
        response.raise_for_status()
        return response.json()
    
    def get_cluster_stats(self) -> Dict[str, Any]:
        """Pobiera statystyki klastra"""
        response = self.session.get(f"{self.config.base_url}/api/v1/cluster/stats")
        response.raise_for_status()
        return response.json()
    
    def get_tasks(self) -> list[Dict[str, Any]]:
        """Pobiera zadania z kolejki"""
        response = self.session.get(f"{self.config.base_url}/api/v1/tasks/")
        response.raise_for_status()
        return response.json()
    
    def create_task(self, task_data: Dict[str, Any]) -> Dict[str, Any]:
        """Tworzy nowe zadanie w kolejce"""
        response = self.session.post(
            f"{self.config.base_url}/api/v1/tasks/",
            json=task_data
        )
        response.raise_for_status()
        return response.json()
    
    def get_cli_tokens(self) -> list[Dict[str, Any]]:
        """Pobiera tokeny CLI użytkownika"""
        response = self.session.get(f"{self.config.base_url}/api/v1/cli-tokens/")
        response.raise_for_status()
        return response.json()
    
    def create_cli_token(self, name: str, expires_days: int = 30) -> Dict[str, Any]:
        """Tworzy nowy token CLI"""
        response = self.session.post(
            f"{self.config.base_url}/api/v1/cli-tokens/",
            json={"name": name, "expires_days": expires_days}
        )
        response.raise_for_status()
        return response.json()


# Przykład użycia
if __name__ == "__main__":
    # Konfiguracja
    config = CLIConfig(
        base_url="https://amucontainers.orion.zfns.eu.org",
        cli_token="your_cli_token_here"
    )
    
    # Tworzenie klienta
    client = ContainersAdminClient(config)
    
    try:
        # Uwierzytelnienie
        auth_result = client.authenticate_with_cli_token(config.cli_token)
        print(f"✅ Uwierzytelniono: {auth_result['token_type']}")
        
        # Pobierz informacje o użytkowniku
        user = client.get_current_user()
        print(f"👤 Użytkownik: {user['username']} ({user['email']})")
        
        # Pobierz zadania
        jobs = client.get_jobs()
        print(f"📋 Zadania: {len(jobs)}")
        
        # Pobierz szablony
        templates = client.get_templates()
        print(f"📄 Szablony: {len(templates)}")
        
        # Pobierz statystyki klastra
        stats = client.get_cluster_stats()
        print(f"🖥️  Klaster: {stats}")
        
    except requests.exceptions.RequestException as e:
        print(f"❌ Błąd API: {e}")
