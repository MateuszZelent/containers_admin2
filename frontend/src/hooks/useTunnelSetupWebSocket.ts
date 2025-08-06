import { useCallback } from 'react';
import { useWebSocket } from './useWebSocket';

export interface TunnelSetupEvent {
  type: 'tunnel_connecting' | 'tunnel_progress' | 'tunnel_established' | 'tunnel_error' | 'tunnel_warning' | 
        'setup_started' | 'setup_progress' | 'setup_error' | 'setup_complete';
  message: string;
  step?: string;
  tunnel_id?: number;
  details?: any;
  error?: string;
}

export interface UseTunnelSetupWebSocketProps {
  jobId: number;
  enabled: boolean;
  onEvent?: (event: TunnelSetupEvent) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: string) => void;
}

export function useTunnelSetupWebSocket({
  jobId,
  enabled,
  onEvent,
  onConnect,
  onDisconnect,
  onError
}: UseTunnelSetupWebSocketProps) {
  
  // Handle WebSocket messages
  const handleMessage = useCallback((message: any) => {
    console.log('Received tunnel setup event:', message);
    
    // Check if this is a tunnel setup event
    if (message.type && message.message && 
        ['tunnel_connecting', 'tunnel_progress', 'tunnel_established', 'tunnel_error', 'tunnel_warning',
         'setup_started', 'setup_progress', 'setup_error', 'setup_complete'].includes(message.type)) {
      onEvent?.(message as TunnelSetupEvent);
    } else {
      console.warn('Invalid tunnel setup event format:', message);
    }
  }, [onEvent]);

  // Use the existing WebSocket hook with authentication built-in
  const {
    isConnected,
    connect,
    disconnect
  } = useWebSocket({
    url: `/ws/tunnels/setup?job_id=${jobId}`,
    enabled,
    onMessage: handleMessage,
    onConnect: () => {
      console.log('Tunnel setup WebSocket connected');
      onConnect?.();
    },
    onDisconnect: () => {
      console.log('Tunnel setup WebSocket disconnected');
      onDisconnect?.();
    },
    onError: (error: Event) => {
      console.error('Tunnel setup WebSocket error:', error);
      onError?.(error.toString());
    }
  });

  return {
    isConnected,
    connect,
    disconnect,
    connectionAttempts: 0 // useWebSocket handles reconnection internally
  };
}
