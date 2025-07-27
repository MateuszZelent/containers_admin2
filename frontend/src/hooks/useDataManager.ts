import { useState, useEffect, useCallback, useRef } from 'react';
import { jobsApi, userApi, clusterApi } from '@/lib/api-client';
import { Job, User } from '@/lib/types';

// Centralized data interfaces
interface DataManagerState {
  jobs: Job[];
  activeJobs: any[];
  currentUser: User | null;
  activeUsers: any[];
  clusterStatus: {connected: boolean, slurm_running: boolean} | null;
  lastUpdate: Record<string, Date>;
  loading: Record<string, boolean>;
  error: Record<string, string | null>;
}

interface DataManagerReturn extends DataManagerState {
  refreshData: (sources?: string[], silent?: boolean) => Promise<void>;
  refreshJobs: () => Promise<void>;
  refreshActiveJobs: () => Promise<void>;
  refreshCurrentUser: () => Promise<void>;
  refreshActiveUsers: () => Promise<void>;
  refreshClusterStatus: () => Promise<void>;
  isRefreshing: boolean;
}

// Cache configuration
const CACHE_DURATION = {
  jobs: 30000,           // 30s
  activeJobs: 15000,     // 15s (more frequent for active jobs)
  currentUser: 300000,   // 5 minutes (rarely changes)
  activeUsers: 60000,    // 1 minute
  clusterStatus: 30000,  // 30s
};

// Local Storage keys for persistence
const STORAGE_KEYS = {
  jobs: 'dashboard_jobs_cache',
  activeJobs: 'dashboard_active_jobs_cache',
  currentUser: 'dashboard_current_user_cache',
  activeUsers: 'dashboard_active_users_cache',
  clusterStatus: 'dashboard_cluster_status_cache',
  lastUpdate: 'dashboard_last_update_cache',
};

