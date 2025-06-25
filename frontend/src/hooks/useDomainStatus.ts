import { useState, useEffect, useCallback } from 'react';
import { jobsApi } from '@/lib/api-client';

export interface DomainStatus {
  domain_ready: boolean;
  domain: string;
  url: string | null;
  job_status: string;
  port: number | null;
  node: string | null;
}

export interface UseDomainStatusOptions {
  enabled?: boolean;
  pollingInterval?: number;
  maxPollingTime?: number;
  onReady?: (status: DomainStatus) => void;
  onError?: (error: string) => void;
}

export function useDomainStatus(
  jobId: number | null,
  options: UseDomainStatusOptions = {}
) {
  const {
    enabled = true,
    pollingInterval = 5000, // 5 seconds
    maxPollingTime = 300000, // 5 minutes
    onReady,
    onError
  } = options;

  const [status, setStatus] = useState<DomainStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [pollingStartTime, setPollingStartTime] = useState<number | null>(null);

  const checkDomainStatus = useCallback(async () => {
    if (!jobId || !enabled) return;

    try {
      setError(null);
      const response = await jobsApi.checkDomainStatus(jobId);
      const domainStatus = response.data as DomainStatus;
      
      setStatus(domainStatus);

      // If domain is ready, stop polling and call onReady callback
      if (domainStatus.domain_ready) {
        setIsPolling(false);
        setPollingStartTime(null);
        onReady?.(domainStatus);
      }

      return domainStatus;
    } catch (err: any) {
      const errorMessage = err.response?.data?.detail || err.message || 'Failed to check domain status';
      setError(errorMessage);
      onError?.(errorMessage);
    }
  }, [jobId, enabled, onReady, onError]);

  const setupDomain = useCallback(async () => {
    if (!jobId || !enabled) return;

    try {
      setError(null);
      setIsLoading(true);
      
      // Call the code-server endpoint which creates the domain
      const response = await jobsApi.getCodeServerUrl(jobId);
      
      // The endpoint returns domain info, so we can update our status
      if (response.data.domain) {
        setStatus(prev => ({
          ...prev,
          domain: response.data.domain,
          url: response.data.url,
          domain_ready: false, // It's being set up, not ready yet
          job_status: 'RUNNING',
          port: response.data.port,
          node: response.data.node
        }));
      }
      
      return response.data;
    } catch (err: any) {
      const errorMessage = err.response?.data?.detail || err.message || 'Failed to setup domain';
      setError(errorMessage);
      onError?.(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [jobId, enabled, onError]);

  const startPolling = useCallback(async () => {
    if (!jobId || !enabled || isPolling) return;

    setIsLoading(true);
    setIsPolling(true);
    setPollingStartTime(Date.now());
    
    // Initial check
    await checkDomainStatus();
    setIsLoading(false);
  }, [jobId, enabled, isPolling, checkDomainStatus]);

  const stopPolling = useCallback(() => {
    setIsPolling(false);
    setPollingStartTime(null);
  }, []);

  // Polling effect
  useEffect(() => {
    if (!isPolling || !enabled) return;

    const interval = setInterval(async () => {
      // Check if we've exceeded max polling time
      if (pollingStartTime && Date.now() - pollingStartTime > maxPollingTime) {
        setIsPolling(false);
        setPollingStartTime(null);
        onError?.('Domain readiness check timed out');
        return;
      }

      await checkDomainStatus();
    }, pollingInterval);

    return () => clearInterval(interval);
  }, [isPolling, enabled, pollingInterval, maxPollingTime, pollingStartTime, checkDomainStatus, onError]);

  // Manual check without polling
  const checkOnce = useCallback(async () => {
    setIsLoading(true);
    const result = await checkDomainStatus();
    setIsLoading(false);
    return result;
  }, [checkDomainStatus]);

  return {
    status,
    isLoading,
    error,
    isPolling,
    pollingStartTime,
    startPolling,
    stopPolling,
    checkOnce,
    setupDomain,
    isDomainReady: status?.domain_ready || false,
    domainUrl: status?.url || null,
    domain: status?.domain || null,
  };
}
