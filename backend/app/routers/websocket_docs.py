"""
WebSocket Documentation Router

This router provides documentation for WebSocket endpoints since
OpenAPI/Swagger doesn't natively support WebSocket documentation.
"""

from fastapi import APIRouter
from pydantic import BaseModel
from typing import Dict, Any
from app.websocket.manager import websocket_manager

router = APIRouter(prefix="/ws-docs", tags=["WebSocket Documentation"])


class WebSocketInfo(BaseModel):
    """WebSocket endpoint information"""

    endpoint: str
    description: str
    authentication: str
    parameters: Dict[str, str]
    message_types: Dict[str, str]
    example_url: str


class WebSocketTestMessage(BaseModel):
    """Example WebSocket test message structure"""

    type: str = "test_data"
    data: Dict[str, Any] = {
        "random_number": 12345678,
        "timestamp": "2025-07-23T20:55:00Z",
        "server_status": "HEALTHY",
        "message": "WebSocket test broadcast",
    }


class JobStatusMessage(BaseModel):
    """Example job status WebSocket message"""

    type: str = "job_status_update"
    data: Dict[str, Any] = {
        "job_id": "123456",
        "status": "RUNNING",
        "user_id": "user123",
        "timestamp": "2025-07-23T20:55:00Z",
    }


class TunnelHealthMessage(BaseModel):
    """Example tunnel health WebSocket message"""

    type: str = "tunnel_health"
    data: Dict[str, Any] = {
        "tunnel_id": "tunnel_123",
        "status": "active",
        "health": "healthy",
        "timestamp": "2025-07-23T20:55:00Z",
    }


@router.get("/endpoints", response_model=Dict[str, WebSocketInfo])
async def get_websocket_endpoints():
    """
    Get documentation for all available WebSocket endpoints.

    **Note**: WebSocket endpoints cannot be tested directly from Swagger UI.
    Use a WebSocket client like wscat, or the frontend application.
    """

    return {
        "job_status": WebSocketInfo(
            endpoint="/ws/jobs/status",
            description="Real-time job status updates for SLURM jobs",
            authentication="JWT or CLI token as query parameter",
            parameters={"token": "Optional JWT or CLI token for authentication"},
            message_types={
                "job_status_update": "Job status changed (PENDING -> RUNNING -> COMPLETED)",
                "job_created": "New job was created",
                "job_deleted": "Job was deleted",
                "error": "Error notification",
            },
            example_url="ws://localhost:8000/ws/jobs/status?token=your_jwt_token",
        ),
        "tunnel_health": WebSocketInfo(
            endpoint="/ws/tunnel/health",
            description="Real-time SSH tunnel health monitoring",
            authentication="JWT or CLI token as query parameter",
            parameters={"token": "Optional JWT or CLI token for authentication"},
            message_types={
                "tunnel_health": "SSH tunnel status update",
                "tunnel_created": "New tunnel established",
                "tunnel_closed": "Tunnel was closed",
                "health_check": "Periodic health check result",
            },
            example_url="ws://localhost:8000/ws/tunnel/health?token=your_jwt_token",
        ),
        "notifications": WebSocketInfo(
            endpoint="/ws/notifications",
            description="General notifications and test data broadcasting",
            authentication="JWT or CLI token as query parameter",
            parameters={"token": "Optional JWT or CLI token for authentication"},
            message_types={
                "test_data": "Test broadcast with random numbers (every 30s)",
                "system_notification": "System-wide notifications",
                "cluster_update": "Cluster status updates",
                "maintenance": "Maintenance notifications",
            },
            example_url="ws://localhost:8000/ws/notifications?token=your_jwt_token",
        ),
    }


@router.get("/test-connection")
async def websocket_test_info():
    """
    Information about testing WebSocket connections.

    **Testing WebSocket Endpoints:**

    1. **Using wscat (command line)**:
       ```bash
       # Install wscat globally
       npm install -g wscat

       # Connect to job status WebSocket
       wscat -c "ws://localhost:8000/ws/jobs/status?token=your_token"

       # Connect to notifications (test data)
       wscat -c "ws://localhost:8000/ws/notifications?token=your_token"
       ```

    2. **Using JavaScript in browser**:
       ```javascript
       const token = localStorage.getItem('auth_token');
       const ws = new WebSocket(`ws://localhost:8000/ws/notifications?token=${token}`);

       ws.onmessage = (event) => {
           console.log('Received:', JSON.parse(event.data));
       };

       ws.onopen = () => console.log('WebSocket connected');
       ws.onclose = () => console.log('WebSocket disconnected');
       ```

    3. **Using the Frontend Application**:
       - Login at http://localhost:3000/login
       - Go to http://localhost:3000/dashboard
       - Check browser DevTools console for WebSocket messages
       - Look for "WebSocket Test: vol [number]" in cluster status section

    **Authentication**:
    - Get JWT token from `/api/v1/auth/login` endpoint
    - Or use CLI token from `/api/v1/cli-tokens/` endpoints
    - Pass token as query parameter: `?token=your_token`
    """

    return {
        "message": "See endpoint documentation above for testing instructions",
        "test_service_status": "Broadcasting random numbers every 30 seconds on /ws/notifications",
        "authentication_required": True,
        "supported_protocols": ["ws", "wss"],
        "cors_enabled": True,
    }


@router.get("/message-examples")
async def websocket_message_examples():
    """
    Examples of WebSocket message formats you can expect to receive.
    """

    return {
        "test_data_message": WebSocketTestMessage(),
        "job_status_message": JobStatusMessage(),
        "tunnel_health_message": TunnelHealthMessage(),
        "message_structure": {
            "description": "All WebSocket messages follow this structure",
            "format": {
                "type": "string - message type identifier",
                "data": "object - message payload specific to type",
                "timestamp": "string - ISO timestamp (optional)",
            },
        },
    }


@router.get("/connection-status")
async def websocket_connection_status():
    """
    Get current WebSocket connection statistics.
    """

    stats = websocket_manager.get_connection_stats()

    return {
        "total_connections": stats.get("total_connections", 0),
        "connections_by_channel": stats.get("connections_by_channel", {}),
        "test_service_running": True,  # Since test service starts with app
        "last_broadcast": "Check backend logs for broadcast times",
        "channels": {
            "job_status": "Real-time job updates",
            "tunnel_health": "SSH tunnel monitoring",
            "notifications": "General notifications and test data",
        },
    }
