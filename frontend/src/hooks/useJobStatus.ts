import { useCallback, useState } from 'react';
import { useWebSocket, WebSocketMessage } from './useWebSocket';

export interface JobStatusUpdate {
  job_id: number;
  status: string;
  message?: string;
  timestamp: string;
}

export interface TunnelStatusUpdate {
  tunnel_id: number;
  job_id: number;
  status: string;
  health_status?: string;
  external_port?: number;
  ssh_pid?: number;
  socat_pid?: number;
  message?: string;
  timestamp: string;
}

interface UseJobStatusProps {
  onJobUpdate?: (update: JobStatusUpdate) => void;
  onTunnelUpdate?: (update: TunnelStatusUpdate) => void;
  onNotification?: (notification: any) => void;
  enabled?: boolean;
  // Selective channel enabling - NOWA FUNKCJONALNOŚĆ
  enableJobStatus?: boolean;
  enableTunnelHealth?: boolean;
  enableNotifications?: boolean;
}

interface UseJobStatusReturn {
  isJobStatusConnected: boolean;
  isTunnelHealthConnected: boolean;
  isNotificationsConnected: boolean;
  subscribeToJob: (jobId: number) => void;
  subscribeToTunnel: (tunnelId: number) => void;
  verificationCode: string | null;
  reconnectCounts: {
    jobStatus: number;
    tunnelHealth: number;
    notifications: number;
  };
}

export const useJobStatus = ({
  onJobUpdate,
  onTunnelUpdate,
  onNotification,
  enabled = true,
  // Selective enabling - domyślnie włączone dla kompatybilności wstecznej
  enableJobStatus = true,
  enableTunnelHealth = true,
  enableNotifications = true
}: UseJobStatusProps): UseJobStatusReturn => {

  // Check if user is authenticated
  const isAuthenticated = typeof window !== "undefined" && localStorage.getItem("auth_token") !== null;

  const [verificationCode, setVerificationCode] = useState<string | null>(null);

  // Job Status WebSocket
  const handleJobMessage = useCallback((message: WebSocketMessage) => {
    console.log('Job status message:', message);
    
    switch (message.type) {
      case 'verification':
      case 'periodic_code':
        setVerificationCode(message.code ?? null);
        break;
      case 'job_status_update':
      case 'job_created':
      case 'job_deleted':
        if (onJobUpdate && message.data) {
          onJobUpdate({
            job_id: message.job_id || message.data.job_id,
            status: message.data.status,
            message: message.data.message,
            timestamp: message.timestamp
          });
        }
        break;
      case 'connection_established':
        console.log('Connected to job status updates');
        break;
      default:
        console.debug('Unhandled job message type:', message.type);
    }
  }, [onJobUpdate]);

  const {
    isConnected: isJobStatusConnected,
    sendMessage: sendJobMessage,
    reconnectCount: jobStatusReconnectCount
  } = useWebSocket({
    url: '/ws/jobs/status',
    onMessage: handleJobMessage,
    enabled: enabled && enableJobStatus && (isAuthenticated || process.env.NODE_ENV === 'development')
  });

  // Tunnel Health WebSocket
  const handleTunnelMessage = useCallback((message: WebSocketMessage) => {
    console.log('Tunnel health message:', message);
    
    switch (message.type) {
      case 'verification':
        setVerificationCode(message.code ?? null);
        break;
      case 'tunnel_created':
      case 'tunnel_active':
      case 'tunnel_failed':
      case 'tunnel_closed':
      case 'tunnel_health_update':
        if (onTunnelUpdate && message.data) {
          onTunnelUpdate({
            tunnel_id: message.tunnel_id || message.data.tunnel_id,
            job_id: message.job_id || message.data.job_id,
            status: message.data.status,
            health_status: message.data.health_status,
            external_port: message.data.external_port,
            ssh_pid: message.data.ssh_pid,
            socat_pid: message.data.socat_pid,
            message: message.data.message,
            timestamp: message.timestamp
          });
        }
        break;
      case 'connection_established':
        console.log('Connected to tunnel health updates');
        break;
      default:
        console.debug('Unhandled tunnel message type:', message.type);
    }
  }, [onTunnelUpdate]);

  const {
    isConnected: isTunnelHealthConnected,
    sendMessage: sendTunnelMessage,
    reconnectCount: tunnelHealthReconnectCount
  } = useWebSocket({
    url: '/ws/tunnels/health',
    onMessage: handleTunnelMessage,
    enabled: enabled && enableTunnelHealth && (isAuthenticated || process.env.NODE_ENV === 'development')
  });

  // Notifications WebSocket
  const handleNotificationMessage = useCallback((message: WebSocketMessage) => {
    console.log('Notification message:', message);
    
    switch (message.type) {
      case 'verification':
        setVerificationCode(message.code ?? null);
        break;
      case 'notification':
      case 'alert':
      case 'warning':
      case 'error':
      case 'test_data': // Add test_data handling
        if (onNotification) {
          onNotification({
            type: message.type,
            message: message.data?.message || message.message,
            level: message.data?.level || 'info',
            timestamp: message.timestamp,
            random_number: message.random_number, // Add random_number for test_data
            ...message.data
          });
        }
        break;
      case 'connection_established':
        console.log('Connected to notifications');
        break;
      default:
        console.debug('Unhandled notification message type:', message.type);
    }
  }, [onNotification]);

  const {
    isConnected: isNotificationsConnected,
    sendMessage: sendNotificationMessage,
    reconnectCount: notificationsReconnectCount
  } = useWebSocket({
    url: '/ws/notifications',
    onMessage: handleNotificationMessage,
    enabled: enabled && enableNotifications && (isAuthenticated || process.env.NODE_ENV === 'development')
  });

  // Helper functions
  const subscribeToJob = useCallback((jobId: number) => {
    if (isJobStatusConnected) {
      sendJobMessage({
        type: 'subscribe_job',
        job_id: jobId
      });
    }
  }, [isJobStatusConnected, sendJobMessage]);

  const subscribeToTunnel = useCallback((tunnelId: number) => {
    if (isTunnelHealthConnected) {
      sendTunnelMessage({
        type: 'subscribe_tunnel',
        tunnel_id: tunnelId
      });
    }
  }, [isTunnelHealthConnected, sendTunnelMessage]);

  return {
    isJobStatusConnected,
    isTunnelHealthConnected,
    isNotificationsConnected,
    subscribeToJob,
    subscribeToTunnel,
    verificationCode,
    reconnectCounts: {
      jobStatus: jobStatusReconnectCount,
      tunnelHealth: tunnelHealthReconnectCount,
      notifications: notificationsReconnectCount
    }
  };
};
