from pydantic_settings import BaseSettings
from typing import List, Optional
import os

class Settings(BaseSettings):
    # Debug settings
    DEBUG: bool = True
    LOG_LEVEL: str = "INFO"
    
    # API settings
    API_V1_STR: str = "/api/v1"
    PROJECT_NAME: str = "SLURM Container Manager"
    BASE_URL: Optional[str] = None  # Base URL for redirects, optional
    
    # Security settings
    SECRET_KEY: str = "your-secret-key-change-in-production"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 1 day
    ALGORITHM: str = "HS256"
    DISABLE_AUTH: bool = False  # Flaga do wyłączenia autoryzacji podczas pracy deweloperskiej
    
    # SLURM SSH settings
    SLURM_HOST: str = "eagle.man.poznan.pl"
    SLURM_PORT: int = 22
    SLURM_USER: Optional[str] = "kkingstoun"
    SLURM_PASSWORD: Optional[str] = None
    SLURM_KEY_FILE: Optional[str] = "/root/.ssh/id_rsa"  # Ścieżka w kontenerze
    SLURM_LOG_LEVEL: str = "ERROR"  # Temporarily set to ERROR to disable most SLURM logs

    # Container settings
    # Używaj wartości z .env lub zmiennych środowiskowych, z odpowiednimi wartościami domyślnymi
    CONTAINER_OUTPUT_DIR: str = os.getenv("CONTAINER_OUTPUT_DIR", "/mnt/storage_3/home/kkingstoun/containers/run")
    TEMPLATE_DIR: str = os.getenv("TEMPLATE_DIR", "/app/slurm_templates")
    
    # Caddy API configuration - use environment variable with docker service name as default
    CADDY_API_URL: str = os.getenv("CADDY_API_URL", "http://host.docker.internal:2019")
    
    # CORS
    BACKEND_CORS_ORIGINS: List[str] = [
        "http://localhost",
        "http://localhost:8000",
        "http://localhost:3000",
        "http://localhost:3001",
        "https://amucontainers.orion.zfns.eu.org:3001",
        "https://amucontainers.orion.zfns.eu.org:8000",
        "https://amucontainers.orion.zfns.eu.org"
    ]
    
    # Database
    DATABASE_URL: str = "postgresql://postgres:postgres@postgres:5432/containers_admin"
    
    # Admin user settings (with defaults)
    ADMIN_USERNAME: str = os.getenv("ADMIN_USERNAME", "admin")
    ADMIN_EMAIL: str = os.getenv("ADMIN_EMAIL", "admin@admin.pl")
    ADMIN_PASSWORD: str = os.getenv("ADMIN_PASSWORD", "password")
    ADMIN_FIRST_NAME: str = os.getenv("ADMIN_FIRST_NAME", "Admin")
    ADMIN_LAST_NAME: str = os.getenv("ADMIN_LAST_NAME", "Admin")
    
    class Config:
        env_file = ".env"
        case_sensitive = True

settings = Settings()