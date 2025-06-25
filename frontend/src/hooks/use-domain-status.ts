import { useState, useEffect } from 'react';
import { jobsApi } from '@/lib/api-client';

interface DomainStatus {
  domain_ready: boolean;
  domain: string;
  url?: string;
  status: string;
  job_id: number;
  monitoring_active: boolean;
}

interface DomainUrl {
  url: string;
  domain: string;
  job_id: number;
  ready: boolean;
}

export const useDomainStatus = (jobId: number, enabled: boolean = true) => {
  const [domainStatus, setDomainStatus] = useState<DomainStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkDomainStatus = async () => {
    if (!enabled || !jobId) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await jobsApi.checkDomainStatus(jobId);
      setDomainStatus(response.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to check domain status');
    } finally {
      setIsLoading(false);
    }
  };

  const getDomainUrl = async (): Promise<DomainUrl | null> => {
    if (!jobId) return null;
    
    try {
      const response = await jobsApi.getDomainUrl(jobId);
      return response.data;
    } catch (err: any) {
      console.error('Failed to get domain URL:', err.response?.data?.detail);
      return null;
    }
  };

  useEffect(() => {
    if (enabled && jobId) {
      checkDomainStatus();
      
      // Poll for domain readiness if job is running but domain not ready
      const interval = setInterval(() => {
        if (domainStatus && !domainStatus.domain_ready && domainStatus.status === 'RUNNING') {
          checkDomainStatus();
        }
      }, 10000); // Check every 10 seconds
      
      return () => clearInterval(interval);
    }
  }, [jobId, enabled, domainStatus?.domain_ready, domainStatus?.status]);

  return {
    domainStatus,
    isLoading,
    error,
    checkDomainStatus,
    getDomainUrl,
  };
};
