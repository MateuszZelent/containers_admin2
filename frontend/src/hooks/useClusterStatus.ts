import { useState, useEffect, useCallback, useRef } from 'react';
import { useWebSocket } from './useWebSocket';
import { showToast } from '@/lib/toast-helpers';
import { debugLog } from '@/lib/debug';
// import { clusterApi } from '@/lib/api-client'; // DISABLED - WebSocket only

export interface ClusterNode {
  name: string;
  state: string;
  cpus: number;
  memory: number;
  partitions: string[];
  used_cpus: number;
  used_memory: number;
  available_cpus: number;
  available_memory: number;
}

export interface ClusterStatus {
  nodes: ClusterNode[];
  // Raw node data from WebSocket (from check.sh)
  raw_nodes?: {
    free: number;
    busy: number;
    sleeping: number;
    total: number;
    available: number;
  };
  // Raw GPU data from WebSocket (from check.sh)
  raw_gpus?: {
    free: number;
    busy: number;
    total: number;
    available: number;
  };
  total_cpus: number;
  total_memory: number;
  used_cpus: number;
  used_memory: number;
  available_cpus: number;
  available_memory: number;
  queue_stats: {
    running: number;
    pending: number;
    completed: number;
    failed: number;
  };
  active_sessions: {
    active_users: number;
    total_connections: number;
    connections_by_channel: Record<string, number>;
  };
}

interface UseClusterStatusReturn {
  clusterStatus: ClusterStatus | null;
  loading: boolean;
  error: string | null;
  lastUpdate: Date | null;
  isWebSocketActive: boolean;
  requestStatusUpdate: () => void;
}

// DISABLED - API fallback completely removed to use WebSocket only
const RECONNECT_INTERVAL = 5000; // Try to reconnect every 5 seconds if disconnected

