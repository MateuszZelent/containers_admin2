import { useState, useEffect, useCallback, useRef } from 'react';
import { jobsApi, adminApi } from '@/lib/api-client';
import { useJobStatus } from './useJobStatus';
import { useClusterStatus } from './useClusterStatus';
import { debugLog } from '@/lib/debug';

export interface ConnectionStatus {
  ssh: {
    status: 'active' | 'inactive' | 'checking' | 'unknown';
    lastChecked: Date | null;
    error?: string;
  };
  websocket: {
    status: 'active' | 'inactive' | 'checking' | 'reconnecting' | 'unknown';
    lastChecked: Date | null;
    verificationCode?: string;
    error?: string;
  };
  pcss: {
    status: 'active' | 'inactive' | 'checking' | 'unknown';
    lastChecked: Date | null;
    totalNodes?: number;
    activeNodes?: number;
    source?: 'websocket' | 'api';
    error?: string;
  };
}

interface UseConnectionStatusOptions {
  cacheEnabled?: boolean;
  cacheTTL?: number;
  refreshInterval?: number;
  enableAutoRefresh?: boolean;
  // USUNIĘTE: isClusterWebSocketActive i clusterStatus - będą zarządzane wewnętrznie
}

interface UseConnectionStatusReturn {
  connectionStatus: ConnectionStatus;
  isLoading: boolean;
  error: string | null;
  lastUpdate: Date | null;
  refreshStatus: () => Promise<void>;
  refreshSSHStatus: () => Promise<void>;
  refreshWebSocketStatus: () => void;
  refreshPCSSStatus: () => Promise<void>;
  clearCache: () => void;
  // Cluster status data - zarządzane wewnętrznie
  clusterStatus: any | null;
  clusterLoading: boolean;
  clusterError: string | null;
  clusterLastUpdate: Date | null;
  isClusterWebSocketActive: boolean;
  requestClusterStatusUpdate: () => void;
}

const STORAGE_KEY = 'dashboard_connection_status';
const LAST_UPDATE_KEY = 'dashboard_connection_status_last_update';
const DEFAULT_CACHE_TTL = 60000;
const DEFAULT_REFRESH_INTERVAL = 30000;

const initialStatus: ConnectionStatus = {
  ssh: {
    status: 'unknown',
    lastChecked: null,
  },
  websocket: {
    status: 'unknown',
    lastChecked: null,
  },
  pcss: {
    status: 'unknown',
    lastChecked: null,
  },
};

