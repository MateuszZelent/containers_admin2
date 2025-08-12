from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, Query
from app.websocket.manager import websocket_manager
from app.core.logging import cluster_logger
from app.core.auth import get_current_user_websocket
from app.db.session import get_db
from sqlalchemy.orm import Session
from typing import Optional
from datetime import datetime
import json
import random
import string

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
    print(f"DEBUG: WebSocket connection attempt to /jobs/status with token: {token[:20] if token else 'None'}...")
    print(f"DEBUG: User agent: {websocket.headers.get('user-agent', 'Unknown')}")
    print(f"DEBUG: Origin: {websocket.headers.get('origin', 'Unknown')}")
    
    # Get database session
    db = next(get_db())
    
    periodic_task = None

    try:
        # Authenticate user
        user = await get_current_user_websocket(token, db)
        user_id = str(user.id) if user else None
        
        print(f"DEBUG: Authentication successful for user: {user.username if user else 'anonymous'} (id: {user_id})")
        cluster_logger.info(f"WebSocket job_status connection attempt by user: {user.username if user else 'anonymous'}")
        
    except Exception as e:
        print(f"DEBUG: WebSocket authentication failed: {e}")
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

        # Send verification code
        verification_code = ''.join(
            random.choices(string.ascii_uppercase + string.digits, k=6)
        )
        await websocket.send_text(json.dumps({
            "type": "verification",
            "code": verification_code
        }))

        # Now: co 10 sekund wysyłaj nowy losowy kod do klienta
        import asyncio
        async def periodic_code_sender():
            # Send a heartbeat-like demo event every 10s.
            # Stop quietly on disconnect.
            while True:
                try:
                    await asyncio.sleep(10)
                    code = ''.join(
                        random.choices(
                            string.ascii_uppercase + string.digits, k=6
                        )
                    )
                    await websocket.send_text(json.dumps({
                        "type": "periodic_code",
                        "code": code
                    }))
                except Exception as e:
                    # Normal when the socket is closed; keep logs at debug
                    cluster_logger.debug(f"Stopping periodic_code_sender: {e}")
                    break

        periodic_task = asyncio.create_task(periodic_code_sender())

        # Obsługa wiadomości od klienta
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
            except WebSocketDisconnect as e:
                # Treat normal client close as expected
                cluster_logger.info(
                    "Job status client disconnected (code=%s)",
                    getattr(e, 'code', 'unknown')
                )
                break
            except Exception as e:
                cluster_logger.error(f"Error handling WebSocket message: {e}")
                break

        # Po wyjściu z pętli zatrzymaj task
        periodic_task.cancel()

    except WebSocketDisconnect:
        cluster_logger.info("Job status WebSocket disconnected")
    except Exception as e:
        cluster_logger.error(f"Job status WebSocket error: {e}")
    finally:
        if periodic_task:
            periodic_task.cancel()
        websocket_manager.disconnect(websocket)


