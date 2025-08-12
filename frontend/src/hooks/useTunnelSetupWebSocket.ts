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
    // Normalize and accept broader event variants from backend
    const normalize = (msg: any): TunnelSetupEvent | null => {
      if (!msg || typeof msg !== 'object') return null;
      if (!msg.type && msg.event) msg.type = msg.event;
      if (!msg.message && msg.msg) msg.message = msg.msg;

      // Map some legacy or alternative backend event names
      const mappings: Record<string, TunnelSetupEvent['type']> = {
        connecting: 'tunnel_connecting',
        progress: 'tunnel_progress',
        established: 'tunnel_established',
        warning: 'tunnel_warning',
        error: 'tunnel_error',
        setup_begin: 'setup_started',
        setup_start: 'setup_started',
        setup_ok: 'setup_complete',
      };

      let type = msg.type as string;
      if (type in mappings) type = mappings[type];

      // Only allow the supported set
      const allowed = new Set([
        'tunnel_connecting', 'tunnel_progress', 'tunnel_established', 'tunnel_error', 'tunnel_warning',
        'setup_started', 'setup_progress', 'setup_error', 'setup_complete'
      ]);

      if (!type || !allowed.has(type as any)) return null;
      if (!msg.message) msg.message = '';

      return {
        type: type as TunnelSetupEvent['type'],
        message: String(msg.message),
        step: msg.step,
        tunnel_id: msg.tunnel_id ?? msg.tunnelId,
        details: msg.details,
        error: msg.error
      };
    };

    const normalized = normalize(message);
    if (normalized) {
      onEvent?.(normalized);
    } else {
      // Non-fatal: log unknown messages for debugging
      console.debug('[useTunnelSetupWebSocket] Ignoring non-setup message:', message);
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
