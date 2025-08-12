"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { jobsApi, adminApi, userApi } from "@/lib/api-client";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { 
  Plus, 
  RefreshCcw, 
  Settings, 
  Loader2, 
  Play, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  Pause,
  Activity,
  Server,
  Code2,
  Trash2,
  ExternalLink,
  Calendar,
  Cpu,
  HardDrive,
  Monitor,
  Network,
  Zap,
  Users
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { Job, User } from "@/lib/types";
import axios from "axios";
import { JobCard } from "./components/job-card-new";
import { AnimatePresence } from "framer-motion";
import { CreateUserDialog } from "./components/create-user-dialog";
import { EditUserDialog } from "./components/edit-user-dialog";
import { ClusterStatsCard } from "@/components/cluster-stats-card";
import { ResourceUsageChart } from "./components/resource-usage-chart";
import { OptimizedResourceUsageChart } from "./components/optimized-resource-usage-chart";
import { formatContainerName } from "@/lib/container-utils";
import { TaskQueueDashboard } from "./components/task-queue-dashboard";
import { CodeServerModal } from "@/components/code-server-modal";
import { useTranslation } from "@/lib/i18n/LanguageContext";
import { ConnectionStatusCard } from "@/components/connection-status-card";
import { useConnectionStatusContext } from "@/contexts/ConnectionStatusContext";
import { ClusterHealthIndicator } from "@/components/cluster-health-indicator";
import { useCanCreateContainers, useClusterHealth } from "@/hooks/useClusterHealth";

// Define interface for cluster stats  
interface ClusterStats {
  id: number;
  free_nodes: number;
  busy_nodes: number;
  sleeping_nodes: number;  // zmienione z unavailable_nodes
  total_nodes: number;
  free_gpus: number;
  active_gpus: number;
  standby_gpus: number;
  busy_gpus: number;
  total_gpus: number;
  used_nodes: number;
  used_gpus: number;
  timestamp: string;
  source?: string;
}

// Define interface for tunnel data
interface TunnelData {
  id: number;
  local_port: number;
  remote_port: number;
  remote_host: string;
  status: string;
  created_at: string;
}

// Define interface for active job data
interface ActiveJobData {
  job_id: string;
  name: string;
  state: string;
  node: string;
  node_count: number;
  time_left: string;
  time_used?: string;
  memory_requested?: string;
  memory?: string;
  start_time?: string;
  submit_time?: string;
}

// Format date string to more readable format
const formatDate = (dateString: string) => {
  if (!dateString) return "N/A";
  const date = new Date(dateString);
  return date.toLocaleString();
};

// Helper function for error handling
const getErrorMessage = (error: unknown, defaultMessage: string): string => {
  if (error && typeof error === 'object' && 'response' in error) {
    const axiosError = error as { response?: { data?: { detail?: string } } };
    return axiosError.response?.data?.detail || defaultMessage;
  }
  return defaultMessage;
};

