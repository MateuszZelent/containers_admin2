import { useMemo } from 'react';
import { useConnectionStatusContext } from '@/contexts/ConnectionStatusContext';

export interface ClusterHealthStatus {
  isHealthy: boolean;
  isSSHActive: boolean;
  isWebSocketActive: boolean;
  isPCSSActive: boolean;
  canCreateContainers: boolean;
  overallStatus: 'healthy' | 'degraded' | 'unhealthy' | 'checking' | 'unknown';
  healthScore: number; // 0-100 score based on active connections
  issues: string[];
}

export function useClusterHealth(): ClusterHealthStatus {
  const {
    connectionStatus,
    isLoading,
    error
  } = useConnectionStatusContext();

  const healthStatus = useMemo<ClusterHealthStatus>(() => {
    const { ssh, websocket, pcss } = connectionStatus;
    
    const isSSHActive = ssh.status === 'active';
    const isWebSocketActive = websocket.status === 'active';
    const isPCSSActive = pcss.status === 'active';
    
    const activeCount = [isSSHActive, isWebSocketActive, isPCSSActive].filter(Boolean).length;
    const healthScore = Math.round((activeCount / 3) * 100);
    
    const isHealthy = activeCount === 3;
    const canCreateContainers = isSSHActive; // Minimum requirement for container creation
    
    // Determine overall status
    let overallStatus: ClusterHealthStatus['overallStatus'] = 'unknown';
    
    if (isLoading || ssh.status === 'checking' || websocket.status === 'checking' || pcss.status === 'checking') {
      overallStatus = 'checking';
    } else if (isHealthy) {
      overallStatus = 'healthy';
    } else if (canCreateContainers) {
      overallStatus = 'degraded';
    } else {
      overallStatus = 'unhealthy';
    }
    
    // Collect issues
    const issues: string[] = [];
    
    if (ssh.status === 'inactive') {
      issues.push('SSH connection failed - container operations unavailable');
    }
    
    if (websocket.status === 'inactive') {
      issues.push('WebSocket connection failed - real-time updates unavailable');
    }
    
    if (pcss.status === 'inactive') {
      issues.push('PCSS cluster monitoring unavailable');
    }
    
    if (ssh.error) {
      issues.push(`SSH Error: ${ssh.error}`);
    }
    
    if (websocket.error) {
      issues.push(`WebSocket Error: ${websocket.error}`);
    }
    
    if (pcss.error) {
      issues.push(`PCSS Error: ${pcss.error}`);
    }
    
    if (error) {
      issues.push(`General Error: ${error}`);
    }
    
    return {
      isHealthy,
      isSSHActive,
      isWebSocketActive,
      isPCSSActive,
      canCreateContainers,
      overallStatus,
      healthScore,
      issues,
    };
  }, [connectionStatus, isLoading, error]);

  return healthStatus;
}

// Additional hook for just checking if operations are allowed
export function useCanCreateContainers(): boolean {
  const { canCreateContainers } = useClusterHealth();
  return canCreateContainers;
}

// Hook for getting a simple status indicator
export function useSimpleClusterStatus(): 'operational' | 'degraded' | 'offline' | 'checking' {
  const { overallStatus } = useClusterHealth();
  
  switch (overallStatus) {
    case 'healthy':
      return 'operational';
    case 'degraded':
      return 'degraded';
    case 'unhealthy':
      return 'offline';
    case 'checking':
      return 'checking';
    default:
      return 'offline';
  }
}
