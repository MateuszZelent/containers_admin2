"""
Core utility functions for the SLURM Container Manager backend.
"""

from typing import Optional
from app.core.config import settings


def get_full_url(path: str) -> str:
    """
    Generate a full URL from a relative path.
    
    Args:
        path: Relative path (e.g., "/static/avatars/admin.jpg")
        
    Returns:
        Full URL string (e.g., "https://amucontainers.orion.zfns.eu.org/static/avatars/admin.jpg")
    """
    # Remove leading slash if present to avoid double slashes
    clean_path = path.lstrip("/")
    
    if settings.BASE_URL:
        # Production: use configured BASE_URL
        base_url = settings.BASE_URL.rstrip("/")
        return f"{base_url}/{clean_path}"
    else:
        # Development fallback: use localhost
        return f"http://localhost:8000/{clean_path}"


def get_avatar_url(filename: str) -> str:
    """
    Generate a full URL for an avatar file.
    
    Args:
        filename: Avatar filename (e.g., "admin.jpg")
        
    Returns:
        Full avatar URL
    """
    return get_full_url(f"static/avatars/{filename}")


def make_avatar_url_absolute(avatar_url: Optional[str]) -> Optional[str]:
    """
    Convert a relative avatar URL to an absolute URL.
    
    Args:
        avatar_url: Relative URL (e.g., "/static/avatars/admin.jpg") or None
        
    Returns:
        Absolute URL or None if input was None
    """
    if not avatar_url:
        return None
    
    # If already absolute, return as is
    if avatar_url.startswith(('http://', 'https://')):
        return avatar_url
    
    # Convert relative to absolute
    return get_full_url(avatar_url)