export default function DashboardPage() {
  const router = useRouter();
  const { t } = useTranslation();
  
  // Main state
  const [jobs, setJobs] = useState<Job[]>([]);
  const [activeJobs, setActiveJobs] = useState<ActiveJobData[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  
  // Admin state
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [allJobs, setAllJobs] = useState<Job[]>([]);
  const [isLoadingAdminData, setIsLoadingAdminData] = useState(false);
  
  // Dialog states
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  
  // Loading states
  const [isJobsLoading, setIsJobsLoading] = useState(false);
  const [isActiveJobsLoading, setIsActiveJobsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Operation states
  const [processingJobs, setProcessingJobs] = useState<Record<number, boolean>>({});
  
  // Confirmation dialog states
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [jobToDelete, setJobToDelete] = useState<Job | null>(null);
  
  // Data states
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);

  // WebSocket-based cluster status - FROM GLOBAL CONTEXT ONLY
  const { 
    connectionStatus,
    clusterStatus: clusterStats,
    clusterLoading: isClusterStatsLoading,
    clusterError: clusterStatsError,
    clusterLastUpdate,
    isClusterWebSocketActive: clusterWebSocketActive,
    requestClusterStatusUpdate
  } = useConnectionStatusContext();
  
  // Get WebSocket status from connection context (for UI display)
  const isWebSocketActive = connectionStatus.pcss.source === 'websocket';
  
  // DEBUG: Monitor both WebSocket statuses
  useEffect(() => {
    console.log('[Dashboard] ClusterStatus update:', { 
      clusterWebSocketActive, 
      connectionWebSocketActive: isWebSocketActive,
      pcssSource: connectionStatus.pcss.source,
      lastUpdate: clusterLastUpdate,
      loading: isClusterStatsLoading,
      hasClusterStats: !!clusterStats,
      clusterStatsKeys: clusterStats ? Object.keys(clusterStats) : null
    });
  }, [clusterWebSocketActive, isWebSocketActive, connectionStatus.pcss.source, clusterLastUpdate, isClusterStatsLoading, clusterStats]);
  
  // Cluster health status
  const canCreateContainers = useCanCreateContainers();
  const clusterHealth = useClusterHealth();
  
  // Domain readiness modal states
  const [isCodeServerModalOpen, setIsCodeServerModalOpen] = useState(false);
  const [codeServerModalJobId, setCodeServerModalJobId] = useState<number | null>(null);
  const [codeServerModalJobName, setCodeServerModalJobName] = useState<string>("");

  // Create a map of active jobs for efficient lookup
  const activeJobsMap = useMemo(() => {
    const map = new Map<string, ActiveJobData>();
    activeJobs.forEach((job) => {
      map.set(job.job_id, job);
    });
    return map;
  }, [activeJobs]);

  // Fetch jobs with better error handling
  const fetchJobs = useCallback(async () => {
    setIsJobsLoading(true);
    try {
      const response = await jobsApi.getJobs();
      setJobs(response.data);
      return response;
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error, t('errors.failedToFetchJobs'));
      // toast.error(errorMessage);
      console.error("Error fetching jobs:", error);
      throw error;
    } finally {
      setIsJobsLoading(false);
    }
  }, []);

  // Fetch active jobs with error handling
  const fetchActiveJobs = useCallback(async () => {
    setIsActiveJobsLoading(true);
    try {
      // Use the active jobs endpoint (containers only for now)
      const response = await jobsApi.getActiveJobs();
      
      // Advanced update strategy for animation preservation
      setActiveJobs(prevJobs => {
        const newJobs = response.data as ActiveJobData[];
        const prevJobsMap = new Map(prevJobs.map(job => [job.job_id, job]));
        const newJobsMap = new Map(newJobs.map((job: ActiveJobData) => [job.job_id, job]));
        
        // Keep jobs that haven't changed state
        const preservedJobs = prevJobs
          .filter(job => {
            const newJob = newJobsMap.get(job.job_id);
            return newJob && newJob.state === job.state;
          })
          .map(job => {
            // Update any values that might have changed but preserve reference if state is the same
            const newJob = newJobsMap.get(job.job_id)!;
            return { ...job, ...newJob };
          });
        
        // Add new jobs or those with changed state
        const changedJobs = newJobs.filter((job: ActiveJobData) => {
          const prevJob = prevJobsMap.get(job.job_id);
          return !prevJob || prevJob.state !== job.state;
        });
        
        // Return combined jobs in the same order as the API returns them
        // to maintain consistency in the UI
        return newJobs.map((newJob: ActiveJobData) => {
          const preservedJob = preservedJobs.find(j => j.job_id === newJob.job_id);
          return preservedJob || newJob;
        });
      });
      
      return response;
    } catch (error: unknown) {
      console.error("Error fetching active jobs:", error);
      // Not showing toast to avoid overwhelming the user with multiple error messages
      // during a single refresh operation - main error will come from refreshData
      throw error;
    } finally {
      setIsActiveJobsLoading(false);
    }
  }, []);

  // Fetch current user
  const fetchCurrentUser = useCallback(async () => {
    try {
      const response = await userApi.getCurrentUser();
      setCurrentUser(response.data);
      return response;
    } catch (error: unknown) {
      console.error("Error fetching current user:", error);
      throw error;
    }
  }, []);

  // Fetch admin data
  const fetchAdminData = useCallback(async () => {
    if (!currentUser?.is_superuser) return;
    
    setIsLoadingAdminData(true);
    try {
      const [usersResponse, jobsResponse] = await Promise.all([
        adminApi.getAllUsers(),
        adminApi.getAllJobs()
      ]);
      setAllUsers(usersResponse.data);
      setAllJobs(jobsResponse.data);
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error, t('errors.failedToFetchAdminData'));
      toast.error(errorMessage);
    } finally {
      setIsLoadingAdminData(false);
    }
  }, [currentUser?.is_superuser]);

  // Admin functions
  const handleEditUser = (user: User) => {
    setEditingUser(user);
    setIsEditDialogOpen(true);
  };

  const handleDeleteUser = async (userId: number) => {
    if (!confirm(t('dashboard.confirmations.deleteUserConfirm'))) {
      return;
    }

    try {
      await adminApi.deleteUser(userId);
      toast.success(t('dashboard.confirmations.userDeletedSuccess'));
      fetchAdminData(); // Refresh admin data
    } catch (error: any) {
      const errorMessage = error.response?.data?.detail || t('errors.failedToDeleteUser');
      toast.error(errorMessage);
    }
  };

  const handleUserCreatedOrUpdated = () => {
    fetchAdminData(); // Refresh admin data
  };

  // Initial data fetching
  useEffect(() => {
    const initialFetch = async () => {
      try {
        await Promise.all([
          fetchJobs(),
          fetchActiveJobs(),
          fetchCurrentUser()
        ]);
      } catch (error) {
        console.error("Error during initial data fetch:", error);
      }
    };
    
    initialFetch();
  }, [fetchJobs, fetchActiveJobs, fetchCurrentUser]);

  // Fetch admin data when user changes and is admin
  useEffect(() => {
    if (currentUser?.is_superuser) {
      fetchAdminData();
    }
  }, [currentUser?.is_superuser, fetchAdminData]);

  // Check if a job can use Code Server
  const canUseCodeServer = useCallback((job: Job): boolean => {
    // Strict check - job must be RUNNING and have node and port
    const isRunning = job.status === "RUNNING";
    const hasPort = !!job.port;
    
    return isRunning && hasPort;
  }, []);

  // Refresh status for icon animation
  const [refreshStatus, setRefreshStatus] = useState<'idle' | 'success' | 'error'>('idle');
  
  // Refresh all data
  const refreshData = useCallback(async (showFeedback = true) => {
    setIsRefreshing(true);
    setRefreshStatus('idle');
    
    try {
      await Promise.all([
        fetchJobs(), 
        fetchActiveJobs()
      ]);
      
      if (showFeedback) {
        setRefreshStatus('success');
        // Reset status after animation
        setTimeout(() => setRefreshStatus('idle'), 2000);
      }
    } catch (error) {
      console.error("Error refreshing data:", error);
      if (showFeedback) {
        setRefreshStatus('error');
        // Reset status after animation
        setTimeout(() => setRefreshStatus('idle'), 2000);
      }
    } finally {
      setIsRefreshing(false);
    }
  }, [fetchJobs, fetchActiveJobs]);

  // Auto-refresh timer
  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    if (autoRefreshEnabled) {
      intervalId = setInterval(() => {
        refreshData(false); // Silent refresh (no toast)
      }, 30000); // Every 30 seconds (reduced from 10s to minimize server load)
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [autoRefreshEnabled, refreshData]);

  // Show delete confirmation
  const handleDelete = useCallback((job: Job) => {
    setJobToDelete(job);
    setDeleteConfirmOpen(true);
  }, []);

  // Actually delete a job after confirmation
  const confirmDelete = useCallback(async () => {
    if (!jobToDelete) return;
    
    // Set processing state for this job
    setProcessingJobs(prev => ({ ...prev, [jobToDelete.id]: true }));
    
    try {
      await jobsApi.deleteJob(jobToDelete.id);
      setJobs(prev => prev.filter(job => job.id !== jobToDelete.id));
      toast.success(t('dashboard.confirmations.containerDeletedSuccess'));
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error, t('errors.failedToDeleteContainer'));
      toast.error(errorMessage);
      console.error(`Error deleting job ${jobToDelete.id}:`, error);
    } finally {
      // Clear processing state
      setProcessingJobs(prev => ({ ...prev, [jobToDelete.id]: false }));
      setJobToDelete(null);
    }
  }, [jobToDelete]);

  // Open Code Server with loading state
  const openCodeServer = useCallback(async (job: Job) => {
    try {
      // Open code server modal instead of direct API call
      setCodeServerModalJobId(job.id);
      setCodeServerModalJobName(job.job_name);
      setIsCodeServerModalOpen(true);
      // Set processing state for this job
      setProcessingJobs(prev => ({ ...prev, [job.id]: true }));
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error, "Could not open Code Server");
      console.error('Error opening Code Server:', error);
      toast.error(errorMessage, {
        duration: 5000,
        closeButton: true
      });
      console.error(`Code Server error for job ${job.id}:`, error);
      // Clear processing state on error
      setProcessingJobs(prev => ({ ...prev, [job.id]: false }));
    }
  }, []);

  // Navigate to job details
  const handleJobDetails = useCallback((jobId: number) => {
    router.push(`/dashboard/jobs/${jobId}`);
  }, [router]);

  // Handle code server modal close
  const handleCodeServerModalClose = useCallback(() => {
    setIsCodeServerModalOpen(false);
    setCodeServerModalJobId(null);
    setCodeServerModalJobName("");
    // Clear processing state when modal closes
    if (codeServerModalJobId) {
      setProcessingJobs(prev => ({ ...prev, [codeServerModalJobId]: false }));
    }
  }, [codeServerModalJobId]);

  // Memoize filtered job lists for better performance and animation stability
  const activeJobsList = useMemo(() => {
    return jobs.filter(job => job.status === "RUNNING" || job.status === "PENDING" || job.status === "CONFIGURING");
  }, [jobs]);
  
  const completedJobsList = useMemo(() => {
    return jobs.filter(job => job.status === "COMPLETED" || job.status === "FAILED" || job.status === "CANCELLED");
  }, [jobs]);
  
  // Keep these functions for backward compatibility
  const getActiveJobs = useCallback(() => activeJobsList, [activeJobsList]);
  const getCompletedJobs = useCallback(() => completedJobsList, [completedJobsList]);
