import { useState, useEffect, useCallback, useRef } from 'react';
import { jobsApi } from '@/lib/api-client';

export interface DomainStatus {
  job_id: number;
  domain_ready: boolean;
  status: string;
  node: string | null;
  port: number | null;
  url?: string;
}

export interface UseDomainStatusOptions {
  enabled?: boolean;
  pollingInterval?: number;
  maxPollingTime?: number;
  onReady?: (status: DomainStatus) => void;
  onError?: (error: string) => void;
}

export interface UseDomainStatusReturn {
  status: DomainStatus | null;
  isLoading: boolean;
  error: string | null;
  isPolling: boolean;
  isSettingUp: boolean; // NEW: Setup state
  pollingStartTime: Date | null;
  startPolling: () => void;
  stopPolling: () => void;
  setupDomain: () => Promise<void>;
  isDomainReady: boolean;
  domainUrl: string | null;
  domain: string | null;
  lastAttemptedUrl: string | null;
  lastErrorDetails: any;
}

export function useDomainStatus(
  jobId: number,
  options: UseDomainStatusOptions = {}
): UseDomainStatusReturn {
  const {
    enabled = false,
    pollingInterval = 3000,
    maxPollingTime = 300000, // 5 minutes
    onReady,
    onError,
  } = options;

  const [status, setStatus] = useState<DomainStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [isSettingUp, setIsSettingUp] = useState(false); // NEW: Prevent multiple setup calls
  const [pollingStartTime, setPollingStartTime] = useState<Date | null>(null);
  const [lastAttemptedUrl, setLastAttemptedUrl] = useState<string | null>(null);
  const [lastErrorDetails, setLastErrorDetails] = useState<any>(null);

  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pollingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const onReadyRef = useRef(onReady);
  
  // Update ref when onReady changes
  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  // Helper function to call onReady only once per job session
  const callOnReadyOnce = useCallback((domainStatus: DomainStatus) => {
    const storageKey = `onReadyCalled_${jobId}`;
    const alreadyCalled = sessionStorage.getItem(storageKey) === 'true';
    
    console.log('🔵 HOOK callOnReadyOnce called, alreadyCalled:', alreadyCalled, 'jobId:', jobId);
    if (!alreadyCalled && onReadyRef.current) {
      console.log('🟢 HOOK Calling onReady for FIRST TIME for job:', jobId);
      console.log('🟢 HOOK Stack trace:', new Error().stack);
      sessionStorage.setItem(storageKey, 'true');
      onReadyRef.current(domainStatus);
    } else {
      console.log('🔴 HOOK onReady already called for job:', jobId, 'skipping');
    }
  }, [jobId]); // Only depend on jobId

  // Check domain status
  const checkDomainStatus = useCallback(async () => {
    if (!jobId) return null;
    
    try {
      console.log('Calling getDomainStatus for job:', jobId);
      console.log('jobsApi object:', jobsApi);
      console.log('getDomainStatus function:', jobsApi.getDomainStatus);
      
      // Alternatywny sposób wywołania - destrukturyzacja
      const { getDomainStatus } = jobsApi;
      const response = await getDomainStatus(jobId);
      const data: DomainStatus = response.data;
      
      // Clear error details on success
      setLastErrorDetails(null);
      return data;
    } catch (err: any) {
      console.error('Error checking domain status:', err);
      
      // Extract error details from axios error
      const errorDetails = {
        status: err.response?.status,
        statusText: err.response?.statusText,
        headers: err.response?.headers,
        body: err.response?.data,
        url: `/api/v1/jobs/${jobId}/domain-status`,
        timestamp: new Date().toISOString(),
        message: err.message
      };
      
      setLastAttemptedUrl(`/api/v1/jobs/${jobId}/domain-status`);
      setLastErrorDetails(errorDetails);
      
      throw new Error(`HTTP error! status: ${err.response?.status || 'unknown'} - ${err.response?.statusText || err.message}`);
    }
  }, [jobId]);

  // Stop polling
  const stopPolling = useCallback(() => {
    console.log('Stopping domain status polling for job:', jobId);
    setIsPolling(false);
    setPollingStartTime(null);

    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }

    if (pollingTimeoutRef.current) {
      clearTimeout(pollingTimeoutRef.current);
      pollingTimeoutRef.current = null;
    }
  }, [jobId]);

  // Start polling for domain status
  const startPolling = useCallback(() => {
    if (isPolling) {
      console.log('Polling already active, skipping start');
      return;
    }

    console.log('Starting domain status polling for job:', jobId);
    setIsPolling(true);
    setPollingStartTime(new Date());
    setError(null);

    const poll = async () => {
      try {
        console.log('Polling domain status for job:', jobId);
        const domainStatus = await checkDomainStatus();
        if (domainStatus) {
          setStatus(domainStatus);

          // If domain is ready and has URL, stop polling
          if (domainStatus.domain_ready && domainStatus.url) {
            console.log('Domain ready, stopping polling for job:', jobId);
            stopPolling();
            callOnReadyOnce(domainStatus);
            return;
          }
        }
      } catch (err) {
        console.error('Polling error for job:', jobId, err);
        const errorMessage = err instanceof Error ? err.message : 'Polling failed';
        setError(errorMessage);
        
        // Don't stop polling on single error, but notify
        if (onError) {
          onError(errorMessage);
        }
      }
    };

    // Start polling immediately
    poll();

    // Set up interval for polling
    pollingIntervalRef.current = setInterval(poll, pollingInterval);

    // Set up timeout to stop polling after max time
    pollingTimeoutRef.current = setTimeout(() => {
      stopPolling();
      const timeoutError = 'Domain setup timed out';
      setError(timeoutError);
      if (onError) {
        onError(timeoutError);
      }
    }, maxPollingTime);
  }, [isPolling, checkDomainStatus, pollingInterval, maxPollingTime, onReady, onError, stopPolling]);

  // Setup domain (call code-server endpoint)
  const setupDomain = useCallback(async () => {
    if (!jobId) return;
    
    if (isSettingUp) {
      console.log('Setup already in progress for job:', jobId);
      return;
    }

    console.log('Starting setupDomain for job:', jobId);
    setIsSettingUp(true);
    setIsLoading(true);
    setError(null);
    setLastErrorDetails(null);
    setLastAttemptedUrl(`/api/v1/jobs/${jobId}/code-server`);

    try {
      const response = await jobsApi.getCodeServerUrl(jobId);
      const data = response.data;
      
      // Update status with URL if provided
      if (data.url) {
        const newStatus: DomainStatus = {
          job_id: jobId,
          domain_ready: true,
          status: 'RUNNING',
          node: data.node || null,
          port: data.port || null,
          url: data.url,
        };
        setStatus(newStatus);
        
        // Clear error details on success
        setLastErrorDetails(null);
        
        callOnReadyOnce(newStatus);
      } else {
        // Start polling if no immediate URL
        startPolling();
      }
    } catch (err: any) {
      console.error('Setup domain error for job:', jobId, err);
      
      // Extract error details from axios error
      const errorDetails = {
        status: err.response?.status,
        statusText: err.response?.statusText,
        headers: err.response?.headers,
        body: err.response?.data,
        url: `/api/v1/jobs/${jobId}/code-server`,
        timestamp: new Date().toISOString(),
        message: err.message
      };
      
      setLastErrorDetails(errorDetails);
      
      const errorMessage = err.response?.data?.detail || err.message || 'Failed to setup domain';
      setError(errorMessage);
      if (onError) {
        onError(errorMessage);
      }
    } finally {
      setIsLoading(false);
      setIsSettingUp(false); // Reset setup state
    }
  }, [jobId, onReady, onError, startPolling, isSettingUp]);

  // Start polling when enabled
  useEffect(() => {
    console.log('useEffect polling check:', { enabled, isPolling, jobId });
    
    if (!enabled || !jobId || isPolling) {
      return;
    }

    // Prevent duplicate calls in React Strict Mode
    const timeoutId = setTimeout(() => {
      console.log('Starting initial status check for job:', jobId);
      checkDomainStatus();
    }, 50);

    return () => clearTimeout(timeoutId);
  }, [enabled, jobId, isPolling, checkDomainStatus]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, [stopPolling]);

  const isDomainReady = status?.domain_ready === true;
  const domainUrl = status?.url || null;
  
  // Extract domain from URL if available
  let domain: string | null = null;
  if (domainUrl) {
    try {
      const url = new URL(domainUrl);
      domain = url.hostname;
    } catch (err) {
      console.error('Failed to parse domain URL:', err);
    }
  }

  return {
    status,
    isLoading,
    error,
    isPolling,
    isSettingUp, // NEW: Add setup state
    pollingStartTime,
    startPolling,
    stopPolling,
    setupDomain,
    isDomainReady,
    domainUrl,
    domain,
    lastAttemptedUrl,
    lastErrorDetails,
  };
}
