from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, Query
from app.websocket.manager import websocket_manager
from app.core.logging import cluster_logger
from app.core.auth import get_current_user_websocket
from app.db.session import get_db
from sqlalchemy.orm import Session
from typing import Optional
import json

router = APIRouter(prefix="/ws", tags=["websockets"])


@router.websocket("/jobs/status")
async def job_status_websocket(
    websocket: WebSocket,
    token: Optional[str] = Query(None, description="JWT or CLI token for authentication")
):
    """
    WebSocket endpoint for real-time job status updates.
    
    Authentication:
    - Pass token as query parameter: /ws/jobs/status?token=your_jwt_token
    - If no token provided and DISABLE_AUTH=True, allows anonymous access
    - If auth enabled, requires valid JWT or CLI token
    
    Clients will receive:
    - Job status changes (PENDING -> RUNNING -> COMPLETED, etc.)
    - Job creation/deletion events
    - Error notifications
    """
    # Get database session
    db = next(get_db())
    
    try:
        # Authenticate user
        user = await get_current_user_websocket(token, db)
        user_id = str(user.id) if user else None
        
        cluster_logger.info(f"WebSocket job_status connection attempt by user: {user.username if user else 'anonymous'}")
        
    except Exception as e:
        cluster_logger.warning(f"WebSocket authentication failed: {e}")
        await websocket.close(code=1008, reason="Authentication failed")
        return
    finally:
        db.close()
    
    connected = await websocket_manager.connect(
        websocket, 
        "job_status", 
        user_id
    )
    
    if not connected:
        await websocket.close(code=1011, reason="Connection failed")
        return
    
    if not connected:
        return
    
    try:
        # Send initial connection confirmation
        await websocket.send_text(json.dumps({
            "type": "connection_established",
            "channel": "job_status",
            "message": "Connected to job status updates"
        }))
        
        # Keep connection alive and handle incoming messages
        while True:
            try:
                # Receive messages (ping/pong, subscriptions, etc.)
                message = await websocket.receive_text()
                data = json.loads(message)
                
                # Handle ping/pong
                if data.get("type") == "ping":
                    await websocket.send_text(json.dumps({
                        "type": "pong",
                        "timestamp": data.get("timestamp")
                    }))
                
                # Handle subscription to specific job
                elif data.get("type") == "subscribe_job":
                    job_id = data.get("job_id")
                    if job_id:
                        # Add to specific job channel
                        await websocket_manager.connect(
                            websocket, 
                            f"job_{job_id}", 
                            user_id
                        )
                        await websocket.send_text(json.dumps({
                            "type": "subscribed",
                            "job_id": job_id,
                            "message": f"Subscribed to job {job_id} updates"
                        }))
                
            except json.JSONDecodeError:
                await websocket.send_text(json.dumps({
                    "type": "error",
                    "message": "Invalid JSON message"
                }))
            except Exception as e:
                cluster_logger.error(f"Error handling WebSocket message: {e}")
                break
                
    except WebSocketDisconnect:
        cluster_logger.info("Job status WebSocket disconnected")
    except Exception as e:
        cluster_logger.error(f"Job status WebSocket error: {e}")
    finally:
        websocket_manager.disconnect(websocket)


@router.websocket("/tunnels/health")
async def tunnel_health_websocket(
    websocket: WebSocket,
    token: Optional[str] = Query(None, description="JWT or CLI token for authentication")
):
    """
    WebSocket endpoint for real-time SSH tunnel health monitoring.
    
    Authentication: Same as job status endpoint
    
    Clients will receive:
    - Tunnel status changes (ACTIVE, INACTIVE, FAILED, etc.)
    - Health check results
    - Connection/disconnection events
    """
    # Get database session
    db = next(get_db())
    
    try:
        # Authenticate user
        user = await get_current_user_websocket(token, db)
        user_id = str(user.id) if user else None
        
        cluster_logger.info(f"WebSocket tunnel_health connection by user: {user.username if user else 'anonymous'}")
        
    except Exception as e:
        cluster_logger.warning(f"WebSocket tunnel auth failed: {e}")
        await websocket.close(code=1008, reason="Authentication failed")
        return
    finally:
        db.close()
    
    connected = await websocket_manager.connect(
        websocket, 
        "tunnel_health", 
        user_id
    )
    
    if not connected:
        return
    
    try:
        # Send initial connection confirmation
        await websocket.send_text(json.dumps({
            "type": "connection_established",
            "channel": "tunnel_health",
            "message": "Connected to tunnel health updates"
        }))
        
        # Keep connection alive
        while True:
            try:
                message = await websocket.receive_text()
                data = json.loads(message)
                
                # Handle ping/pong
                if data.get("type") == "ping":
                    await websocket.send_text(json.dumps({
                        "type": "pong",
                        "timestamp": data.get("timestamp")
                    }))
                
                # Handle subscription to specific tunnel
                elif data.get("type") == "subscribe_tunnel":
                    tunnel_id = data.get("tunnel_id")
                    if tunnel_id:
                        await websocket_manager.connect(
                            websocket, 
                            f"tunnel_{tunnel_id}", 
                            user_id
                        )
                        await websocket.send_text(json.dumps({
                            "type": "subscribed",
                            "tunnel_id": tunnel_id,
                            "message": f"Subscribed to tunnel {tunnel_id} updates"
                        }))
                
            except json.JSONDecodeError:
                await websocket.send_text(json.dumps({
                    "type": "error",
                    "message": "Invalid JSON message"
                }))
            except Exception as e:
                cluster_logger.error(f"Error handling tunnel WebSocket message: {e}")
                break
                
    except WebSocketDisconnect:
        cluster_logger.info("Tunnel health WebSocket disconnected")
    except Exception as e:
        cluster_logger.error(f"Tunnel health WebSocket error: {e}")
    finally:
        websocket_manager.disconnect(websocket)


