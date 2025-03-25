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
    SLURM_KEY_FILE: Optional[str] = "~/.ssh/id_rsa"
    
    # Container settings
    CONTAINER_OUTPUT_DIR: str = "/mnt/storage_3/home/kkingstoun/containers"
    TEMPLATE_DIR: str = "/home/kkingstoun/git/containers_admin2/backend/slurm_templates"
    
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
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/containers_admin"
    )
    
    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()