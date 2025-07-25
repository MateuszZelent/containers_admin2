import { useState, useEffect, useRef, useCallback } from 'react';

export interface WebSocketMessage {
  type: string;
  timestamp: string;
  channel: string;
  [key: string]: any;
}

interface UseWebSocketProps {
  url: string;
  onMessage?: (data: WebSocketMessage) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Event) => void;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  enabled?: boolean;
}

interface UseWebSocketReturn {
  isConnected: boolean;
  lastMessage: WebSocketMessage | null;
  sendMessage: (data: any) => void;
  connect: () => void;
  disconnect: () => void;
  reconnectCount: number;
}

// Global connection debounce to prevent Hot Refresh storms
const connectionDebounce = new Map<string, NodeJS.Timeout>();
const activeConnections = new Map<string, WebSocket>();

export const useWebSocket = ({
  url,
  onMessage,
  onConnect,
  onDisconnect,
  onError,
  reconnectInterval = 3000,
  maxReconnectAttempts = 5,
  enabled = true
}: UseWebSocketProps): UseWebSocketReturn => {
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  const [reconnectCount, setReconnectCount] = useState(0);
  
  const ws = useRef<WebSocket | null>(null);
  const reconnectTimeout = useRef<NodeJS.Timeout | null>(null);
  const shouldConnect = useRef(enabled);

  const getWebSocketUrl = useCallback(() => {
    // Determine protocol based on current page protocol
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    
    // Determine host and port
    let host: string;
    const currentHost = window.location.hostname;
    const currentPort = window.location.port;
    
    // Check if we're running locally (development) or on production domain
    const isLocalDevelopment = currentHost === 'localhost' || currentHost === '127.0.0.1';
    const isProductionDomain = currentHost.includes('amucontainers.orion.zfns.eu.org');
    
    if (isLocalDevelopment) {
      // Local development - connect directly to backend port
      host = 'localhost:8000';
    } else if (isProductionDomain) {
      // Production domain - use same host without explicit port (Caddy handles routing)
      // Frontend is served on 443 (HTTPS), Caddy routes /ws/* to backend:8000 internally
      host = currentHost; // No port - use default HTTPS port 443
    } else {
      // Network development (IP address or other hostname)
      // Try to connect directly to port 8000
      host = `${currentHost}:8000`;
    }
    
    // Get auth token from localStorage
    const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
    
    // Build URL with token as query parameter
    const baseUrl = `${protocol}//${host}${url}`;
    if (token) {
      const separator = url.includes('?') ? '&' : '?';
      return `${baseUrl}${separator}token=${encodeURIComponent(token)}`;
    }
    
    return baseUrl;
  }, [url]);

  const sendMessage = useCallback((data: any) => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(data));
    } else {
      console.warn('WebSocket is not connected. Cannot send message:', data);
    }
  }, []);

  const connect = useCallback(() => {
    if (!shouldConnect.current || 
        ws.current?.readyState === WebSocket.OPEN || 
        ws.current?.readyState === WebSocket.CONNECTING) {
      console.log('WebSocket already connected or connecting, skipping...');
      return;
    }

    // Debounce connections to prevent Hot Refresh storms
    const debounceKey = `${url}-${enabled}`;
    if (connectionDebounce.has(debounceKey)) {
      clearTimeout(connectionDebounce.get(debounceKey)!);
    }

    connectionDebounce.set(debounceKey, setTimeout(() => {
      connectionDebounce.delete(debounceKey);
      
      try {
        const wsUrl = getWebSocketUrl();
        console.log(`Connecting to WebSocket: ${wsUrl}`);
        
        ws.current = new WebSocket(wsUrl);
        
        ws.current.onopen = () => {
          console.log(`WebSocket connected: ${url}`);
          setIsConnected(true);
          setReconnectCount(0);
          onConnect?.();
          
          // Send ping to keep connection alive - direct send to avoid circular dependency
          if (ws.current && ws.current.readyState === WebSocket.OPEN) {
            ws.current.send(JSON.stringify({ type: 'ping', timestamp: new Date().toISOString() }));
          }
        };
        
        ws.current.onmessage = (event) => {
          try {
            const data: WebSocketMessage = JSON.parse(event.data);
            setLastMessage(data);
            
            // Handle pong messages
            if (data.type === 'pong') {
              console.debug('Received pong from server');
              return;
            }
            
            onMessage?.(data);
          } catch (error) {
            console.error('Error parsing WebSocket message:', error);
          }
        };
        
        ws.current.onclose = (event) => {
          console.log(`WebSocket disconnected: ${url}`, event.code, event.reason);
          setIsConnected(false);
          onDisconnect?.();
          
          // Attempt to reconnect if enabled and within retry limits
          if (shouldConnect.current && reconnectCount < maxReconnectAttempts) {
            setReconnectCount(prev => prev + 1);
            // Use exponential backoff: min 1s, max 30s
            const delay = Math.min(1000 * Math.pow(2, reconnectCount), 30000);
            console.log(`Reconnecting in ${delay}ms (attempt ${reconnectCount + 1}/${maxReconnectAttempts})`);
            
            reconnectTimeout.current = setTimeout(() => {
              connect();
            }, delay);
          } else if (reconnectCount >= maxReconnectAttempts) {
            console.error(`Max reconnection attempts (${maxReconnectAttempts}) reached for ${url}`);
          }
        };
        
        ws.current.onerror = (error) => {
          console.error(`WebSocket error: ${url}`, error);
          onError?.(error);
        };
        
      } catch (error) {
        console.error('WebSocket connection failed:', error);
      }
    }, 500)); // 500ms debounce delay
  }, [url, getWebSocketUrl, onConnect, onMessage, onDisconnect, onError, 
      reconnectInterval, maxReconnectAttempts, reconnectCount]);

  const disconnect = useCallback(() => {
    shouldConnect.current = false;
    
    if (reconnectTimeout.current) {
      clearTimeout(reconnectTimeout.current);
    }
    
    if (ws.current) {
      ws.current.close(1000, 'Manual disconnect');
      ws.current = null;
    }
    
    setIsConnected(false);
    setReconnectCount(0);
  }, []);

  useEffect(() => {
    shouldConnect.current = enabled;
    
    // Add delay to prevent Hot Refresh connection storm
    const hotRefreshDelay = setTimeout(() => {
      if (enabled) {
        connect();
      } else {
        disconnect();
      }
    }, 100); // 100ms delay

    return () => {
      clearTimeout(hotRefreshDelay);
      disconnect();
    };
  }, [enabled]); // Remove connect/disconnect from dependencies to prevent infinite loop

  return {
    isConnected,
    lastMessage,
    sendMessage,
    connect,
    disconnect,
    reconnectCount
  };
};
