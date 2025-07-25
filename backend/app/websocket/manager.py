from fastapi import WebSocket
from typing import Dict, List, Optional, Any
import json
import asyncio
import logging
from datetime import datetime
from app.core.logging import cluster_logger

logger = logging.getLogger(__name__)


class ConnectionManager:
    """
    WebSocket Connection Manager for real-time communication.
    
    Manages WebSocket connections organized by channels for different
    types of real-time updates (jobs, tunnels, notifications, etc.)
    """
    
    def __init__(self):
        # Store connections by channel: {channel_name: [websockets]}
        self.active_connections: Dict[str, List[WebSocket]] = {}
        # Store user-specific connections: {user_id: {channel: [websockets]}}
        self.user_connections: Dict[str, Dict[str, List[WebSocket]]] = {}
        # Connection metadata
        self.connection_metadata: Dict[WebSocket, Dict[str, Any]] = {}
    
    async def connect(self, websocket: WebSocket, channel: str, user_id: Optional[str] = None):
        """Connect a WebSocket to a specific channel."""
        try:
            print(f"DEBUG: Attempting to connect WebSocket to channel '{channel}' for user '{user_id}'")
            await websocket.accept()
            print(f"DEBUG: WebSocket accepted successfully")
            
            # Add to channel connections
            if channel not in self.active_connections:
                self.active_connections[channel] = []
            self.active_connections[channel].append(websocket)
            print(f"DEBUG: Added to channel '{channel}', now has {len(self.active_connections[channel])} connections")
            
            # Add to user connections if user_id provided
            if user_id:
                if user_id not in self.user_connections:
                    self.user_connections[user_id] = {}
                if channel not in self.user_connections[user_id]:
                    self.user_connections[user_id][channel] = []
                self.user_connections[user_id][channel].append(websocket)
                print(f"DEBUG: Added to user '{user_id}' channel '{channel}', user now has {len(self.user_connections[user_id][channel])} connections in this channel")
            
            # Store metadata
            self.connection_metadata[websocket] = {
                "channel": channel,
                "user_id": user_id,
                "connected_at": datetime.utcnow(),
                "last_ping": datetime.utcnow()
            }
            
            # Print current state after adding connection
            total_connections = sum(len(conns) for conns in self.active_connections.values())
            print(f"DEBUG: Connection registered successfully!")
            print(f"DEBUG: Total connections: {total_connections}")
            print(f"DEBUG: Total users: {len(self.user_connections)}")
            print(f"DEBUG: All channels: {list(self.active_connections.keys())}")
            
            cluster_logger.info(f"WebSocket connected to channel '{channel}' (user: {user_id})")
            return True
            
        except Exception as e:
            cluster_logger.error(f"Error connecting WebSocket to channel '{channel}': {e}")
            return False
    
    def disconnect(self, websocket: WebSocket):
        """Disconnect a WebSocket from all channels."""
        try:
            print(f"DEBUG: Starting disconnect for WebSocket {id(websocket)}")
            metadata = self.connection_metadata.get(websocket)
            if not metadata:
                print(f"DEBUG: No metadata found for WebSocket {id(websocket)}, already disconnected?")
                return
                
            channel = metadata["channel"]
            user_id = metadata["user_id"]
            print(f"DEBUG: Disconnecting WebSocket from channel '{channel}' (user: {user_id})")
            
            # Remove from channel connections
            if channel in self.active_connections:
                if websocket in self.active_connections[channel]:
                    self.active_connections[channel].remove(websocket)
                    print(f"DEBUG: Removed from channel '{channel}', remaining: {len(self.active_connections[channel])}")
                    
                # Clean up empty channels
                if not self.active_connections[channel]:
                    del self.active_connections[channel]
                    print(f"DEBUG: Cleaned up empty channel '{channel}'")
            
            # Remove from user connections
            if user_id and user_id in self.user_connections:
                if channel in self.user_connections[user_id]:
                    if websocket in self.user_connections[user_id][channel]:
                        self.user_connections[user_id][channel].remove(websocket)
                        print(f"DEBUG: Removed from user '{user_id}' channel '{channel}', remaining: {len(self.user_connections[user_id][channel])}")
                    
                    # Clean up empty user channels
                    if not self.user_connections[user_id][channel]:
                        del self.user_connections[user_id][channel]
                        print(f"DEBUG: Cleaned up empty user channel '{user_id}':'{channel}'")
                        
                # Clean up empty user entries
                if not self.user_connections[user_id]:
                    del self.user_connections[user_id]
                    print(f"DEBUG: Cleaned up empty user entry '{user_id}'")
            
            # Remove metadata
            if websocket in self.connection_metadata:
                del self.connection_metadata[websocket]
                print(f"DEBUG: Removed metadata for WebSocket {id(websocket)}")
                
            print(f"DEBUG: Disconnect completed. Total connections: {sum(len(conns) for conns in self.active_connections.values())}, Total users: {len(self.user_connections)}")
            cluster_logger.info(f"WebSocket disconnected from channel '{channel}' (user: {user_id})")
            
        except Exception as e:
            print(f"DEBUG: Error during disconnect: {e}")
            cluster_logger.error(f"Error disconnecting WebSocket: {e}")
    
    async def broadcast_to_channel(self, channel: str, data: dict):
        """Broadcast message to all connections in a channel."""
        if channel not in self.active_connections:
            return 0
        
        message = json.dumps({
            **data,
            "timestamp": datetime.utcnow().isoformat(),
            "channel": channel
        })
        
        sent_count = 0
        broken_connections = []
        
        for connection in self.active_connections[channel]:
            try:
                await connection.send_text(message)
                sent_count += 1
            except Exception as e:
                cluster_logger.warning(f"Failed to send message to WebSocket: {e}")
                broken_connections.append(connection)
        
        # Clean up broken connections
        for broken_connection in broken_connections:
            self.disconnect(broken_connection)
        
        if sent_count > 0:
            cluster_logger.debug(f"Broadcasted to {sent_count} connections in channel '{channel}'")
        
        return sent_count
    
    async def send_to_user(self, user_id: str, channel: str, data: dict):
        """Send message to specific user's connections in a channel."""
        if user_id not in self.user_connections:
            return 0
            
        if channel not in self.user_connections[user_id]:
            return 0
        
        message = json.dumps({
            **data,
            "timestamp": datetime.utcnow().isoformat(),
            "channel": channel
        })
        
        sent_count = 0
        broken_connections = []
        
        for connection in self.user_connections[user_id][channel]:
            try:
                await connection.send_text(message)
                sent_count += 1
            except Exception as e:
                cluster_logger.warning(f"Failed to send message to user {user_id}: {e}")
                broken_connections.append(connection)
        
        # Clean up broken connections
        for broken_connection in broken_connections:
            self.disconnect(broken_connection)
        
        return sent_count
    
    def get_channel_stats(self) -> Dict[str, int]:
        """Get statistics about active connections per channel."""
        return {
            channel: len(connections) 
            for channel, connections in self.active_connections.items()
        }
    
    def get_user_stats(self) -> Dict[str, int]:
        """Get statistics about active users."""
        return {
            user_id: sum(len(connections) for connections in channels.values())
            for user_id, channels in self.user_connections.items()
        }
    
    def get_connection_stats(self) -> Dict[str, Any]:
        """Get comprehensive connection statistics."""
        total_connections = sum(
            len(connections) for connections in self.active_connections.values()
        )
        
        return {
            "total_connections": total_connections,
            "connections_by_channel": self.get_channel_stats(),
            "active_users": len(self.user_connections),
            "user_stats": self.get_user_stats(),
            "channels": list(self.active_connections.keys()),
            "metadata_count": len(self.connection_metadata)
        }
    
    async def ping_all_connections(self):
        """Send ping to all connections to check health."""
        ping_data = {"type": "ping", "timestamp": datetime.utcnow().isoformat()}
        
        for channel in list(self.active_connections.keys()):
            await self.broadcast_to_channel(channel, ping_data)


# Global connection manager instance
websocket_manager = ConnectionManager()
