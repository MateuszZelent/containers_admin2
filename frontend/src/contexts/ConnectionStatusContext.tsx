"use client";

import React, { createContext, useContext, ReactNode } from 'react';
import { useConnectionStatus, ConnectionStatus } from '@/hooks/useConnectionStatus';
import { useClusterStatus, ClusterStatus } from '@/hooks/useClusterStatus';

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
  clusterStatus: ClusterStatus | null;
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
  const connectionStatusData = useConnectionStatus({
    cacheEnabled,
    cacheTTL,
    refreshInterval,
    enableAutoRefresh,
  });

  // Global cluster status - ONE instance for entire app
  const {
    clusterStatus,
    loading: clusterLoading,
    error: clusterError,
    lastUpdate: clusterLastUpdate,
    isWebSocketActive: isClusterWebSocketActive,
    requestStatusUpdate: requestClusterStatusUpdate
  } = useClusterStatus();

  const contextValue: ConnectionStatusContextType = {
    ...connectionStatusData,
    // Add cluster status to global context
    clusterStatus,
    clusterLoading,
    clusterError,
    clusterLastUpdate,
    isClusterWebSocketActive,
    requestClusterStatusUpdate
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
