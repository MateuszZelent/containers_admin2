import { useState, useEffect, useCallback, useRef } from 'react';
import { jobsApi, adminApi } from '@/lib/api-client';
import { useJobStatus } from './useJobStatus';
import { useClusterStatus } from './useClusterStatus';

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
  } = useJobStatus({ enabled: true });
  
  const { isWebSocketActive: isPCSSWebSocketActive, clusterStatus } = useClusterStatus();

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
    console.log('[useConnectionStatus] Raw WebSocket values:', currentRawState);

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
      console.log('[useConnectionStatus] New connection detected - updating immediately');
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

        console.log('[useConnectionStatus] Debounced update to stable state:', {
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
    // Use stable state, but fallback to raw values if stable state is all false
    const useRawValues = 
      !stableWebSocketState.isJobStatusConnected && 
      !stableWebSocketState.isTunnelHealthConnected && 
      !stableWebSocketState.isNotificationsConnected &&
      (isJobStatusConnected || isTunnelHealthConnected || isNotificationsConnected);

    const activeState = useRawValues ? {
      isJobStatusConnected,
      isTunnelHealthConnected,
      isNotificationsConnected,
      verificationCode
    } : stableWebSocketState;

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
    
    console.log('[useConnectionStatus] WebSocket status update:', {
      stableState: stableWebSocketState,
      rawValues: { isJobStatusConnected, isTunnelHealthConnected, isNotificationsConnected },
      useRawValues,
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

  // Refresh PCSS status
  const refreshPCSSStatus = useCallback(async () => {
    try {
      const response = await adminApi.getMonitoringSettings();
      
      const hasWebSocketConnection = isPCSSWebSocketActive && clusterStatus;
      const hasApiConnection = response.data?.current_status === 'active';
      const pcssStatus = hasWebSocketConnection || hasApiConnection ? 'active' : 'inactive';
      
      console.log('[useConnectionStatus] PCSS status update:', {
        isPCSSWebSocketActive,
        hasClusterStatus: !!clusterStatus,
        hasWebSocketConnection,
        hasApiConnection,
        pcssStatus,
        statusSource: hasWebSocketConnection ? 'WebSocket' : hasApiConnection ? 'API' : 'None'
      });
      
      if (isMountedRef.current) {
        setConnectionStatus(prev => ({
          ...prev,
          pcss: {
            status: pcssStatus,
            lastChecked: new Date(),
            totalNodes: clusterStatus?.total_cpus ? Math.ceil(clusterStatus.total_cpus / 32) : undefined,
            activeNodes: clusterStatus?.used_cpus ? Math.ceil(clusterStatus.used_cpus / 32) : undefined,
            source: hasWebSocketConnection ? 'websocket' : hasApiConnection ? 'api' : undefined,
            error: pcssStatus === 'inactive' 
              ? 'PCSS cluster API and WebSocket failed' 
              : undefined,
          },
        }));
      }
    } catch (error) {
      if (isMountedRef.current) {
        setConnectionStatus(prev => ({
          ...prev,
          pcss: {
            status: 'inactive',
            lastChecked: new Date(),
            error: error instanceof Error ? error.message : 'PCSS cluster connection failed',
          },
        }));
      }
      throw error;
    }
  }, [isPCSSWebSocketActive, clusterStatus]);

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
  };
}