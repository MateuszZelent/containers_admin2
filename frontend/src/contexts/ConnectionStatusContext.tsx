"use client";

import React, { createContext, useContext, ReactNode } from 'react';
import { useConnectionStatus, ConnectionStatus } from '@/hooks/useConnectionStatus';

interface ConnectionStatusContextType {
  connectionStatus: ConnectionStatus;
  isLoading: boolean;
  error: string | null;
  lastUpdate: Date | null;
  refreshStatus: () => Promise<void>;
  refreshSSHStatus: () => Promise<void>;
  refreshWebSocketStatus: () => void;
  refreshPCSSStatus: () => Promise<void>;
  clearCache: () => void;
  // Cluster status data - global state
  clusterStatus: ReturnType<typeof useConnectionStatus>['clusterStatus'];
  clusterLoading: boolean;
  clusterError: string | null;
  clusterLastUpdate: Date | null;
  isClusterWebSocketActive: boolean;
  requestClusterStatusUpdate: () => void;
}

const ConnectionStatusContext = createContext<ConnectionStatusContextType | undefined>(undefined);

interface ConnectionStatusProviderProps {
  children: ReactNode;
  cacheEnabled?: boolean;
  cacheTTL?: number;
  refreshInterval?: number;
  enableAutoRefresh?: boolean;
}

export function ConnectionStatusProvider({
  children,
  cacheEnabled = true,
  cacheTTL = 60000, // 1 minute
  refreshInterval = 30000, // 30 seconds
  enableAutoRefresh = true,
}: ConnectionStatusProviderProps) {
  const {
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
  } = useConnectionStatus({
    cacheEnabled,
    cacheTTL,
    refreshInterval,
    enableAutoRefresh,
  });

  const contextValue: ConnectionStatusContextType = {
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

  return (
    <ConnectionStatusContext.Provider value={contextValue}>
      {children}
    </ConnectionStatusContext.Provider>
  );
}

export function useConnectionStatusContext(): ConnectionStatusContextType {
  const context = useContext(ConnectionStatusContext);
  if (context === undefined) {
    throw new Error('useConnectionStatusContext must be used within a ConnectionStatusProvider');
  }
  return context;
}

export { ConnectionStatusContext };
