import { useState, useEffect, useCallback, useRef } from 'react';
import { useWebSocket } from './useWebSocket';
import { showToast } from '@/lib/toast-helpers';
import { clusterApi } from '@/lib/api-client';

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
  forceApiRefresh: () => void;
}

const FALLBACK_TIMEOUT = 60000; // 1 minute without WebSocket data triggers API fallback
const API_REFRESH_INTERVAL = 30000; // Refresh API every 30 seconds when using fallback

export function useClusterStatus(): UseClusterStatusReturn {
  const [clusterStatus, setClusterStatus] = useState<ClusterStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [isWebSocketActive, setIsWebSocketActive] = useState(false);
  const [usingApiFallback, setUsingApiFallback] = useState(false);
  
  const lastWebSocketDataTime = useRef<Date | null>(null);
  const fallbackTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const apiIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const fallbackToastShown = useRef<boolean>(false);

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

  // API fallback function
  const fetchClusterStatusFromAPI = useCallback(async () => {
    try {
      // Use the cluster stats API as fallback with proper authentication
      const response = await clusterApi.getStats();
      const data = response.data;
      
      // Convert stats format to cluster status format
      const clusterStatus: ClusterStatus = {
        nodes: data.nodes || [],
        total_cpus: data.total_cpus || 0,
        total_memory: data.total_memory || 0,
        used_cpus: data.used_cpus || 0,
        used_memory: data.used_memory || 0,
        available_cpus: data.available_cpus || 0,
        available_memory: data.available_memory || 0,
        queue_stats: data.queue_stats || {
          running: 0,
          pending: 0,
          completed: 0,
          failed: 0
        },
        active_sessions: data.active_sessions || {
          active_users: 0,
          total_connections: 0,
          connections_by_channel: {}
        }
      };
      
      setClusterStatus(clusterStatus);
      setLastUpdate(new Date());
      setLoading(false);
      setError(null);
    } catch (err) {
      console.error('Error fetching cluster status from API:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch cluster status');
      setLoading(false);
    }
  }, []);

  // Force API refresh (public method)
  const forceApiRefresh = useCallback(() => {
    fetchClusterStatusFromAPI();
  }, [fetchClusterStatusFromAPI]);

  // Handle WebSocket messages
  useEffect(() => {
    if (!lastMessage) return;

    const message = lastMessage;
    
    if (message.type === 'cluster_status') {
      setClusterStatus(message.data);
      setLastUpdate(new Date());
      setLoading(false);
      setError(null);
      lastWebSocketDataTime.current = new Date();
      
      // We're getting data via WebSocket, so stop API fallback
      if (usingApiFallback) {
        setUsingApiFallback(false);
        fallbackToastShown.current = false; // Reset toast flag when WebSocket recovers
        if (apiIntervalRef.current) {
          clearInterval(apiIntervalRef.current);
          apiIntervalRef.current = null;
        }
      }
    } else if (message.type === 'connection_established') {
      console.log('Connected to cluster status WebSocket');
      setIsWebSocketActive(true);
      setError(null);
    } else if (message.type === 'pong') {
      // Heartbeat response - connection is alive
      lastWebSocketDataTime.current = new Date();
    }
  }, [lastMessage, usingApiFallback]);

  // Monitor WebSocket connection status
  useEffect(() => {
    setIsWebSocketActive(isConnected);
    
    if (isConnected) {
      lastWebSocketDataTime.current = new Date();
    } else {
      setIsWebSocketActive(false);
    }
  }, [isConnected]);

  // Fallback mechanism - switch to API if WebSocket is inactive for too long
  useEffect(() => {
    if (fallbackTimeoutRef.current) {
      clearTimeout(fallbackTimeoutRef.current);
    }

    if (isWebSocketActive && lastWebSocketDataTime.current) {
      fallbackTimeoutRef.current = setTimeout(() => {
        const now = new Date();
        const timeSinceLastData = now.getTime() - (lastWebSocketDataTime.current?.getTime() || 0);
        
        if (timeSinceLastData > FALLBACK_TIMEOUT) {
          console.warn('WebSocket inactive for too long, switching to API fallback');
          setUsingApiFallback(true);
          setIsWebSocketActive(false);
          
          // Show toast only once per session
          if (!fallbackToastShown.current) {
            showToast.warning('Switched to periodic updates due to connection issues');
            fallbackToastShown.current = true;
          }
          
          // Start API polling
          fetchClusterStatusFromAPI();
          apiIntervalRef.current = setInterval(fetchClusterStatusFromAPI, API_REFRESH_INTERVAL);
        }
      }, FALLBACK_TIMEOUT);
    }

    return () => {
      if (fallbackTimeoutRef.current) {
        clearTimeout(fallbackTimeoutRef.current);
      }
    };
  }, [isWebSocketActive, lastWebSocketDataTime.current, fetchClusterStatusFromAPI]);

  // Initial connection and setup - runs only once
  useEffect(() => {
    // Ensure we're in browser environment
    if (typeof window === 'undefined') {
      return;
    }
    
    connectWebSocket();
    
    return () => {
      disconnectWebSocket();
      if (fallbackTimeoutRef.current) {
        clearTimeout(fallbackTimeoutRef.current);
      }
      if (apiIntervalRef.current) {
        clearInterval(apiIntervalRef.current);
      }
    };
  }, []); // Empty dependency array - runs only once

  // Handle connection timeout separately
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    // If WebSocket doesn't connect within 15 seconds, start with API
    // Increased from 5s to 15s to give cluster service more time
    const initialTimeout = setTimeout(() => {
      if (!isConnected && !usingApiFallback) {
        console.log('WebSocket connection timeout, using API fallback');
        setUsingApiFallback(true);
        fetchClusterStatusFromAPI();
        apiIntervalRef.current = setInterval(fetchClusterStatusFromAPI, API_REFRESH_INTERVAL);
      }
    }, 15000); // Increased timeout

    return () => {
      clearTimeout(initialTimeout);
    };
  }, [isConnected, usingApiFallback]); // Only re-run when connection status changes

  // Request immediate status update
  const requestStatusUpdate = useCallback(() => {
    if (isConnected) {
      sendMessage({ type: 'request_status' });
    } else {
      fetchClusterStatusFromAPI();
    }
  }, [isConnected, sendMessage, fetchClusterStatusFromAPI]);

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
    requestStatusUpdate,
    forceApiRefresh
  };
}
