"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { jobsApi, adminApi, userApi, clusterApi } from "@/lib/api-client";
import { 
  Plus, 
  RefreshCcw, 
  Settings, 
  Loader2, 
  Play, 
  Clock, 
  AlertCircle, 
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
  Zap
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { Job, User } from "@/lib/types";
import axios from "axios";
import { ModernJobCard } from "./components/modern-job-card";
import { AnimatePresence } from "framer-motion";
import { CreateUserDialog } from "./components/create-user-dialog";
import { EditUserDialog } from "./components/edit-user-dialog";
import { ClusterStatsCard } from "@/components/cluster-stats-card";

// Define interface for cluster stats  
interface ClusterStats {
  id: number;
  // Nowe szczegółowe pola węzłów
  free_nodes: number;
  busy_nodes: number;
  unavailable_nodes: number;
  total_nodes: number;
  // Nowe szczegółowe pola GPU
  free_gpus: number;
  active_gpus: number;
  standby_gpus: number;
  busy_gpus: number;
  total_gpus: number;
  // Legacy pola (dla kompatybilności wstecznej)
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
  const [isClusterStatusLoading, setIsClusterStatusLoading] = useState(false);
  const [isClusterStatsLoading, setIsClusterStatsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Operation states
  const [processingJobs, setProcessingJobs] = useState<Record<number, boolean>>({});
  
  // Data states
  const [clusterStatus, setClusterStatus] = useState<{connected: boolean, slurm_running: boolean} | null>(null);
  const [clusterStats, setClusterStats] = useState<ClusterStats | null>(null);
  const [jobTunnels, setJobTunnels] = useState<Record<number, TunnelData[]>>({});
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);

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
      const errorMessage = getErrorMessage(error, "Nie udało się pobrać listy zadań");
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

  // Check cluster status with error handling
  const checkClusterStatus = useCallback(async () => {
    setIsClusterStatusLoading(true);
    try {
      const response = await jobsApi.getClusterStatus();
      setClusterStatus(response.data);
      return response;
    } catch (error: unknown) {
      console.error("Error checking cluster status:", error);
      setClusterStatus({ connected: false, slurm_running: false });
      throw error;
    } finally {
      setIsClusterStatusLoading(false);
    }
  }, []);

  // Fetch cluster stats
  const fetchClusterStats = useCallback(async () => {
    setIsClusterStatsLoading(true);
    try {
      const response = await clusterApi.getStats();
      setClusterStats(response.data);
      return response;
    } catch (error: unknown) {
      console.error("Error fetching cluster stats:", error);
      setClusterStats(null);
      throw error;
    } finally {
      setIsClusterStatsLoading(false);
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
      const errorMessage = getErrorMessage(error, "Nie udało się pobrać danych administracyjnych");
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
    if (!confirm("Czy na pewno chcesz usunąć tego użytkownika? Ta operacja jest nieodwracalna.")) {
      return;
    }

    try {
      await adminApi.deleteUser(userId);
      toast.success("Użytkownik został usunięty pomyślnie");
      fetchAdminData(); // Refresh admin data
    } catch (error: any) {
      const errorMessage = error.response?.data?.detail || "Nie udało się usunąć użytkownika";
      toast.error(errorMessage);
    }
  };

  const handleUserCreatedOrUpdated = () => {
    fetchAdminData(); // Refresh admin data
  };

  // Fetch tunnel information with improved error handling
const fetchTunnelInfo = useCallback(async (jobId: number) => {
  try {
    const response = await jobsApi.getJobTunnels(jobId);
    setJobTunnels(prev => ({
      ...prev,
      [jobId]: response.data
    }));
  } catch (error: unknown) {
    console.error(`Error fetching tunnel info for job ${jobId}:`, error); // Zachowaj ogólne logowanie

    if (axios.isAxiosError(error)) {
      if (error.response) {
        // Serwer odpowiedział błędem
        if (error.response.status === 500) {
          toast.error(`Wystąpił wewnętrzny błąd serwera przy pobieraniu tuneli dla zadania ${jobId}. Prosimy spróbować później.`);
          // Możesz też zapisać gdzieś, że dla tego joba nie udało się pobrać tuneli
          // np. setJobTunnelsError(jobId, true);
        } else {
          // Inne błędy serwera (np. 400, 404)
          const message = error.response.data?.detail || `Błąd serwera (${error.response.status}) przy pobieraniu tuneli.`;
          toast.error(message);
        }
      } else if (error.request) {
        toast.error(`Brak odpowiedzi od serwera przy próbie pobrania tuneli dla zadania ${jobId}.`);
      } else {
        toast.error(`Błąd konfiguracji żądania tuneli dla zadania ${jobId}.`);
      }
    } else {
      toast.error(`Wystąpił nieoczekiwany błąd przy pobieraniu tuneli dla zadania ${jobId}.`);
    }
  }  }, []);

  // Fetch all tunnel information for running jobs
  const fetchAllTunnels = useCallback(() => {
    jobs.forEach(job => {
      if (job.status === "RUNNING" && job.node && job.port) {
        fetchTunnelInfo(job.id);
      }
    });
  }, [jobs, fetchTunnelInfo]);

  // Initial data fetching
  useEffect(() => {
    const initialFetch = async () => {
      try {
        await Promise.all([
          fetchJobs(),
          fetchActiveJobs(),
          checkClusterStatus(),
          fetchClusterStats(),
          fetchCurrentUser()
        ]);
      } catch (error) {
        console.error("Error during initial data fetch:", error);
      }
    };
    
    initialFetch();
  }, [fetchJobs, fetchActiveJobs, checkClusterStatus, fetchClusterStats, fetchCurrentUser]);

  // Fetch tunnels when jobs change
  useEffect(() => {
    fetchAllTunnels();
  }, [fetchAllTunnels]);

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
        fetchActiveJobs(), 
        checkClusterStatus(),
        fetchClusterStats()
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
  }, [fetchJobs, fetchActiveJobs, checkClusterStatus, fetchClusterStats]);

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

  // Delete a job with loading state
  const handleDelete = useCallback(async (jobId: number) => {
    // Set processing state for this job
    setProcessingJobs(prev => ({ ...prev, [jobId]: true }));
    
    try {
      await jobsApi.deleteJob(jobId);
      setJobs(prev => prev.filter(job => job.id !== jobId));
      toast.success("Kontener został usunięty");
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error, "Nie udało się usunąć kontenera");
      toast.error(errorMessage);
      console.error(`Error deleting job ${jobId}:`, error);
    } finally {
      // Clear processing state
      setProcessingJobs(prev => ({ ...prev, [jobId]: false }));
    }
  }, []);

  // Open Code Server with loading state
  const openCodeServer = useCallback(async (job: Job) => {
    // Set processing state for this job
    setProcessingJobs(prev => ({ ...prev, [job.id]: true }));
    
    try {
      const toastId = toast.loading("Establishing connection...", {
        closeButton: true
      });
      
      const response = await jobsApi.getCodeServerUrl(job.id);
      const { url } = response.data;
      
      window.open(url, '_blank');
      toast.success("Code Server connection established. Opening in new tab...", {
        id: toastId,
        duration: 5000, // 5 seconds
        closeButton: true
      });
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error, "Could not open Code Server");
      console.error('Error opening Code Server:', error);
      toast.error(errorMessage, {
        duration: 5000,
        closeButton: true
      });
      console.error(`Code Server error for job ${job.id}:`, error);
    } finally {
      // Clear processing state
      setProcessingJobs(prev => ({ ...prev, [job.id]: false }));
    }
  }, []);

  // Navigate to job details
  const handleJobDetails = useCallback((jobId: number) => {
    router.push(`/dashboard/jobs/${jobId}`);
  }, [router]);

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

  // Calculate used resources from active jobs
  const getUsedContainers = useCallback(() => {
    return getActiveJobs().filter(job => job.status === "RUNNING").length;
  }, [getActiveJobs]);

  const getUsedGPUs = useCallback(() => {
    return getActiveJobs()
      .filter(job => job.status === "RUNNING")
      .reduce((total, job) => total + (job.num_gpus || 0), 0);
  }, [getActiveJobs]);

  // Determine if cluster is fully operational
  const isClusterOperational = useMemo(() => {
    return clusterStatus && clusterStatus.connected && clusterStatus.slurm_running;
  }, [clusterStatus]);

  // Determine if any data is loading
  const isAnyLoading = isJobsLoading || isActiveJobsLoading || isClusterStatusLoading;

  return (
    <div className="space-y-6">
      {/* Header with title and action buttons */}
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">
          Panel zarządzania zadaniami
          {isAnyLoading && <span className="inline-block ml-2 align-middle"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></span>}
        </h1>
        <div className="flex gap-2 items-center">
          <Button 
            onClick={() => setAutoRefreshEnabled(!autoRefreshEnabled)} 
            variant={autoRefreshEnabled ? "default" : "outline"}
            size="sm"
          >
            Auto {autoRefreshEnabled ? "Wł" : "Wył"}
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
            Odśwież
          </Button>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Link href="/dashboard/submit-job">
                    <Button 
                      size="sm" 
                      disabled={!clusterStatus || (clusterStatus && (!clusterStatus.connected || !clusterStatus.slurm_running))}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Nowe zadanie
                    </Button>
                  </Link>
                </span>
              </TooltipTrigger>
              {(!clusterStatus || (clusterStatus && (!clusterStatus.connected || !clusterStatus.slurm_running))) && (
                <TooltipContent>
                  <p>Tworzenie kontenerów jest niemożliwe - klaster jest niedostępny</p>
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
          <Link href="/dashboard/settings">
            <Button variant="outline" size="sm">
              <Settings className="h-4 w-4 mr-2" />
              Ustawienia
            </Button>
          </Link>
        </div>
      </div>

      {/* Status klastra */}
      <Card 
        className={`backdrop-blur-sm transition-colors duration-300
          ${(!clusterStatus || (clusterStatus && (!clusterStatus.connected || !clusterStatus.slurm_running))) 
            ? 'bg-red-50/70 dark:bg-red-950/30 border-red-200 dark:border-red-800/50' 
            : 'bg-white/60 dark:bg-slate-800/60'
          }
        `}
      >
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center">
            Status połączenia z klastrem PCSS
            {(!clusterStatus || (clusterStatus && (!clusterStatus.connected || !clusterStatus.slurm_running))) && (
              <AlertCircle className="ml-2 h-5 w-5 text-red-500 dark:text-red-400" />
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isClusterStatusLoading && !clusterStatus ? (
            <div className="flex items-center">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              <p>Sprawdzanie statusu klastra...</p>
            </div>
          ) : !clusterStatus ? (
            <>
              <p className="text-red-600 dark:text-red-400 font-medium mb-2">Nie można uzyskać statusu klastra</p>
              <p className="text-sm text-red-500/80 dark:text-red-400/80">
                Brak odpowiedzi z serwera. Sprawdź połączenie sieciowe lub skontaktuj się z administratorem.
              </p>
            </>
          ) : (
            <>
              <div className="flex flex-wrap gap-4 mb-2">
                <div className="flex items-center">
                  <div className={`h-3 w-3 rounded-full mr-2 ${clusterStatus.connected ? 'bg-emerald-500 dark:bg-emerald-400' : 'bg-red-500 dark:bg-red-400'}`}></div>
                  <p className={clusterStatus.connected ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400 font-medium'}>
                    Połączenie SSH: {clusterStatus.connected ? 'Aktywne' : 'Nieaktywne'}
                  </p>
                </div>
                {/* <div className="flex items-center">
                  <div className={`h-3 w-3 rounded-full mr-2 ${clusterStatus.slurm_running ? 'bg-emerald-500 dark:bg-emerald-400' : 'bg-red-500 dark:bg-red-400'}`}></div>
                  <p className={clusterStatus.slurm_running ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400 font-medium'}>
                    System kolejkowy SLURM: {clusterStatus.slurm_running ? 'Działa' : 'Nie działa'}
                  </p>
                </div> */}
              </div>

              {(!clusterStatus.connected || !clusterStatus.slurm_running) && (
                <div className="bg-red-100/70 dark:bg-red-900/30 p-3 rounded-md mt-2 text-sm text-red-600 dark:text-red-300">
                  <p className="flex items-center">
                    <AlertCircle className="h-4 w-4 mr-2" />
                    {!clusterStatus.connected 
                      ? 'Nie można nawiązać połączenia SSH z klastrem. Nie musisz pisać do Mateusza, nic z tym nie zrobi ;)' 
                      : 'System kolejkowania SLURM nie odpowiada. Zadania obliczeniowe nie mogą być uruchamiane w tym momencie.'}
                  </p>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Zadania */}
      <Tabs defaultValue="all" className="w-full">
        <TabsList className="bg-white/60 backdrop-blur-sm dark:bg-slate-800/60">
          <TabsTrigger value="all">Aktywne zadania</TabsTrigger>
          <TabsTrigger value="active">Lista zadań</TabsTrigger>
          <TabsTrigger value="completed">Zadania zakończone</TabsTrigger>
          {currentUser?.is_superuser && (
            <TabsTrigger value="admin">Panel administracyjny</TabsTrigger>
          )}
        </TabsList>
        
        {/* Active jobs tab (renamed from All jobs) */}
        <TabsContent value="all" className="mt-4">
          <Card className="bg-white/60 backdrop-blur-sm dark:bg-slate-800/60">
            <CardHeader className="pb-2">
              <CardTitle>Aktywne zadania</CardTitle>
              <CardDescription>
                Przegląd aktywnych kontenerów i statystyki klastra
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Header section with stats */}
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 mb-6">
            <Card className="bg-white/60 backdrop-blur-sm border-emerald-200/60 hover:bg-white/70 hover:border-emerald-300/70 transition-all duration-300 dark:bg-slate-800/60 dark:border-emerald-700/40 dark:hover:bg-slate-800/70 dark:hover:border-emerald-600/50">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">Aktywne</p>
                    <p className="text-2xl font-bold text-emerald-900 dark:text-emerald-100">
                      {getActiveJobs().filter(job => job.status === "RUNNING").length}
                    </p>
                  </div>
                  <Activity className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-white/60 backdrop-blur-sm border-amber-200/60 hover:bg-white/70 hover:border-amber-300/70 transition-all duration-300 dark:bg-slate-800/60 dark:border-amber-700/40 dark:hover:bg-slate-800/70 dark:hover:border-amber-600/50">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-amber-700 dark:text-amber-300">Oczekujące</p>
                    <p className="text-2xl font-bold text-amber-900 dark:text-amber-100">
                      {getActiveJobs().filter(job => job.status === "PENDING" || job.status === "CONFIGURING").length}
                    </p>
                  </div>
                  <Clock className="h-8 w-8 text-amber-600 dark:text-amber-400" />
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-white/60 backdrop-blur-sm border-blue-200/60 hover:bg-white/70 hover:border-blue-300/70 transition-all duration-300 dark:bg-slate-800/60 dark:border-blue-700/40 dark:hover:bg-slate-800/70 dark:hover:border-blue-600/50">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-blue-700 dark:text-blue-300">Łącznie</p>
                    <p className="text-2xl font-bold text-blue-900 dark:text-blue-100">
                      {getActiveJobs().length}
                    </p>
                  </div>
                  <Server className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white/60 backdrop-blur-sm border-purple-200/60 hover:bg-white/70 hover:border-purple-300/70 transition-all duration-300 dark:bg-slate-800/60 dark:border-purple-700/40 dark:hover:bg-slate-800/70 dark:hover:border-purple-600/50">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-purple-700 dark:text-purple-300">Używane węzły</p>
                    <p className="text-2xl font-bold text-purple-900 dark:text-purple-100">
                      {currentUser ? `${getUsedContainers()}/${currentUser.max_containers || 6}` : "–"}
                    </p>
                  </div>
                  <Cpu className="h-8 w-8 text-purple-600 dark:text-purple-400" />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white/60 backdrop-blur-sm border-orange-200/60 hover:bg-white/70 hover:border-orange-300/70 transition-all duration-300 dark:bg-slate-800/60 dark:border-orange-700/40 dark:hover:bg-slate-800/70 dark:hover:border-orange-600/50">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-orange-700 dark:text-orange-300">Używane GPU</p>
                    <p className="text-2xl font-bold text-orange-900 dark:text-orange-100">
                      {currentUser ? `${getUsedGPUs()}/${currentUser.max_gpus || 24}` : "–"}
                    </p>
                  </div>
                  <Zap className="h-8 w-8 text-orange-600 dark:text-orange-400" />
                </div>
              </CardContent>
            </Card>

            {/* PCSS Cluster Stats Card */}
            <ClusterStatsCard onRefresh={fetchClusterStats} />
          </div>
          
          {/* Loading state with skeleton cards only when there are no jobs yet */}
          {isJobsLoading && jobs.length === 0 ? (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {Array(3).fill(0).map((_, i) => (
                <Card key={i} className="relative overflow-hidden bg-white/60 backdrop-blur-sm dark:bg-slate-800/60">
                  <div className="animate-pulse bg-gradient-to-br from-slate-100/50 to-slate-200/50 dark:from-slate-700/50 dark:to-slate-600/50 absolute inset-0" />
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="h-6 w-32 bg-slate-300/60 dark:bg-slate-600/60 rounded" />
                      <div className="h-5 w-20 bg-slate-300/60 dark:bg-slate-600/60 rounded-full" />
                    </div>
                    <div className="h-4 w-24 bg-slate-200/60 dark:bg-slate-700/60 rounded mt-2" />
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="bg-white/40 backdrop-blur-sm dark:bg-slate-900/40 rounded-lg p-3 space-y-2 border border-slate-200/50 dark:border-slate-700/50">
                      <div className="h-4 w-16 bg-slate-200/60 dark:bg-slate-700/60 rounded" />
                      <div className="grid grid-cols-2 gap-3">
                        {Array(4).fill(0).map((_, j) => (
                          <div key={j} className="h-3 w-full bg-slate-200/60 dark:bg-slate-700/60 rounded" />
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : getActiveJobs().length === 0 ? (
            <Card className="text-center py-12 bg-white/60 backdrop-blur-sm dark:bg-slate-800/60">
              <CardContent>
                <div className="flex flex-col items-center space-y-4">
                  <div className="rounded-full bg-slate-100/80 dark:bg-slate-700/80 p-6">
                    <Server className="h-12 w-12 text-slate-400 dark:text-slate-500" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                      Brak aktywnych kontenerów
                    </h3>
                    <p className="text-slate-600 dark:text-slate-400 max-w-sm">
                      Utwórz nowy kontener, aby rozpocząć pracę z klastrze obliczeniowym.
                    </p>
                  </div>
                  <Link href="/dashboard/submit-job">
                    <Button className="mt-4">
                      <Plus className="h-4 w-4 mr-2" />
                      Utwórz pierwszy kontener
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ) : (
            <AnimatePresence mode="popLayout">
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {getActiveJobs().map((job) => (
                  <ModernJobCard 
                    key={job.id}
                    job={job}
                    activeJobData={activeJobsMap.get(job.job_id)}
                    tunnels={jobTunnels[job.id] || []}
                    isProcessing={processingJobs[job.id] || false}
                    onDelete={() => handleDelete(job.id)}
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
          <Card className="bg-white/60 backdrop-blur-sm dark:bg-slate-800/60">
            <CardHeader className="pb-2">
              <CardTitle>Zadania aktywne</CardTitle>
              <CardDescription>
                Zadania aktualnie wykonywane lub oczekujące na klastrze
              </CardDescription>
            </CardHeader>
            <CardContent>              
              {getActiveJobs().length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>Brak aktywnych zadań.</p>
                </div>
              ) : (
                <AnimatePresence mode="popLayout">
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {getActiveJobs().map((job) => (
                      <ModernJobCard 
                        key={job.id}
                        job={job}
                        activeJobData={activeJobsMap.get(job.job_id)}
                        tunnels={jobTunnels[job.id] || []}
                        isProcessing={processingJobs[job.id] || false}
                        onDelete={() => handleDelete(job.id)}
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
        
        {/* Completed jobs tab */}
        <TabsContent value="completed" className="mt-4">
          <Card className="bg-white/60 backdrop-blur-sm dark:bg-slate-800/60">
            <CardHeader className="pb-2">
              <CardTitle>Zadania zakończone</CardTitle>
              <CardDescription>
                Zadania zakończone, anulowane lub zakończone błędem
              </CardDescription>
            </CardHeader>
            <CardContent>
              {getCompletedJobs().length === 0 && !isRefreshing ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>Brak zakończonych zadań.</p>
                </div>
              ) : (
                <AnimatePresence mode="popLayout">
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {getCompletedJobs().map((job) => (
                      <ModernJobCard 
                        key={job.id}
                        job={job}
                        activeJobData={activeJobsMap.get(job.job_id)}
                        tunnels={jobTunnels[job.id] || []}
                        isProcessing={processingJobs[job.id] || false}
                        onDelete={() => handleDelete(job.id)}
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

        {/* Admin panel tab */}
        {currentUser?.is_superuser && (
          <TabsContent value="admin" className="mt-4">
            <div className="space-y-6">
              {/* Users Management */}
              <Card className="bg-white/60 backdrop-blur-sm dark:bg-slate-800/60">
                <CardHeader className="pb-4">
                  <CardTitle className="flex items-center gap-2">
                    <Settings className="h-5 w-5" />
                    Zarządzanie użytkownikami
                  </CardTitle>
                  <CardDescription>
                    Lista wszystkich użytkowników systemu
                  </CardDescription>
                </CardHeader>
                <CardContent>
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
                          <Card key={user.id} className="bg-white/40 dark:bg-slate-900/40">
                            <CardContent className="p-4">
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
              <Card className="bg-white/60 backdrop-blur-sm dark:bg-slate-800/60">
                <CardHeader className="pb-4">
                  <CardTitle className="flex items-center gap-2">
                    <Server className="h-5 w-5" />
                    Wszystkie kontenery
                  </CardTitle>
                  <CardDescription>
                    Przegląd wszystkich kontenerów w systemie
                  </CardDescription>
                </CardHeader>
                <CardContent>
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
                          Odśwież
                        </Button>
                      </div>
                      
                      <div className="grid gap-4">
                        {allJobs.map((job) => (
                          <Card key={job.id} className="bg-white/40 dark:bg-slate-900/40">
                            <CardContent className="p-4">
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
                                      <p><strong>Template:</strong> {job.template_name}</p>
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
      
    </div>
  );
}