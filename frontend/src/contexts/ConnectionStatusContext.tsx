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

  return (
    <ConnectionStatusContext.Provider value={connectionStatusData}>
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
