"""
Dependency injection for SSH Tunnel Service
"""

from functools import lru_cache
from app.services.tunnels.tunnel_service import SSHTunnelService


@lru_cache()
def get_tunnel_service() -> SSHTunnelService:
    """
    Dependency injection for SSHTunnelService.
    
    Returns a singleton instance that will be reused across requests.
    This ensures proper resource management and consistent state.
    """
    return SSHTunnelService()
