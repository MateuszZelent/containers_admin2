"""
WebSocket module for real-time communication.

This module provides WebSocket endpoints for:
- Job status updates
- SSH tunnel health monitoring
- System notifications
- Admin statistics

All WebSocket connections support authentication via JWT or CLI tokens.
"""

from .manager import websocket_manager
from .routes import router

__all__ = ["websocket_manager", "router"]