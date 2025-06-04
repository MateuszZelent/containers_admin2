"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { jobsApi } from "@/lib/api-client";
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
  Network
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { Job } from "@/lib/types";
import axios from "axios";
import { ModernJobCard } from "./components/modern-job-card";

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
  // Main state
  const [jobs, setJobs] = useState<Job[]>([]);
  const [activeJobs, setActiveJobs] = useState<ActiveJobData[]>([]);
  
  // Loading states
  const [isJobsLoading, setIsJobsLoading] = useState(false);
  const [isActiveJobsLoading, setIsActiveJobsLoading] = useState(false);
  const [isClusterStatusLoading, setIsClusterStatusLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Operation states
  const [processingJobs, setProcessingJobs] = useState<Record<number, boolean>>({});
  
  // Data states
  const [clusterStatus, setClusterStatus] = useState<{connected: boolean, slurm_running: boolean} | null>(null);
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
      toast.error(errorMessage);
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
      setActiveJobs(response.data);
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
          checkClusterStatus()
        ]);
      } catch (error) {
        console.error("Error during initial data fetch:", error);
      }
    };
    
    initialFetch();
  }, [fetchJobs, fetchActiveJobs, checkClusterStatus]);

  // Fetch tunnels when jobs change
  useEffect(() => {
    fetchAllTunnels();
  }, [fetchAllTunnels]);

  // Check if a job can use Code Server
  const canUseCodeServer = useCallback((job: Job): boolean => {
    // Strict check - job must be RUNNING and have node and port
    const isRunning = job.status === "RUNNING";
    const hasPort = !!job.port;
    
    return isRunning && hasPort;
  }, []);

  // Refresh all data
  const refreshData = useCallback(async (showToast = true) => {
    setIsRefreshing(true);
    
    try {
      await Promise.all([
        fetchJobs(), 
        fetchActiveJobs(), 
        checkClusterStatus()
      ]);
      
      if (showToast) toast.success("Dane zostały odświeżone");
    } catch (error) {
      console.error("Error refreshing data:", error);
      if (showToast) toast.error("Błąd podczas odświeżania danych");
    } finally {
      // No artificial delay - respond immediately to improve UX
      setIsRefreshing(false);
    }
  }, [fetchJobs, fetchActiveJobs, checkClusterStatus]);

  // Auto-refresh timer
  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    if (autoRefreshEnabled) {
      intervalId = setInterval(() => {
        refreshData(false); // Silent refresh (no toast)
      }, 10000);
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

  // Filter jobs based on status
  const getActiveJobs = useCallback(() => {
    return jobs.filter(job => job.status === "RUNNING" || job.status === "PENDING" || job.status === "CONFIGURING");
  }, [jobs]);
  
  const getCompletedJobs = useCallback(() => {
    return jobs.filter(job => job.status === "COMPLETED" || job.status === "FAILED" || job.status === "CANCELLED");
  }, [jobs]);

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
            variant="outline" 
            size="sm" 
            disabled={isRefreshing || isAnyLoading}
          >
            <RefreshCcw className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
            {isRefreshing ? "Odświeżanie..." : "Odśwież"}
          </Button>
          <Link href="/dashboard/submit-job">
            <Button size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Nowe zadanie
            </Button>
          </Link>
          <Link href="/dashboard/settings">
            <Button variant="outline" size="sm">
              <Settings className="h-4 w-4 mr-2" />
              Ustawienia
            </Button>
          </Link>
        </div>
      </div>

      {/* Status klastra */}
      <Card className="bg-white/60 backdrop-blur-sm dark:bg-slate-800/60">
        <CardHeader className="pb-2">
          <CardTitle>Status klastra</CardTitle>
        </CardHeader>
        <CardContent>
          {isClusterStatusLoading && !clusterStatus ? (
            <div className="flex items-center">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              <p>Sprawdzanie statusu klastra...</p>
            </div>
          ) : !clusterStatus ? (
            <p className="text-amber-500">Nie można uzyskać statusu klastra</p>
          ) : (
            <div className="flex gap-4">
              <div className="flex items-center">
                <div className={`h-3 w-3 rounded-full mr-2 ${clusterStatus.connected ? 'bg-emerald-500 dark:bg-emerald-400' : 'bg-red-500 dark:bg-red-400'}`}></div>
                <p>Połączenie: {clusterStatus.connected ? 'Aktywne' : 'Nieaktywne'}</p>
              </div>
              <div className="flex items-center">
                <div className={`h-3 w-3 rounded-full mr-2 ${clusterStatus.slurm_running ? 'bg-emerald-500 dark:bg-emerald-400' : 'bg-red-500 dark:bg-red-400'}`}></div>
                <p>SLURM: {clusterStatus.slurm_running ? 'Działa' : 'Nie działa'}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Zadania */}
      <Tabs defaultValue="all" className="w-full">
        <TabsList className="bg-white/60 backdrop-blur-sm dark:bg-slate-800/60">
          <TabsTrigger value="all">Aktywne zadania</TabsTrigger>
          <TabsTrigger value="active">Lista zadań</TabsTrigger>
          <TabsTrigger value="completed">Zadania zakończone</TabsTrigger>
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
              <div className="grid gap-6 md:grid-cols-3 mb-6">
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
          </div>

          {/* Loading state with skeleton cards */}
          {isJobsLoading && jobs.length === 0 ? (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {Array(6).fill(0).map((_, i) => (
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
                    <div className="flex justify-between pt-2">
                      <div className="h-8 w-20 bg-slate-200/60 dark:bg-slate-700/60 rounded" />
                      <div className="h-8 w-8 bg-slate-200/60 dark:bg-slate-700/60 rounded" />
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
                />
              ))}
            </div>
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
              {isJobsLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-6 w-6 animate-spin mr-2" />
                  <p>Ładowanie zadań...</p>
                </div>
              ) : getActiveJobs().length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>Brak aktywnych zadań.</p>
                </div>
              ) : (
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
                    />
                  ))}
                </div>
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
              {isJobsLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-6 w-6 animate-spin mr-2" />
                  <p>Ładowanie zadań...</p>
                </div>
              ) : getCompletedJobs().length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>Brak zakończonych zadań.</p>
                </div>
              ) : (
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
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      
    </div>
  );
}