export function useClusterStatus(): UseClusterStatusReturn {
  const [clusterStatus, setClusterStatus] = useState<ClusterStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [isWebSocketActive, setIsWebSocketActive] = useState(false);
  
  const lastWebSocketDataTime = useRef<Date | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const initialConnectionAttempted = useRef<boolean>(false);
  const initialTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // WebSocket connection
  const { 
    isConnected, 
    sendMessage, 
    lastMessage, 
    connect: connectWebSocket,
    disconnect: disconnectWebSocket 
  } = useWebSocket({
    url: '/ws/cluster/status'
  });

  // REMOVED - No more API fallback functions
  // All data comes only from WebSocket

  // Handle WebSocket messages
  useEffect(() => {
    if (!lastMessage) return;

    const message = lastMessage;
    
    if (message.type === 'cluster_status') {
      debugLog.ws('Received cluster_status via WebSocket - WEBSOCKET ONLY MODE');
      
      // Clear initial connection timeout since we got data
      if (initialTimeoutRef.current) {
        debugLog.ws('Clearing initial timeout - received cluster data');
        clearTimeout(initialTimeoutRef.current);
        initialTimeoutRef.current = null;
      }
      
      // Map WebSocket data structure to ClusterStatus interface
      const wsData = message.data;
      debugLog.ws('Raw WebSocket data:', wsData);
      debugLog.ws('GPU data from backend:', wsData.gpus);
      
      const clusterStatus: ClusterStatus = {
        nodes: [], // WebSocket doesn't provide detailed node list
        // Raw data from check.sh
        raw_nodes: wsData.nodes ? {
          free: wsData.nodes.free || 0,
          busy: wsData.nodes.busy || 0,
          sleeping: wsData.nodes.sleeping || 0,
          total: wsData.nodes.total || 0,
          available: wsData.nodes.available || 0
        } : undefined,
        raw_gpus: wsData.gpus ? {
          free: wsData.gpus.free || 0,
          busy: wsData.gpus.busy || 0,
          total: wsData.gpus.total || 0,
          available: wsData.gpus.available || 0
        } : undefined,
        // Legacy CPU/memory estimates (for compatibility)
        total_cpus: (wsData.nodes?.total || 0) * 32, // Estimate: 32 CPUs per node
        total_memory: (wsData.nodes?.total || 0) * 256, // Estimate: 256GB per node
        used_cpus: (wsData.nodes?.busy || 0) * 32,
        used_memory: (wsData.nodes?.busy || 0) * 256,
        // available = free + sleeping nodes (sleeping nodes can be woken up)
        available_cpus: ((wsData.nodes?.free || 0) + (wsData.nodes?.sleeping || 0)) * 32,
        available_memory: ((wsData.nodes?.free || 0) + (wsData.nodes?.sleeping || 0)) * 256,
        queue_stats: {
          running: 0,
          pending: 0,
          completed: 0,
          failed: 0
        },
        active_sessions: {
          active_users: 0,
          total_connections: 0,
          connections_by_channel: {}
        }
      };
      
      setClusterStatus(clusterStatus);
      console.log('[useClusterStatus] Final clusterStatus.raw_gpus:', clusterStatus.raw_gpus);
      // Use timestamp from cluster data (when data was collected), not WebSocket timestamp
      const clusterTimestamp = wsData.timestamp ? new Date(wsData.timestamp) : new Date();
      setLastUpdate(clusterTimestamp);
      setLoading(false);
      setError(null);
      lastWebSocketDataTime.current = new Date();
      
      console.log('[useClusterStatus] WEBSOCKET ONLY - Status updated successfully');
    } else if (message.type === 'connection_established') {
      console.log('[useClusterStatus] Connected to cluster status WebSocket - WEBSOCKET ONLY MODE');
      setError(null);

      // Clear initial connection timeout since we connected
      if (initialTimeoutRef.current) {
        console.log('[useClusterStatus] Clearing initial timeout - connection established');
        clearTimeout(initialTimeoutRef.current);
        initialTimeoutRef.current = null;
      }

      // Request immediate status update when connection is established
      sendMessage({ type: 'request_status' });
    } else if (message.type === 'pong') {
      // Heartbeat response - connection is alive
      lastWebSocketDataTime.current = new Date();
    }
  }, [lastMessage, sendMessage]);

  // Monitor WebSocket connection status
  useEffect(() => {
    console.log('[useClusterStatus] Connection status changed - WEBSOCKET ONLY:', { 
      isConnected,
      isWebSocketActive: isConnected
    });
    
    // Set isWebSocketActive based on actual WebSocket connection ONLY
    setIsWebSocketActive(isConnected);
    
    if (isConnected) {
      lastWebSocketDataTime.current = new Date();
      console.log('[useClusterStatus] WebSocket connected');
      setError(null); // Clear any connection errors
      setLoading(false); // Connected, no longer loading

      // Clear initial connection timeout since we connected successfully
      if (initialTimeoutRef.current) {
        console.log('[useClusterStatus] Clearing initial timeout - WebSocket connected');
        clearTimeout(initialTimeoutRef.current);
        initialTimeoutRef.current = null;
      }
    } else {
      // Only show error if we had a previous connection or after initial attempts
      const hasHadConnection = lastWebSocketDataTime.current !== null;
      if (hasHadConnection) {
        console.log('[useClusterStatus] WebSocket disconnected - will attempt reconnect');
        setError('WebSocket disconnected - attempting to reconnect...');
        setLoading(true); // Disconnected, show loading
      } else {
        console.log('[useClusterStatus] Initial WebSocket connection attempt...');
        // Don't set error during initial connection attempts
      }
    }
  }, [isConnected]);

  // Initial connection and setup - runs only once
  useEffect(() => {
    // Ensure we're in browser environment
    if (typeof window === 'undefined') {
      return;
    }
    
    console.log('[useClusterStatus] Initializing WebSocket connection - WEBSOCKET ONLY MODE');
    initialConnectionAttempted.current = true;
    // Connection is established automatically by useWebSocket
    
    // Set a timeout to show connection error only if initial connection fails after 15 seconds
    // This gives more time for the connection to establish
    initialTimeoutRef.current = setTimeout(() => {
      // Only show error if we're still not connected AND don't have any data AND haven't cleared this timeout
      if (!isConnected && !clusterStatus && initialConnectionAttempted.current && initialTimeoutRef.current) {
        console.log('[useClusterStatus] Initial connection timeout - showing error after 15 seconds');
        setError('Unable to connect to cluster status service');
        setLoading(false);
      }
    }, 15000); // 15 seconds for initial connection (increased from 10)
    
    return () => {
      disconnectWebSocket();
      if (initialTimeoutRef.current) {
        clearTimeout(initialTimeoutRef.current);
        initialTimeoutRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, []); // Empty dependency array - runs only once

  // Auto-reconnect mechanism - if WebSocket disconnects, try to reconnect
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    if (!isConnected && !reconnectTimeoutRef.current) {
      // Don't show error immediately during initial connection attempts
      const isInitialConnection = !lastWebSocketDataTime.current;
      
      if (!isInitialConnection) {
        console.log('[useClusterStatus] WebSocket disconnected, scheduling reconnect in 5 seconds');
        setError('WebSocket disconnected - attempting to reconnect...');
      }
      
      reconnectTimeoutRef.current = setTimeout(() => {
        console.log('[useClusterStatus] Attempting to reconnect WebSocket');
        connectWebSocket();
        reconnectTimeoutRef.current = null;
      }, RECONNECT_INTERVAL);
    } else if (isConnected && reconnectTimeoutRef.current) {
      // Connected successfully, clear any pending reconnect
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
      setError(null);
    }

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };
  }, [isConnected, connectWebSocket]);

  // Request immediate status update
  const requestStatusUpdate = useCallback(() => {
    if (isConnected) {
      console.log('[useClusterStatus] Requesting status update via WebSocket');
      sendMessage({ type: 'request_status' });
    } else {
      console.log('[useClusterStatus] Cannot request status - WebSocket not connected');
      setError('WebSocket not connected - cannot fetch data');
    }
  }, [isConnected, sendMessage]);

  // Periodic heartbeat to keep connection alive
  useEffect(() => {
    if (!isConnected) return;

    const heartbeatInterval = setInterval(() => {
      sendMessage({ type: 'ping' });
    }, 30000); // Send heartbeat every 30 seconds

    return () => clearInterval(heartbeatInterval);
  }, [isConnected, sendMessage]);

  return {
    clusterStatus,
    loading,
    error,
    lastUpdate,
    isWebSocketActive,
    requestStatusUpdate
  };
}
