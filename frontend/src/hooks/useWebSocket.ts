import { useState, useEffect, useCallback, useRef } from 'react';
import { wsManager } from '@/lib/websocket-manager';
import type { WebSocketMessage } from '@/lib/websocket-manager';

// Re-export for compatibility
export type { WebSocketMessage };

interface UseWebSocketProps {
  url: string;
  onMessage?: (data: WebSocketMessage) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Event) => void;
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

export const useWebSocket = ({
  url,
  onMessage,
  onConnect,
  onDisconnect,
  onError,
  enabled = true
}: UseWebSocketProps): UseWebSocketReturn => {
  // Use wsManager directly, don't require it inside the component
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  const [reconnectCount, setReconnectCount] = useState(0);
  
  // Use refs for callback handlers to avoid unnecessary effect triggers
  const onMessageRef = useRef(onMessage);
  const onConnectRef = useRef(onConnect);
  const onDisconnectRef = useRef(onDisconnect);
  const onErrorRef = useRef(onError);
  
  // Update refs when callbacks change
  useEffect(() => {
    onMessageRef.current = onMessage;
    onConnectRef.current = onConnect;
    onDisconnectRef.current = onDisconnect;
    onErrorRef.current = onError;
  }, [onMessage, onConnect, onDisconnect, onError]);

  // Generate a stable ID for this hook instance that persists across renders
  const hookIdRef = useRef<string>("");
  if (!hookIdRef.current) {
    hookIdRef.current = `hook_${Math.random().toString(36).substring(2, 9)}_${Date.now()}`;
  }

  // Subscribe to WebSocket using global manager
  useEffect(() => {
    if (!enabled || !url) return;

    const hookId = hookIdRef.current;
    
    // Create WebSocket connection with stable callbacks
    const unsubscribe = wsManager.subscribe(url, {
      id: hookId,
      onMessage: (data: WebSocketMessage) => {
        setLastMessage(data);
        onMessageRef.current?.(data);
      },
      onConnect: () => {
        setIsConnected(true);
        setReconnectCount(0);
        onConnectRef.current?.();
      },
      onDisconnect: () => {
        setIsConnected(false);
        onDisconnectRef.current?.();
      },
      onError: (error: Event) => {
        setIsConnected(false);
        setReconnectCount(prev => prev + 1);
        onErrorRef.current?.(error);
      }
    });

    // Update initial connection state
    setIsConnected(wsManager.isConnected(url));

    return () => {
      // Cleanup subscription on unmount or when dependencies change
      unsubscribe();
    };
  }, [url, enabled]); // Only re-subscribe when url or enabled changes

  const sendMessage = useCallback((data: any) => {
    if (!wsManager.sendMessage(url, data)) {
      console.warn(`[useWebSocket] Failed to send message to: ${url}`);
    }
  }, [url]);

  const connect = useCallback(() => {
    wsManager.forceReconnect(url);
  }, [url]);

  const disconnect = useCallback(() => {
    wsManager.disconnect(url);
  }, [url]);

  return {
    isConnected,
    lastMessage,
    sendMessage,
    connect,
    disconnect,
    reconnectCount
  };
};