export function useConnectionStatus(options: UseConnectionStatusOptions = {}): UseConnectionStatusReturn {
  const {
    cacheEnabled = true,
    cacheTTL = DEFAULT_CACHE_TTL,
    refreshInterval = DEFAULT_REFRESH_INTERVAL,
    enableAutoRefresh = true,
  } = options;

  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(initialStatus);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const refreshTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);

  // WebSocket connection monitoring with stable state
  const [stableWebSocketState, setStableWebSocketState] = useState({
    isJobStatusConnected: false,
    isTunnelHealthConnected: false,
    isNotificationsConnected: false,
    verificationCode: null as string | null
  });

  const { 
    isJobStatusConnected, 
    isTunnelHealthConnected, 
    isNotificationsConnected, 
    verificationCode 
  } = useJobStatus({
    enabled: true,
    // Tylko job status i notifications dla connection monitoring
    enableJobStatus: true,
    enableNotifications: true
  });
  
  // Cluster status - zarządzany lokalnie w useConnectionStatus
  const {
    clusterStatus,
    loading: clusterLoading,
    error: clusterError,
    lastUpdate: clusterLastUpdate,
    isWebSocketActive: isClusterWebSocketActive,
    requestStatusUpdate: requestClusterStatusUpdate,
  } = useClusterStatus();

  // Debug: Monitor changes to isClusterWebSocketActive
  useEffect(() => {
    debugLog.ws('[useConnectionStatus] isClusterWebSocketActive changed:', isClusterWebSocketActive);
  }, [isClusterWebSocketActive]);

  // Debug: Monitor changes to clusterStatus
  useEffect(() => {
    debugLog.ws('[useConnectionStatus] clusterStatus changed:', {
      hasClusterStatus: !!clusterStatus,
      total_cpus: clusterStatus?.total_cpus,
      lastUpdate: clusterStatus ? 'has data' : 'no data'
    });
  }, [clusterStatus]);

  // Stabilize WebSocket state to prevent oscillation with asymmetric debouncing
  useEffect(() => {
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    const currentRawState = {
      isJobStatusConnected,
      isTunnelHealthConnected,
      isNotificationsConnected,
      verificationCode
    };

    // Log immediate values for debugging
    debugLog.ws('[useConnectionStatus] Raw WebSocket values:', currentRawState);

    // Check if any connection went from false to true - update immediately
    const hasNewConnection = (
      (!stableWebSocketState.isJobStatusConnected && isJobStatusConnected) ||
      (!stableWebSocketState.isTunnelHealthConnected && isTunnelHealthConnected) ||
      (!stableWebSocketState.isNotificationsConnected && isNotificationsConnected)
    );

    // Check if any connection went from true to false
    const hasLostConnection = (
      (stableWebSocketState.isJobStatusConnected && !isJobStatusConnected) ||
      (stableWebSocketState.isTunnelHealthConnected && !isTunnelHealthConnected) ||
      (stableWebSocketState.isNotificationsConnected && !isNotificationsConnected)
    );

    if (hasNewConnection) {
      debugLog.ws('[useConnectionStatus] New connection detected - updating immediately');
      setStableWebSocketState(currentRawState);
      return;
    }

    if (!hasLostConnection) {
      // Only update if verification code changed and connections are stable
      if (stableWebSocketState.verificationCode !== verificationCode && 
          stableWebSocketState.isJobStatusConnected === isJobStatusConnected &&
          stableWebSocketState.isTunnelHealthConnected === isTunnelHealthConnected &&
          stableWebSocketState.isNotificationsConnected === isNotificationsConnected) {
        // Just update verification code without debounce
        setStableWebSocketState(prev => ({ ...prev, verificationCode }));
      }
      return;
    }

    // Lost connection or verification code change - debounce the update
    debounceTimeoutRef.current = setTimeout(() => {
      setStableWebSocketState(prev => {
        // Only update if values actually changed
        if (
          prev.isJobStatusConnected === isJobStatusConnected &&
          prev.isTunnelHealthConnected === isTunnelHealthConnected &&
          prev.isNotificationsConnected === isNotificationsConnected &&
          prev.verificationCode === verificationCode
        ) {
          return prev; // No change
        }

        debugLog.ws('[useConnectionStatus] Debounced update to stable state:', {
          from: prev,
          to: currentRawState
        });

        return currentRawState;
      });
    }, 300); // Reduced debounce delay

    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, [isJobStatusConnected, isTunnelHealthConnected, isNotificationsConnected, verificationCode, stableWebSocketState]);

  // Load from cache
  const loadFromCache = useCallback(() => {
    if (!cacheEnabled || typeof window === 'undefined') return false;

    try {
      const cachedStatus = localStorage.getItem(STORAGE_KEY);
      const cachedUpdate = localStorage.getItem(LAST_UPDATE_KEY);

      if (cachedStatus && cachedUpdate) {
        const lastUpdateTime = new Date(cachedUpdate);
        const parsedStatus = JSON.parse(cachedStatus, (key, value) => {
          if (key === 'lastChecked' && value) {
            return new Date(value);
          }
          return value;
        });

        setConnectionStatus(parsedStatus);
        setLastUpdate(lastUpdateTime);
        
        const now = new Date();
        return now.getTime() - lastUpdateTime.getTime() < cacheTTL;
      }
    } catch (error) {
      console.warn('Failed to load connection status from cache:', error);
    }

    return false;
  }, [cacheEnabled, cacheTTL]);

  // Save to cache
  const saveToCache = useCallback((status: ConnectionStatus, updateTime: Date) => {
    if (!cacheEnabled || typeof window === 'undefined') return;

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(status));
      localStorage.setItem(LAST_UPDATE_KEY, updateTime.toISOString());
    } catch (error) {
      console.warn('Failed to save connection status to cache:', error);
    }
  }, [cacheEnabled]);

  // Clear cache
  const clearCache = useCallback(() => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(LAST_UPDATE_KEY);
    }
  }, []);

  // Refresh SSH status
  const refreshSSHStatus = useCallback(async () => {
    try {
      const response = await jobsApi.getClusterStatus();
      const sshStatus = response.data.connected ? 'active' : 'inactive';
      
      if (isMountedRef.current) {
        setConnectionStatus(prev => ({
          ...prev,
          ssh: {
            status: sshStatus,
            lastChecked: new Date(),
            error: sshStatus === 'inactive' ? 'SSH connection failed' : undefined,
          },
        }));
      }
    } catch (error) {
      if (isMountedRef.current) {
        setConnectionStatus(prev => ({
          ...prev,
          ssh: {
            status: 'inactive',
            lastChecked: new Date(),
            error: error instanceof Error ? error.message : 'SSH connection failed',
          },
        }));
      }
      throw error;
    }
  }, []);

  // Refresh WebSocket status using stable state with fallback to raw values
  const refreshWebSocketStatus = useCallback(() => {
    // Always use stable state for consistent display
    const activeState = stableWebSocketState;

    const isCriticalWebSocketActive = 
      activeState.isJobStatusConnected || 
      activeState.isTunnelHealthConnected || 
      activeState.isNotificationsConnected;
    
    const wsStatus = isCriticalWebSocketActive ? 'active' : 'inactive';
    
    const activeConnections = [
      activeState.isJobStatusConnected && 'jobs',
      activeState.isTunnelHealthConnected && 'tunnels', 
      activeState.isNotificationsConnected && 'notifications'
    ].filter(Boolean);
    
    debugLog.ws('[useConnectionStatus] WebSocket status update:', {
      stableState: stableWebSocketState,
      rawValues: { isJobStatusConnected, isTunnelHealthConnected, isNotificationsConnected },
      activeState,
      activeConnections,
      wsStatus
    });
    
    if (isMountedRef.current) {
      setConnectionStatus(prev => {
        const currentWsStatus = prev.websocket.status;
        if (currentWsStatus === wsStatus && prev.websocket.verificationCode === activeState.verificationCode) {
          return prev;
        }
        
        return {
          ...prev,
          websocket: {
            status: wsStatus,
            lastChecked: new Date(),
            verificationCode: activeState.verificationCode || undefined,
            error: wsStatus === 'inactive' 
              ? 'All WebSocket connections failed' 
              : activeConnections.length < 3 
                ? `Partial connection: ${activeConnections.join(', ')} active`
                : undefined,
          },
        };
      });
    }
  }, [stableWebSocketState, isJobStatusConnected, isTunnelHealthConnected, isNotificationsConnected, verificationCode]);

  // Refresh PCSS status - WebSocket only
  const refreshPCSSStatus = useCallback(async () => {
    try {
      const hasWebSocketConnection = isClusterWebSocketActive; // Only WebSocket
      const pcssStatus = hasWebSocketConnection ? 'active' : 'inactive';
      
      debugLog.ws('[useConnectionStatus] PCSS status update (WebSocket ONLY mode):', {
        isClusterWebSocketActive,
        hasClusterStatus: !!clusterStatus,
        clusterStatusSample: clusterStatus ? {
          total_cpus: clusterStatus.total_cpus,
          nodes_count: clusterStatus.nodes?.length || 0
        } : null,
        hasWebSocketConnection,
        pcssStatus,
        statusSource: hasWebSocketConnection ? 'WebSocket' : 'None',
        finalSource: hasWebSocketConnection ? 'websocket' : undefined
      });
      
      if (isMountedRef.current) {
        setConnectionStatus(prev => ({
          ...prev,
          pcss: {
            status: pcssStatus,
            lastChecked: new Date(),
            totalNodes: clusterStatus?.total_cpus ? Math.ceil(clusterStatus.total_cpus / 32) : undefined,
            activeNodes: clusterStatus?.used_cpus ? Math.ceil(clusterStatus.used_cpus / 32) : undefined,
            source: hasWebSocketConnection ? 'websocket' : undefined,
            error: pcssStatus === 'inactive' 
              ? 'PCSS WebSocket not active' 
              : undefined,
          },
        }));
      }
    } catch (error) {
      console.error('[useConnectionStatus] Error in PCSS status update:', error);
      if (isMountedRef.current) {
        setConnectionStatus(prev => ({
          ...prev,
          pcss: {
            status: 'inactive',
            lastChecked: new Date(),
            error: error instanceof Error ? error.message : 'PCSS connection failed',
          },
        }));
      }
      throw error;
    }
  }, [isClusterWebSocketActive, clusterStatus]);

  // Refresh all statuses
  const refreshStatus = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      await Promise.allSettled([
        refreshSSHStatus(),
        refreshPCSSStatus(),
      ]);

      refreshWebSocketStatus();

      if (isMountedRef.current) {
        const updateTime = new Date();
        setLastUpdate(updateTime);
        
        setTimeout(() => {
          if (isMountedRef.current) {
            saveToCache(connectionStatus, updateTime);
          }
        }, 100);
      }
    } catch (error) {
      if (isMountedRef.current) {
        setError(error instanceof Error ? error.message : 'Failed to refresh connection status');
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [refreshSSHStatus, refreshPCSSStatus, refreshWebSocketStatus, saveToCache, connectionStatus]);

  // Monitor changes in cluster WebSocket status and update PCSS immediately
  useEffect(() => {
    debugLog.ws('[useConnectionStatus] Cluster WebSocket status changed, updating PCSS...', {
      isClusterWebSocketActive,
      hasClusterStatus: !!clusterStatus
    });
    refreshPCSSStatus();
  }, [isClusterWebSocketActive, clusterStatus, refreshPCSSStatus]);

  // Auto-refresh
  const scheduleNextRefresh = useCallback(() => {
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current);
    }

    if (enableAutoRefresh && isMountedRef.current) {
      refreshTimeoutRef.current = setTimeout(() => {
        refreshStatus();
      }, refreshInterval);
    }
  }, [enableAutoRefresh, refreshInterval, refreshStatus]);

  // Update WebSocket status when stable state changes
  useEffect(() => {
    refreshWebSocketStatus();
  }, [refreshWebSocketStatus]);

  // Initialize
  useEffect(() => {
    const initialize = async () => {
      const hasValidCache = loadFromCache();
      
      if (!hasValidCache) {
        await refreshStatus();
      } else {
        setTimeout(() => {
          if (isMountedRef.current) {
            refreshStatus();
          }
        }, 5000);
      }
      
      scheduleNextRefresh();
    };

    initialize();
  }, []);

  // Update cache when status changes
  useEffect(() => {
    if (lastUpdate) {
      saveToCache(connectionStatus, lastUpdate);
    }
  }, [connectionStatus, lastUpdate, saveToCache]);

  // Auto-refresh timer
  useEffect(() => {
    scheduleNextRefresh();
    
    return () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
    };
  }, [scheduleNextRefresh]);

  // Cleanup
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, []);

  return {
    connectionStatus,
    isLoading,
    error,
    lastUpdate,
    refreshStatus,
    refreshSSHStatus,
    refreshWebSocketStatus,
    refreshPCSSStatus,
    clearCache,
    clusterStatus,
    clusterLoading,
    clusterError,
    clusterLastUpdate,
    isClusterWebSocketActive,
    requestClusterStatusUpdate,
  };
}