@router.websocket("/tunnels/health")
async def tunnel_health_websocket(
    websocket: WebSocket,
    token: Optional[str] = Query(
        None, description="JWT or CLI token for authentication"
    )
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
        
        cluster_logger.info(
            "WebSocket tunnel_health connection by user: %s",
            user.username if user else 'anonymous'
        )
        
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

        verification_code = ''.join(
            random.choices(string.ascii_uppercase + string.digits, k=6)
        )
        await websocket.send_text(json.dumps({
            "type": "verification",
            "code": verification_code
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
                            "message": (
                                f"Subscribed to tunnel {tunnel_id} updates"
                            )
                        }))
                
            except json.JSONDecodeError:
                await websocket.send_text(json.dumps({
                    "type": "error",
                    "message": "Invalid JSON message"
                }))
            except WebSocketDisconnect as e:
                cluster_logger.info(
                    "Tunnel health client disconnected (code=%s)",
                    getattr(e, 'code', 'unknown')
                )
                break
            except Exception as e:
                cluster_logger.error(
                    "Error handling tunnel WebSocket message: %s", e
                )
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

        verification_code = ''.join(
            random.choices(string.ascii_uppercase + string.digits, k=6)
        )
        await websocket.send_text(json.dumps({
            "type": "verification",
            "code": verification_code
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
            except WebSocketDisconnect as e:
                cluster_logger.info(
                    "Notifications client disconnected (code=%s)",
                    getattr(e, 'code', 'unknown')
                )
                break
            except Exception as e:
                cluster_logger.error(
                    "Error handling notification WebSocket message: %s", e
                )
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

        verification_code = ''.join(
            random.choices(string.ascii_uppercase + string.digits, k=6)
        )
        await websocket.send_text(json.dumps({
            "type": "verification",
            "code": verification_code
        }))
        
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
                cluster_logger.error(
                    "Error handling admin WebSocket message: %s", e
                )
                break
                
    except WebSocketDisconnect:
        cluster_logger.info("Admin stats WebSocket disconnected")
    except Exception as e:
        cluster_logger.error(f"Admin stats WebSocket error: {e}")
    finally:
        websocket_manager.disconnect(websocket)


@router.websocket("/cluster/status")
async def cluster_status_websocket(
    websocket: WebSocket,
    token: Optional[str] = Query(
        None, description="JWT or CLI token for authentication"
    )
):
    """
    WebSocket endpoint for real-time cluster status updates.
    
    Authentication:
    - Pass token as query parameter: /ws/cluster/status?token=your_jwt_token
    - If no token provided and DISABLE_AUTH=True, allows anonymous access
    - If auth enabled, requires valid JWT or CLI token
    
    Clients will receive:
    - Cluster resource usage updates every 30 seconds
    - Node status changes
    - Queue statistics
    - Active session counts
    """
    print(
        "DEBUG: WebSocket connection attempt to /cluster/status with token: "
        f"{token[:20] if token else 'None'}..."
    )
    
    # Get database session
    db = next(get_db())
    
    try:
        # Authenticate user
        user = await get_current_user_websocket(token, db)
        user_id = str(user.id) if user else None
        
        print(f"DEBUG: Authentication successful for user: "
              f"{user.username if user else 'anonymous'} (id: {user_id})")
        cluster_logger.info(
            "WebSocket cluster_status connection attempt by user: %s",
            user.username if user else 'anonymous'
        )
        
    except Exception as e:
        print(f"DEBUG: WebSocket authentication failed: {e}")
        cluster_logger.warning(f"WebSocket authentication failed: {e}")
        await websocket.close(code=1008, reason="Authentication failed")
        return
    # Note: Keep db session open for cluster service

    connected = await websocket_manager.connect(
        websocket,
        "cluster_status",
        user_id
    )

    if not connected:
        db.close()
        await websocket.close(code=1011, reason="Connection failed")
        return

    periodic_task = None

    try:
        # Send initial connection confirmation
        await websocket.send_text(json.dumps({
            "type": "connection_established",
            "channel": "cluster_status",
            "message": "Connected to cluster status updates"
        }))

        # Import cluster monitoring service with db session
        from app.services.cluster_stats_monitor import (
            ClusterStatsMonitorService
        )
        cluster_service = ClusterStatsMonitorService(db)
        
        # Send initial cluster status
        try:
            cluster_logger.info("DEBUG: Fetching initial cluster status...")
            initial_status = await cluster_service.get_cluster_status_summary()
            cluster_logger.info(
                "DEBUG: Got initial status: %s", type(initial_status)
            )
            await websocket.send_text(json.dumps({
                "type": "cluster_status",
                "data": initial_status,
                "timestamp": datetime.utcnow().isoformat()
            }))
            cluster_logger.info("DEBUG: Sent initial cluster status")
        except Exception as e:
            cluster_logger.error(f"Error getting initial cluster status: {e}")
            import traceback
            cluster_logger.error(f"Traceback: {traceback.format_exc()}")

        # Start periodic status updates
        import asyncio
        
        async def periodic_status_sender():
            while True:
                await asyncio.sleep(30)  # Update every 30 seconds
                try:
                    status = await cluster_service.get_cluster_status_summary()
                    await websocket.send_text(json.dumps({
                        "type": "cluster_status",
                        "data": status,
                        "timestamp": datetime.utcnow().isoformat()
                    }))
                except Exception as e:
                    cluster_logger.error(
                        "Error sending periodic cluster status: %s", e
                    )
                    break

        # Start the periodic task
        periodic_task = asyncio.create_task(periodic_status_sender())

        # Listen for messages (for heartbeat/ping)
        while True:
            try:
                message = await websocket.receive_text()
                data = json.loads(message)
                
                if data.get("type") == "ping":
                    # Respond to ping with pong
                    await websocket.send_text(json.dumps({
                        "type": "pong",
                        "timestamp": datetime.utcnow().isoformat()
                    }))
                elif data.get("type") == "request_status":
                    # Send immediate status update
                    try:
                        status = await cluster_service.\
                            get_cluster_status_summary()
                        await websocket.send_text(json.dumps({
                            "type": "cluster_status",
                            "data": status,
                            "timestamp": datetime.utcnow().isoformat()
                        }))
                    except Exception as e:
                        cluster_logger.error(
                            "Error sending requested cluster status: %s", e
                        )
                        
            except json.JSONDecodeError as e:
                cluster_logger.error(
                    "JSON decode error: %s, message was: %s",
                    e,
                    repr(message)
                )
                await websocket.send_text(json.dumps({
                    "type": "error",
                    "message": "Invalid JSON message"
                }))
            except WebSocketDisconnect:
                cluster_logger.info("Cluster status WebSocket disconnected")
                break
            except Exception as e:
                cluster_logger.error(
                    "Error handling cluster status WebSocket message: %s",
                    e
                )
                cluster_logger.error(
                    "Message was: %s",
                    repr(message) if 'message' in locals() else 'no message'
                )
                cluster_logger.error(
                    "Data was: %s",
                    repr(data) if 'data' in locals() else 'no data'
                )
                import traceback
                cluster_logger.error(f"Traceback: {traceback.format_exc()}")
                break

        # Cancel periodic task when loop exits
        periodic_task.cancel()

    except WebSocketDisconnect:
        cluster_logger.info("Cluster status WebSocket disconnected")
    except Exception as e:
        cluster_logger.error(f"Cluster status WebSocket error: {e}")
    finally:
        if periodic_task:
            periodic_task.cancel()
        websocket_manager.disconnect(websocket)
        db.close()  # Close database session


@router.websocket("/tunnels/setup")
async def tunnel_setup_websocket(
    websocket: WebSocket,
    job_id: int = Query(..., description="Job ID to monitor tunnel setup for"),
    token: Optional[str] = Query(
        None, description="JWT or CLI token for authentication"
    )
):
    """
    WebSocket endpoint for real-time tunnel setup monitoring.
    
    Authentication: Same as other endpoints
    
    Clients will receive:
    - Step-by-step tunnel creation progress
    - SSH connection status
    - Port allocation updates
    - Socat forwarding status
    - Domain configuration progress
    - Final accessibility verification
    """
    print(f"DEBUG: WebSocket tunnel setup connection for job_id={job_id} "
          f"with token: {token[:20] if token else 'None'}...")
    
    # Get database session
    db = next(get_db())
    
    try:
        # Authenticate user
        user = await get_current_user_websocket(token, db)
        user_id = str(user.id) if user else None
        
        print(f"DEBUG: Tunnel setup authentication successful for user: "
              f"{user.username if user else 'anonymous'} (id: {user_id})")
        cluster_logger.info(
            f"WebSocket tunnel_setup connection by user: "
            f"{user.username if user else 'anonymous'} for job {job_id}"
        )
        
    except Exception as e:
        print(f"DEBUG: WebSocket tunnel setup authentication failed: {e}")
        cluster_logger.warning(f"WebSocket tunnel setup auth failed: {e}")
        await websocket.close(code=1008, reason="Authentication failed")
        return
    finally:
        db.close()
    
    # Connect to job-specific tunnel setup channel
    channel = f"tunnel_setup_{job_id}"
    connected = await websocket_manager.connect(
        websocket,
        channel,
        user_id
    )
    
    if not connected:
        await websocket.close(code=1011, reason="Connection failed")
        return
    
    try:
        # Send initial connection confirmation
        await websocket.send_text(json.dumps({
            "type": "connection_established",
            "channel": "tunnel_setup",
            "job_id": job_id,
            "message": f"Connected to tunnel setup monitoring for job {job_id}"
        }))
        
        # Keep connection alive
        while True:
            try:
                message = await websocket.receive_text()
                data = json.loads(message)
                
                print(f"DEBUG: Tunnel setup WebSocket received: {data}")
                
                # Handle ping/pong
                if data.get("type") == "ping":
                    await websocket.send_text(json.dumps({
                        "type": "pong",
                        "timestamp": data.get("timestamp")
                    }))
                    print("DEBUG: Sent pong response")
                
            except json.JSONDecodeError:
                await websocket.send_text(json.dumps({
                    "type": "error",
                    "message": "Invalid JSON message"
                }))
            except WebSocketDisconnect as e:
                cluster_logger.info(
                    "Tunnel setup client disconnected for job %s (code=%s)",
                    job_id,
                    getattr(e, 'code', 'unknown')
                )
                break
            except Exception as e:
                cluster_logger.error(
                    f"Error handling tunnel setup WebSocket message: {e}"
                )
                # Don't break - continue processing other messages
                await websocket.send_text(json.dumps({
                    "type": "error",
                    "message": f"Error processing message: {str(e)}"
                }))
                
    except WebSocketDisconnect:
        cluster_logger.info(
            f"Tunnel setup WebSocket disconnected for job {job_id}"
        )
    except Exception as e:
        cluster_logger.error(
            f"Tunnel setup WebSocket error for job {job_id}: {e}"
        )
    finally:
        websocket_manager.disconnect(websocket)
