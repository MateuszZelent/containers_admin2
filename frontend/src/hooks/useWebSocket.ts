import { useState, useEffect, useCallback } from 'react';
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
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  const [reconnectCount, setReconnectCount] = useState(0);

  // Subscribe to WebSocket using global manager
  useEffect(() => {
    if (!enabled || !url) return;

    console.log(`[useWebSocket] Subscribing to: ${url}`);
    
    const unsubscribe = wsManager.subscribe(url, {
      onMessage: (data) => {
        setLastMessage(data);
        onMessage?.(data);
      },
      onConnect: () => {
        setIsConnected(true);
        setReconnectCount(0);
        onConnect?.();
      },
      onDisconnect: () => {
        setIsConnected(false);
        onDisconnect?.();
      },
      onError: (error) => {
        setIsConnected(false);
        setReconnectCount(prev => prev + 1);
        onError?.(error);
      }
    });

    // Update initial connection state
    setIsConnected(wsManager.isConnected(url));

    return unsubscribe;
  }, [url, enabled, onMessage, onConnect, onDisconnect, onError]);

  const sendMessage = useCallback((data: any) => {
    if (!wsManager.sendMessage(url, data)) {
      console.warn(`[useWebSocket] Failed to send message to: ${url}`);
    }
  }, [url]);

  const connect = useCallback(() => {
    console.log(`[useWebSocket] Manual connect requested for: ${url}`);
    wsManager.forceReconnect(url);
  }, [url]);

  const disconnect = useCallback(() => {
    console.log(`[useWebSocket] Manual disconnect requested for: ${url}`);
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