export function useDataManager(): DataManagerReturn {
  const [state, setState] = useState<DataManagerState>({
    jobs: [],
    activeJobs: [],
    currentUser: null,
    activeUsers: [],
    clusterStatus: null,
    lastUpdate: {},
    loading: {
      jobs: false,
      activeJobs: false,
      currentUser: false,
      activeUsers: false,
      clusterStatus: false,
    },
    error: {
      jobs: null,
      activeJobs: null,
      currentUser: null,
      activeUsers: null,
      clusterStatus: null,
    }
  });

  const [isRefreshing, setIsRefreshing] = useState(false);
  const refreshTimeouts = useRef<Record<string, NodeJS.Timeout>>({});
  const isMounted = useRef(true);
  const stateRef = useRef(state);

  // Keep state ref in sync
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Utility function to check if data is stale
  const isDataStale = useCallback((source: string): boolean => {
    const lastUpdate = stateRef.current.lastUpdate[source];
    if (!lastUpdate) return true;
    
    const cacheExpiry = CACHE_DURATION[source as keyof typeof CACHE_DURATION];
    return Date.now() - lastUpdate.getTime() > cacheExpiry;
  }, []);

  // Load data from localStorage on mount (only once)
  const loadFromCache = useCallback(() => {
    try {
      const cachedJobs = localStorage.getItem(STORAGE_KEYS.jobs);
      const cachedActiveJobs = localStorage.getItem(STORAGE_KEYS.activeJobs);
      const cachedCurrentUser = localStorage.getItem(STORAGE_KEYS.currentUser);
      const cachedActiveUsers = localStorage.getItem(STORAGE_KEYS.activeUsers);
      const cachedClusterStatus = localStorage.getItem(STORAGE_KEYS.clusterStatus);
      const cachedLastUpdate = localStorage.getItem(STORAGE_KEYS.lastUpdate);

      const updates: Partial<DataManagerState> = {};

      if (cachedJobs) updates.jobs = JSON.parse(cachedJobs);
      if (cachedActiveJobs) updates.activeJobs = JSON.parse(cachedActiveJobs);
      if (cachedCurrentUser) updates.currentUser = JSON.parse(cachedCurrentUser);
      if (cachedActiveUsers) updates.activeUsers = JSON.parse(cachedActiveUsers);
      if (cachedClusterStatus) updates.clusterStatus = JSON.parse(cachedClusterStatus);
      if (cachedLastUpdate) {
        updates.lastUpdate = JSON.parse(cachedLastUpdate, (key, value) => {
          if (key && typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}T/)) {
            return new Date(value);
          }
          return value;
        });
      }

      if (Object.keys(updates).length > 0) {
        setState(prev => ({ ...prev, ...updates }));
      }
    } catch (error) {
      console.error('Error loading data from cache:', error);
    }
  }, []);

  // Save data to localStorage (stable function)
  const saveToCache = useCallback((source: string, data: any) => {
    try {
      const storageKey = STORAGE_KEYS[source as keyof typeof STORAGE_KEYS];
      if (storageKey) {
        localStorage.setItem(storageKey, JSON.stringify(data));
      }
      
      // Update lastUpdate in localStorage with current state
      const currentLastUpdate = { ...stateRef.current.lastUpdate, [source]: new Date() };
      localStorage.setItem(STORAGE_KEYS.lastUpdate, JSON.stringify(currentLastUpdate));
    } catch (error) {
      console.error(`Error saving ${source} to cache:`, error);
    }
  }, []);

  // Generic data fetcher with error handling and caching
  const fetchData = useCallback(async <T>(
    source: string,
    fetcher: () => Promise<{ data: T }>,
    forceRefresh = false
  ): Promise<T | null> => {
    // Check if we should skip this fetch
    if (!forceRefresh && !isDataStale(source)) {
      return stateRef.current[source as keyof DataManagerState] as T;
    }

    if (!isMounted.current) return null;

    setState(prev => ({
      ...prev,
      loading: { ...prev.loading, [source]: true },
      error: { ...prev.error, [source]: null }
    }));

    try {
      const response = await fetcher();
      const data = response.data;

      if (isMounted.current) {
        setState(prev => ({
          ...prev,
          [source]: data,
          lastUpdate: { ...prev.lastUpdate, [source]: new Date() },
          loading: { ...prev.loading, [source]: false }
        }));

        saveToCache(source, data);
      }

      return data;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      if (isMounted.current) {
        setState(prev => ({
          ...prev,
          loading: { ...prev.loading, [source]: false },
          error: { ...prev.error, [source]: errorMessage }
        }));
      }

      console.error(`Error fetching ${source}:`, error);
      return null;
    }
  }, [isDataStale, saveToCache]);

  // Individual fetch functions (stable)
  const refreshJobs = useCallback(async () => {
    return await fetchData('jobs', () => jobsApi.getJobs());
  }, [fetchData]);

  const refreshActiveJobs = useCallback(async () => {
    return await fetchData('activeJobs', () => jobsApi.getActiveJobs());
  }, [fetchData]);

  const refreshCurrentUser = useCallback(async () => {
    return await fetchData('currentUser', () => userApi.getCurrentUser());
  }, [fetchData]);

  const refreshActiveUsers = useCallback(async () => {
    return await fetchData('activeUsers', () => userApi.getActiveUsers());
  }, [fetchData]);

  const refreshClusterStatus = useCallback(async () => {
    return await fetchData('clusterStatus', () => jobsApi.getClusterStatus());
  }, [fetchData]);

  // Bulk refresh function (stable)
  const refreshData = useCallback(async (
    sources = ['jobs', 'activeJobs', 'clusterStatus', 'activeUsers'],
    silent = false
  ) => {
    if (!silent) setIsRefreshing(true);

    const refreshFunctions = {
      jobs: refreshJobs,
      activeJobs: refreshActiveJobs,
      currentUser: refreshCurrentUser,
      activeUsers: refreshActiveUsers,
      clusterStatus: refreshClusterStatus,
    };

    try {
      await Promise.allSettled(
        sources.map(source => {
          const refreshFn = refreshFunctions[source as keyof typeof refreshFunctions];
          return refreshFn ? refreshFn() : Promise.resolve();
        })
      );
    } finally {
      if (!silent) setIsRefreshing(false);
    }
  }, [refreshJobs, refreshActiveJobs, refreshCurrentUser, refreshActiveUsers, refreshClusterStatus]);

  // Setup automatic refresh intervals (only once on mount)
  const setupAutoRefresh = useCallback(() => {
    // Clear existing timeouts
    Object.values(refreshTimeouts.current).forEach(timeout => clearTimeout(timeout));
    refreshTimeouts.current = {};

    // Setup staggered refresh intervals to avoid API burst
    const scheduleRefresh = (source: string, delay: number) => {
      refreshTimeouts.current[source] = setTimeout(() => {
        const refreshFunctions = {
          jobs: refreshJobs,
          activeJobs: refreshActiveJobs,
          activeUsers: refreshActiveUsers,
          clusterStatus: refreshClusterStatus,
        };

        const refreshFn = refreshFunctions[source as keyof typeof refreshFunctions];
        if (refreshFn && isMounted.current) {
          refreshFn().then(() => {
            // Schedule next refresh
            if (isMounted.current) {
              scheduleRefresh(source, CACHE_DURATION[source as keyof typeof CACHE_DURATION]);
            }
          });
        }
      }, delay);
    };

    // Stagger the initial delays to spread API calls
    scheduleRefresh('activeJobs', 5000);   // 5s delay
    scheduleRefresh('jobs', 10000);        // 10s delay  
    scheduleRefresh('activeUsers', 15000); // 15s delay
    scheduleRefresh('clusterStatus', 20000); // 20s delay
  }, [refreshJobs, refreshActiveJobs, refreshActiveUsers, refreshClusterStatus]);

  // Load cached data on mount (only once)
  useEffect(() => {
    loadFromCache();
  }, [loadFromCache]);

  // Initial data fetch and setup auto-refresh (only once)
  useEffect(() => {
    // Initial fetch for critical data
    refreshData(['currentUser', 'jobs', 'activeJobs', 'clusterStatus'], true);

    // Setup auto-refresh
    setupAutoRefresh();

    return () => {
      isMounted.current = false;
      Object.values(refreshTimeouts.current).forEach(timeout => clearTimeout(timeout));
    };
  }, []); // Empty dependency array to run only once

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  return {
    ...state,
    refreshData,
    refreshJobs,
    refreshActiveJobs,
    refreshCurrentUser,
    refreshActiveUsers,
    refreshClusterStatus,
    isRefreshing,
  };
}