@router.websocket("/notifications")
async def notifications_websocket(
    websocket: WebSocket,
    token: Optional[str] = None
):
    """
    WebSocket endpoint for real-time system notifications.
    
    Clients will receive:
    - System alerts and warnings
    - User-specific notifications
    - Error messages
    - Status updates
    """
    user_id = None
    if token:
        try:
            # Validate token and get user
            pass
        except Exception as e:
            cluster_logger.warning(f"Invalid WebSocket auth token: {e}")
    
    connected = await websocket_manager.connect(
        websocket, 
        "notifications", 
        user_id
    )
    
    if not connected:
        return
    
    try:
        # Send initial connection confirmation
        await websocket.send_text(json.dumps({
            "type": "connection_established",
            "channel": "notifications",
            "message": "Connected to system notifications"
        }))
        
        # Keep connection alive
        while True:
            try:
                message = await websocket.receive_text()
                data = json.loads(message)
                
                # Handle ping/pong
                if data.get("type") == "ping":
                    await websocket.send_text(json.dumps({
                        "type": "pong",
                        "timestamp": data.get("timestamp")
                    }))
                
            except json.JSONDecodeError:
                await websocket.send_text(json.dumps({
                    "type": "error",
                    "message": "Invalid JSON message"
                }))
            except Exception as e:
                cluster_logger.error(f"Error handling notification WebSocket message: {e}")
                break
                
    except WebSocketDisconnect:
        cluster_logger.info("Notifications WebSocket disconnected")
    except Exception as e:
        cluster_logger.error(f"Notifications WebSocket error: {e}")
    finally:
        websocket_manager.disconnect(websocket)


@router.websocket("/admin/stats")
async def admin_stats_websocket(
    websocket: WebSocket,
    token: Optional[str] = None
):
    """
    WebSocket endpoint for real-time admin statistics.
    
    Provides:
    - Connection statistics
    - System metrics
    - Active users/jobs/tunnels counts
    """
    user_id = None
    if token:
        try:
            # Validate token and check admin permissions
            pass
        except Exception as e:
            cluster_logger.warning(f"Invalid admin WebSocket auth token: {e}")
            await websocket.close(code=1008, reason="Unauthorized")
            return
    
    connected = await websocket_manager.connect(
        websocket, 
        "admin_stats", 
        user_id
    )
    
    if not connected:
        return
    
    try:
        # Send initial stats
        stats = {
            "type": "stats_update",
            "channel_stats": websocket_manager.get_channel_stats(),
            "user_stats": websocket_manager.get_user_stats()
        }
        await websocket.send_text(json.dumps(stats))
        
        # Keep connection alive
        while True:
            try:
                message = await websocket.receive_text()
                data = json.loads(message)
                
                if data.get("type") == "ping":
                    await websocket.send_text(json.dumps({
                        "type": "pong",
                        "timestamp": data.get("timestamp")
                    }))
                elif data.get("type") == "get_stats":
                    # Send current stats
                    stats = {
                        "type": "stats_update",
                        "channel_stats": websocket_manager.get_channel_stats(),
                        "user_stats": websocket_manager.get_user_stats()
                    }
                    await websocket.send_text(json.dumps(stats))
                
            except json.JSONDecodeError:
                await websocket.send_text(json.dumps({
                    "type": "error",
                    "message": "Invalid JSON message"
                }))
            except Exception as e:
                cluster_logger.error(f"Error handling admin WebSocket message: {e}")
                break
                
    except WebSocketDisconnect:
        cluster_logger.info("Admin stats WebSocket disconnected")
    except Exception as e:
        cluster_logger.error(f"Admin stats WebSocket error: {e}")
    finally:
        websocket_manager.disconnect(websocket)