// Download results for a completed task
const handleDownloadResults = useCallback(async (taskId: number) => {
  try {
    const response = await fetch(`/api/v1/tasks/${taskId}/download`, {
      method: 'GET',
      headers: {
        'Accept': 'application/zip',
      },
    });
    if (!response.ok) {
      toast.error('Nie udało się pobrać wyników zadania.');
      return;
    }
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `task_${taskId}_results.zip`);
    document.body.appendChild(link);
    link.click();
    link.parentNode?.removeChild(link);
    window.URL.revokeObjectURL(url);
    toast.success('Wyniki zadania zostały pobrane.');
  } catch (error) {
    toast.error('Wystąpił błąd podczas pobierania wyników zadania.');
    console.error('Download error:', error);
  }
}, []);

  // Calculate used resources from active jobs
  const getUsedContainers = useCallback(() => {
    return getActiveJobs().filter(job => job.status === "RUNNING").length;
  }, [getActiveJobs]);

  const getUsedGPUs = useCallback(() => {
    return getActiveJobs()
      .filter(job => job.status === "RUNNING")
      .reduce((total, job) => total + (job.num_gpus || 0), 0);
  }, [getActiveJobs]);

  // Determine if cluster is fully operational - now using connection status hook
  const isClusterOperational = useMemo(() => {
    // This will be handled by the ConnectionStatusCard component now
    return true; // Default to true to avoid blocking UI
  }, []);

  // Determine if any data is loading
  const isAnyLoading = isJobsLoading || isActiveJobsLoading;

  return (
    <div className="space-y-6 ">
      {/* Header with title and action buttons */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <h1 className="text-3xl font-bold">
            {t('dashboard.taskManagement.title')}
            {isAnyLoading && <span className="inline-block ml-2 align-middle"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></span>}
          </h1>
          <ClusterHealthIndicator variant="badge" showTooltip={true} />
        </div>
        <div className="flex gap-2 items-center">
          <Button 
            onClick={() => setAutoRefreshEnabled(!autoRefreshEnabled)} 
            variant={autoRefreshEnabled ? "default" : "outline"}
            size="sm"
          >
            {autoRefreshEnabled ? t('dashboard.taskManagement.autoRefresh.on') : t('dashboard.taskManagement.autoRefresh.off')}
          </Button>
          <Button 
            onClick={() => refreshData(true)} 
            variant={refreshStatus === 'error' ? "destructive" : "outline"} 
            size="sm" 
            disabled={isRefreshing || isAnyLoading}
            className={`min-w-[100px] transition-all duration-300
              ${refreshStatus === 'success' ? "border-emerald-500 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400" : ""}
            `}
          >
            <RefreshCcw 
              className={`h-4 w-4 mr-2 transition-all duration-300 
                ${isRefreshing ? "animate-spin" : ""} 
                ${refreshStatus === 'success' ? "text-emerald-600 dark:text-emerald-400" : ""} 
                ${refreshStatus === 'error' ? "text-white" : ""}
              `} 
            />
            {t('dashboard.taskManagement.refreshButton')}
          </Button>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Link href="/dashboard/jobs/create">
                    <Button 
                      size="sm" 
                      disabled={!canCreateContainers}
                      className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-semibold shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      {t('dashboard.actions.newContainer')}
                    </Button>
                  </Link>
                </span>
              </TooltipTrigger>
              {!canCreateContainers && (
                <TooltipContent>
                  <div>
                    <p>{t('dashboard.clusterStatus.containerCreationDisabled')}</p>
                    {clusterHealth.issues.length > 0 && (
                      <div className="mt-2 text-xs">
                        <p className="font-medium">Issues:</p>
                        <ul className="list-disc list-inside">
                          {clusterHealth.issues.slice(0, 3).map((issue, index) => (
                            <li key={index}>{issue}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
          <Link href="/dashboard/settings">
            <Button variant="outline" size="sm">
              <Settings className="h-4 w-4 mr-2" />
              {t('dashboard.taskManagement.settings')}
            </Button>
          </Link>
        </div>
      </div>

      {/* Status połączeń - nowy zoptymalizowany komponent */}
      <ConnectionStatusCard 
        className="backdrop-blur-sm"
        showRefreshButton={true}
        compact={false}
      />

      {/* Zadania */}
      <Tabs defaultValue="all" className="w-full">
        <TabsList className="backdrop-blur-sm bg-gradient-to-r from-slate-500/10 via-slate-600/5 to-gray-700/10 dark:from-slate-400/15 dark:via-slate-500/10 dark:to-gray-600/15 border border-slate-200/20 dark:border-slate-700/20">
          <TabsTrigger value="all">{t('dashboard.tabs.activeTasks')}</TabsTrigger>
          {/* <TabsTrigger value="active">Lista zadań</TabsTrigger> */}
          <TabsTrigger value="task-queue">{t('dashboard.tabs.taskQueue')}</TabsTrigger>
          <TabsTrigger value="completed">{t('dashboard.tabs.completedTasks')}</TabsTrigger>
          {currentUser?.is_superuser && (
            <TabsTrigger value="admin">{t('dashboard.tabs.adminPanel')}</TabsTrigger>
          )}
        </TabsList>
        
        {/* Active jobs tab (renamed from All jobs) */}
        <TabsContent value="all" className="mt-4">
          <Card className="group relative overflow-hidden backdrop-blur-sm bg-gradient-to-br from-slate-500/5 via-slate-600/3 to-gray-700/5 dark:from-slate-400/10 dark:via-slate-500/5 dark:to-gray-600/10 border border-slate-200/20 dark:border-slate-700/20 hover:border-slate-300/30 dark:hover:border-slate-600/30 transition-all duration-300">
            <div className="absolute inset-0 bg-gradient-to-br from-slate-500/3 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            <CardHeader className="pb-2 relative">
              <CardTitle className="text-slate-900 dark:text-slate-100">{t('dashboard.taskSections.activeTasks')}</CardTitle>
              <CardDescription className="text-slate-600 dark:text-slate-400">
                Przegląd aktywnych kontenerów i statystyki klastra
              </CardDescription>
            </CardHeader>
            <CardContent className="relative">
              {/* Header section with stats */}
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 mb-8">
            {/* Aktywne */}
            <Card className="group relative overflow-hidden backdrop-blur-sm bg-gradient-to-br from-emerald-500/5 via-emerald-600/3 to-emerald-700/5 dark:from-emerald-400/10 dark:via-emerald-500/5 dark:to-emerald-600/10 border border-emerald-200/20 dark:border-emerald-700/20 hover:border-emerald-300/30 dark:hover:border-emerald-600/30 transition-all duration-300 hover:shadow-lg hover:shadow-emerald-500/5 dark:hover:shadow-emerald-400/5">
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/3 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <CardContent className="p-6 relative">
                <div className="flex items-start justify-between">
                  <div className="space-y-1 flex-1">
                    <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">{t('dashboard.stats.activeContainers')}</p>
                    <p className="text-3xl font-bold text-emerald-900 dark:text-emerald-100 tracking-tight">
                      {getActiveJobs().filter(job => job.status === "RUNNING").length}
                    </p>
                  </div>
                  <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-emerald-400/80 to-emerald-600/80 flex items-center justify-center shadow-md group-hover:scale-110 transition-transform duration-300 flex-shrink-0">
                    <Activity className="h-6 w-6 text-white" />
                  </div>
                </div>
                <div className="mt-3 flex items-center text-xs text-emerald-600 dark:text-emerald-400">
                  <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 mr-2 animate-pulse" />
                  {t('dashboard.actions.running')}
                </div>
              </CardContent>
            </Card>
            
            {/* Oczekujące */}
            <Card className="group relative overflow-hidden backdrop-blur-sm bg-gradient-to-br from-amber-500/5 via-amber-600/3 to-orange-700/5 dark:from-amber-400/10 dark:via-amber-500/5 dark:to-orange-600/10 border border-amber-200/20 dark:border-amber-700/20 hover:border-amber-300/30 dark:hover:border-amber-600/30 transition-all duration-300 hover:shadow-lg hover:shadow-amber-500/5 dark:hover:shadow-amber-400/5">
              <div className="absolute inset-0 bg-gradient-to-br from-amber-500/3 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <CardContent className="p-6 relative">
                <div className="flex items-start justify-between">
                  <div className="space-y-1 flex-1">
                    <p className="text-sm font-medium text-amber-700 dark:text-amber-300">{t('dashboard.actions.pending')}</p>
                    <p className="text-3xl font-bold text-amber-900 dark:text-amber-100 tracking-tight">
                      {getActiveJobs().filter(job => job.status === "PENDING" || job.status === "CONFIGURING").length}
                    </p>
                  </div>
                  <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-amber-400/80 to-orange-600/80 flex items-center justify-center shadow-md group-hover:scale-110 transition-transform duration-300 flex-shrink-0">
                    <Clock className="h-6 w-6 text-white" />
                  </div>
                </div>
                <div className="mt-3 flex items-center text-xs text-amber-600 dark:text-amber-400">
                  <div className="h-1.5 w-1.5 rounded-full bg-amber-500 mr-2 animate-pulse" />
                  {t('dashboard.actions.waitingToStart')}
                </div>
              </CardContent>
            </Card>

            {/* Używane węzły */}
            <Card className="group relative overflow-hidden backdrop-blur-sm bg-gradient-to-br from-purple-500/5 via-purple-600/3 to-violet-700/5 dark:from-purple-400/10 dark:via-purple-500/5 dark:to-violet-600/10 border border-purple-200/20 dark:border-purple-700/20 hover:border-purple-300/30 dark:hover:border-purple-600/30 transition-all duration-300 hover:shadow-lg hover:shadow-purple-500/5 dark:hover:shadow-purple-400/5">
              <div className="absolute inset-0 bg-gradient-to-br from-purple-500/3 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <CardContent className="p-6 relative">
                <div className="flex items-start justify-between">
                  <div className="space-y-1 flex-1">
                    <p className="text-sm font-medium text-purple-700 dark:text-purple-300">Używane węzły</p>
                    <p className="text-2xl lg:text-3xl font-bold text-purple-900 dark:text-purple-100 tracking-tight">
                      {currentUser ? `${getUsedContainers()}/${currentUser.max_containers || 6}` : "–"}
                    </p>
                  </div>
                  <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-purple-400/80 to-violet-600/80 flex items-center justify-center shadow-md group-hover:scale-110 transition-transform duration-300 flex-shrink-0">
                    <Cpu className="h-6 w-6 text-white" />
                  </div>
                </div>
                <div className="mt-3 flex items-center text-xs text-purple-600 dark:text-purple-400">
                  <div className="h-1.5 w-1.5 rounded-full bg-purple-500 mr-2" />
                  Limit wykorzystania
                </div>
              </CardContent>
            </Card>

            {/* Używane GPU */}
            <Card className="group relative overflow-hidden backdrop-blur-sm bg-gradient-to-br from-orange-500/5 via-red-500/3 to-pink-600/5 dark:from-orange-400/10 dark:via-red-500/5 dark:to-pink-600/10 border border-orange-200/20 dark:border-orange-700/20 hover:border-orange-300/30 dark:hover:border-orange-600/30 transition-all duration-300 hover:shadow-lg hover:shadow-orange-500/5 dark:hover:shadow-orange-400/5">
              <div className="absolute inset-0 bg-gradient-to-br from-orange-500/3 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <CardContent className="p-6 relative">
                <div className="flex items-start justify-between">
                  <div className="space-y-1 flex-1">
                    <p className="text-sm font-medium text-orange-700 dark:text-orange-300">Używane GPU</p>
                    <p className="text-2xl lg:text-3xl font-bold text-orange-900 dark:text-orange-100 tracking-tight">
                      {currentUser ? `${getUsedGPUs()}/${currentUser.max_gpus || 24}` : "–"}
                    </p>
                  </div>
                  <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-orange-400/80 to-red-600/80 flex items-center justify-center shadow-md group-hover:scale-110 transition-transform duration-300 flex-shrink-0">
                    <Zap className="h-6 w-6 text-white" />
                  </div>
                </div>
                <div className="mt-3 flex items-center text-xs text-orange-600 dark:text-orange-400">
                  <div className="h-1.5 w-1.5 rounded-full bg-orange-500 mr-2" />
                  Karty graficzne
                </div>
              </CardContent>
            </Card>

            {/* PCSS Cluster Stats Card */}
            <ClusterStatsCard 
              onRefresh={requestClusterStatusUpdate}
              isWebSocketActive={isWebSocketActive}
              lastUpdate={clusterLastUpdate}
              clusterStatus={clusterStats}
              loading={isClusterStatsLoading}
              error={clusterStatsError}
            />
          </div>
          
          {/* Resource usage chart - full width with proper spacing */}
          <div className="mt-6">
            <OptimizedResourceUsageChart />
            {/* Fallback to old chart if needed - uncomment if issues persist
            <ResourceUsageChart />
            */}
          </div>
          
          {/* Loading state with skeleton cards only when there are no jobs yet */}
          {isJobsLoading && jobs.length === 0 ? (              
            <div className="grid gap-6 auto-rows-max grid-cols-1 min-[720px]:grid-cols-2 min-[1080px]:grid-cols-3 min-[1440px]:grid-cols-4 min-[1800px]:grid-cols-5">
              {Array(3).fill(0).map((_, i) => (
                <Card key={i} className="group relative overflow-hidden backdrop-blur-md bg-gradient-to-br from-slate-500/10 via-slate-600/5 to-gray-700/10 dark:from-slate-400/20 dark:via-slate-500/10 dark:to-gray-600/20 border border-slate-200/30 dark:border-slate-700/30">
                  <div className="animate-pulse bg-gradient-to-br from-slate-200/30 to-slate-300/30 dark:from-slate-600/30 dark:to-slate-700/30 absolute inset-0" />
                  <CardHeader className="pb-3 relative">
                    <div className="flex items-center justify-between">
                      <div className="h-6 w-32 bg-slate-400/40 dark:bg-slate-500/40 rounded-lg" />
                      <div className="h-5 w-20 bg-slate-400/40 dark:bg-slate-500/40 rounded-full" />
                    </div>
                    <div className="h-4 w-24 bg-slate-300/40 dark:bg-slate-600/40 rounded-lg mt-2" />
                  </CardHeader>
                  <CardContent className="space-y-4 relative">
                    <div className="bg-gradient-to-br from-slate-200/20 to-slate-300/20 dark:from-slate-700/20 dark:to-slate-800/20 backdrop-blur-sm rounded-xl p-3 space-y-2 border border-slate-300/20 dark:border-slate-600/20">
                      <div className="h-4 w-16 bg-slate-400/40 dark:bg-slate-500/40 rounded-lg" />
                      <div className="grid grid-cols-2 gap-3">
                        {Array(4).fill(0).map((_, j) => (
                          <div key={j} className="h-3 w-full bg-slate-300/40 dark:bg-slate-600/40 rounded-lg" />
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : getActiveJobs().length === 0 ? (
            <Card className="group relative overflow-hidden backdrop-blur-sm bg-gradient-to-br from-slate-500/5 via-slate-600/3 to-gray-700/5 dark:from-slate-400/10 dark:via-slate-500/5 dark:to-gray-600/10 border border-slate-200/20 dark:border-slate-700/20 hover:border-slate-300/30 dark:hover:border-slate-600/30 transition-all duration-300 text-center py-12">
              <div className="absolute inset-0 bg-gradient-to-br from-slate-500/3 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <CardContent className="relative">
                <div className="flex flex-col items-center space-y-4">
                  <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-slate-400/80 to-gray-600/80 flex items-center justify-center shadow-md">
                    <Server className="h-8 w-8 text-white" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                      {t('dashboard.emptyStates.noActiveContainers')}
                    </h3>
                    <p className="text-slate-600 dark:text-slate-400 max-w-sm">
                      {t('dashboard.emptyStates.noActiveContainersDescription')}
                    </p>
                  </div>
                  <Link href="/dashboard/jobs/create">
                    <Button className="mt-4 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-semibold shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105">
                      <Plus className="h-4 w-4 mr-2" />
                      Utwórz pierwszy kontener
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>          ) : (
            <AnimatePresence mode="popLayout">
              <div className="flex flex-wrap justify-start gap-6 mt-6">
                {getActiveJobs().map((job) => (
                  <JobCard 
                    key={job.id}
                    job={job}
                    tunnels={[]}
                    activeJobData={activeJobsMap.get(job.job_id)}
                    isProcessing={processingJobs[job.id] || false}
                    onDelete={() => handleDelete(job)}
                    onOpenCodeServer={() => openCodeServer(job)}
                    canUseCodeServer={canUseCodeServer(job)}
                    formatDate={formatDate}
                    onDetails={() => handleJobDetails(job.id)}
                  />
                ))}
              </div>
            </AnimatePresence>
          )}
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* Active jobs tab */}
        <TabsContent value="active" className="mt-4">
          <Card className="group relative overflow-hidden backdrop-blur-sm bg-gradient-to-br from-blue-500/5 via-blue-600/3 to-cyan-700/5 dark:from-blue-400/10 dark:via-blue-500/5 dark:to-cyan-600/10 border border-blue-200/20 dark:border-blue-700/20 hover:border-blue-300/30 dark:hover:border-blue-600/30 transition-all duration-300">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/3 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            <CardHeader className="pb-2 relative">
              <CardTitle className="text-blue-900 dark:text-blue-100">{t('dashboard.taskSections.activeTasksTitle')}</CardTitle>
              <CardDescription className="text-blue-600 dark:text-blue-400">
                Zadania aktualnie wykonywane lub oczekujące na klastrze
              </CardDescription>
            </CardHeader>
            <CardContent className="relative">              
              {getActiveJobs().length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>Brak aktywnych zadań.</p>
                </div>
              ) : (
                <AnimatePresence mode="popLayout">
                  <div className="flex flex-wrap justify-center gap-6 mt-6">
                    {getActiveJobs().map((job) => (
                      <JobCard 
                        key={job.id}
                        job={job}
                        tunnels={[]}
                        activeJobData={activeJobsMap.get(job.job_id)}
                        isProcessing={processingJobs[job.id] || false}
                        onDelete={() => handleDelete(job)}
                        onOpenCodeServer={() => openCodeServer(job)}
                        canUseCodeServer={canUseCodeServer(job)}
                        formatDate={formatDate}
                        onDetails={() => handleJobDetails(job.id)}
                      />
                    ))}
                  </div>
                </AnimatePresence>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* Task Queue tab */}
        <TabsContent value="task-queue" className="mt-4">
          <TaskQueueDashboard />
        </TabsContent>
        
        {/* Completed jobs tab */}
        <TabsContent value="completed" className="mt-4">
          <Card className="group relative overflow-hidden backdrop-blur-sm bg-gradient-to-br from-green-500/5 via-emerald-600/3 to-teal-700/5 dark:from-green-400/10 dark:via-emerald-500/5 dark:to-teal-600/10 border border-green-200/20 dark:border-green-700/20 hover:border-green-300/30 dark:hover:border-green-600/30 transition-all duration-300">
            <div className="absolute inset-0 bg-gradient-to-br from-green-500/3 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            <CardHeader className="pb-2 relative">
              <CardTitle className="text-green-900 dark:text-green-100">Zadania zakończone</CardTitle>
              <CardDescription className="text-green-600 dark:text-green-400">
                Zadania zakończone, anulowane lub zakończone błędem
              </CardDescription>
            </CardHeader>
            <CardContent className="relative">
              {getCompletedJobs().length === 0 && !isRefreshing ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>Brak zakończonych zadań.</p>
                </div>
              ) : (
                <AnimatePresence mode="popLayout">
                  <div className="flex flex-wrap justify-center gap-6 mt-6">
                    {getCompletedJobs().map((job) => (
                      <div key={job.id} className="relative">
                        <JobCard 
                          job={job}
                          tunnels={[]}
                          activeJobData={activeJobsMap.get(job.job_id)}
                          isProcessing={processingJobs[job.id] || false}
                          onDelete={() => handleDelete(job)}
                          onOpenCodeServer={() => openCodeServer(job)}
                          canUseCodeServer={canUseCodeServer(job)}
                          formatDate={formatDate}
                          onDetails={() => handleJobDetails(job.id)}
                        />
                        {/* Download results button for completed tasks */}
                        {job.status === "COMPLETED" && (
                          <div className="absolute top-2 right-2 z-10">
                            <Button
                              size="sm"
                              variant="outline"
                              className="bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-semibold shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105"
                              onClick={() => handleDownloadResults(job.id)}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V4" /></svg>
                              Pobierz wyniki
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </AnimatePresence>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Admin panel tab */}
        {currentUser?.is_superuser && (
          <TabsContent value="admin" className="mt-4">
            <div className="space-y-6">
              {/* Users Management */}
              <Card className="group relative overflow-hidden backdrop-blur-sm bg-gradient-to-br from-indigo-500/5 via-purple-600/3 to-violet-700/5 dark:from-indigo-400/10 dark:via-purple-500/5 dark:to-violet-600/10 border border-indigo-200/20 dark:border-indigo-700/20 hover:border-indigo-300/30 dark:hover:border-indigo-600/30 transition-all duration-300">
                <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/3 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <CardHeader className="pb-4 relative">
                  <CardTitle className="flex items-center gap-2 text-indigo-900 dark:text-indigo-100">
                    <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-indigo-400/80 to-purple-600/80 flex items-center justify-center shadow-md">
                      <Settings className="h-4 w-4 text-white" />
                    </div>
                    Zarządzanie użytkownikami
                  </CardTitle>
                  <CardDescription className="text-indigo-600 dark:text-indigo-400">
                    Lista wszystkich użytkowników systemu
                  </CardDescription>
                </CardHeader>
                <CardContent className="relative">
                  {isLoadingAdminData ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin mr-2" />
                      <span>Ładowanie danych...</span>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <h3 className="text-lg font-semibold">Użytkownicy ({allUsers.length})</h3>
                        <CreateUserDialog onUserCreated={handleUserCreatedOrUpdated} />
                      </div>
                      
                      <div className="grid gap-4">
                        {allUsers.map((user) => (
                          <Card key={user.id} className="group relative overflow-hidden backdrop-blur-md bg-gradient-to-br from-indigo-500/10 via-purple-500/5 to-violet-600/10 dark:from-indigo-400/20 dark:via-purple-500/10 dark:to-violet-600/20 border border-indigo-200/30 dark:border-indigo-700/30 hover:border-indigo-300/50 dark:hover:border-indigo-600/50 transition-all duration-300">
                            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                            <CardContent className="p-4 relative">
                              <div className="flex justify-between items-start">
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2">
                                    <h4 className="font-medium">{user.username}</h4>
                                    {user.is_superuser && (
                                      <Badge variant="destructive" className="text-xs">
                                        Admin
                                      </Badge>
                                    )}
                                    {!user.is_active && (
                                      <Badge variant="secondary" className="text-xs">
                                        Nieaktywny
                                      </Badge>
                                    )}
                                  </div>
                                  <p className="text-sm text-muted-foreground">
                                    {user.email || "Brak emaila"}
                                  </p>
                                  <p className="text-sm text-muted-foreground">
                                    {user.first_name} {user.last_name}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    Utworzony: {formatDate(user.created_at)}
                                  </p>
                                </div>
                                <div className="flex gap-2">
                                  <Button 
                                    size="sm" 
                                    variant="outline"
                                    onClick={() => handleEditUser(user)}
                                  >
                                    Edytuj
                                  </Button>
                                  {user.id !== currentUser?.id && (
                                    <Button 
                                      size="sm" 
                                      variant="destructive"
                                      onClick={() => handleDeleteUser(user.id)}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  )}
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* All Jobs Management */}
              <Card className="group relative overflow-hidden backdrop-blur-sm bg-gradient-to-br from-amber-500/5 via-orange-600/3 to-red-700/5 dark:from-amber-400/10 dark:via-orange-500/5 dark:to-red-600/10 border border-amber-200/20 dark:border-amber-700/20 hover:border-amber-300/30 dark:hover:border-amber-600/30 transition-all duration-300">
                <div className="absolute inset-0 bg-gradient-to-br from-amber-500/3 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <CardHeader className="pb-4 relative">
                  <CardTitle className="flex items-center gap-2 text-amber-900 dark:text-amber-100">
                    <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-amber-400/80 to-orange-600/80 flex items-center justify-center shadow-md">
                      <Server className="h-4 w-4 text-white" />
                    </div>
                    Wszystkie kontenery
                  </CardTitle>
                  <CardDescription className="text-amber-600 dark:text-amber-400">
                    Przegląd wszystkich kontenerów w systemie
                  </CardDescription>
                </CardHeader>
                <CardContent className="relative">
                  {isLoadingAdminData ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin mr-2" />
                      <span>Ładowanie danych...</span>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <h3 className="text-lg font-semibold">Kontenery ({allJobs.length})</h3>
                        <Button 
                          size="sm"
                          variant="outline"
                          onClick={fetchAdminData}
                        >
                          <RefreshCcw className="h-4 w-4 mr-2" />
                          {t('dashboard.taskManagement.refreshButton')}
                        </Button>
                      </div>
                      
                      <div className="grid gap-4">
                        {allJobs.map((job) => (
                          <Card key={job.id} className="group relative overflow-hidden backdrop-blur-md bg-gradient-to-br from-amber-500/10 via-orange-500/5 to-red-600/10 dark:from-amber-400/20 dark:via-orange-500/10 dark:to-red-600/20 border border-amber-200/30 dark:border-amber-700/30 hover:border-amber-300/50 dark:hover:border-amber-600/50 transition-all duration-300">
                            <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                            <CardContent className="p-4 relative">
                              <div className="flex justify-between items-start">
                                <div className="space-y-2">
                                  <div className="flex items-center gap-2">
                                    <h4 className="font-medium">{job.job_name}</h4>
                                    <Badge 
                                      variant={
                                        job.status === "RUNNING" ? "default" :
                                        job.status === "COMPLETED" ? "secondary" :
                                        job.status === "FAILED" ? "destructive" :
                                        job.status === "PENDING" ? "outline" : "secondary"
                                      }
                                      className="text-xs"
                                    >
                                      {job.status}
                                    </Badge>
                                  </div>
                                  <div className="grid grid-cols-2 gap-4 text-sm text-muted-foreground">
                                    <div>
                                      <p><strong>Job ID:</strong> {job.job_id}</p>
                                      <p><strong>Właściciel:</strong> ID {job.owner_id}</p>
                                      <p><strong>Template:</strong> {formatContainerName(job.name || "Unknown")}</p>
                                    </div>
                                    <div>
                                      <p><strong>Węzeł:</strong> {job.node || "Brak"}</p>
                                      <p><strong>Partycja:</strong> {job.partition}</p>
                                      <p><strong>Utworzony:</strong> {formatDate(job.created_at)}</p>
                                    </div>
                                  </div>
                                  <div className="flex gap-4 text-sm text-muted-foreground">
                                    <span><Cpu className="h-4 w-4 inline mr-1" />{job.num_cpus} CPU</span>
                                    <span><HardDrive className="h-4 w-4 inline mr-1" />{job.memory_gb}GB RAM</span>
                                    <span><Monitor className="h-4 w-4 inline mr-1" />{job.num_gpus} GPU</span>
                                  </div>
                                </div>
                                <div className="flex flex-col gap-2">
                                  {job.port && job.status === "RUNNING" && (
                                    <Button 
                                      size="sm" 
                                      variant="outline"
                                      onClick={() => {/* TODO: Open code server for admin */}}
                                    >
                                      <Code2 className="h-4 w-4 mr-2" />
                                      Code Server
                                    </Button>
                                  )}
                                  <Button 
                                    size="sm" 
                                    variant="destructive"
                                    onClick={() => {/* TODO: Add admin job deletion */}}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        )}
      </Tabs>
      
      {/* Dialogs */}
      <EditUserDialog
        user={editingUser}
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        onUserUpdated={handleUserCreatedOrUpdated}
      />
      
      {/* Delete Confirmation Dialog */}
      <ConfirmationDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="Usuń kontener"
        description={jobToDelete ? `Czy na pewno chcesz usunąć kontener "${jobToDelete.job_name}"?\n\nInformacje o kontenerze:\n• ID: ${jobToDelete.id}\n• Status: ${jobToDelete.status}\n• Szablon: ${formatContainerName(jobToDelete.template_name)}\n• CPU: ${jobToDelete.num_cpus}, RAM: ${jobToDelete.memory_gb}GB, GPU: ${jobToDelete.num_gpus}\n• Utworzono: ${formatDate(jobToDelete.created_at)}\n\nTa operacja jest nieodwracalna.` : ""}
        confirmText="Usuń kontener"
        cancelText="Anuluj"
        onConfirm={confirmDelete}
        isLoading={jobToDelete ? (processingJobs[jobToDelete.id] || false) : false}
      />

      {/* Code Server Modal */}
      {codeServerModalJobId && (
        <CodeServerModal
          jobId={codeServerModalJobId}
          jobName={codeServerModalJobName}
          isOpen={isCodeServerModalOpen}
          onClose={handleCodeServerModalClose}
        />
      )}
      
    </div>
  );
}