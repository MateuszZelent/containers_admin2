"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { jobsApi } from "@/lib/api-client";
import { Plus, RefreshCcw, Code2, Settings, Loader2 } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Job } from "../../../lib/types";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { JobCard } from "./components/job-card";
import { LiveTimer } from "./components/live-timer";

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
    } catch (error: any) {
      const errorMessage = error.response?.data?.detail || "Nie udało się pobrać listy zadań";
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
    } catch (error: any) {
      const errorMessage = error.response?.data?.detail || "Nie udało się pobrać aktywnych zadań";
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
    } catch (error: any) {
      const errorMessage = error.response?.data?.detail || "Nie udało się sprawdzić statusu klastra";
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
  } catch (error: any) {
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
  }
}, [/* zależności */]);

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
  }, [autoRefreshEnabled]);

  // Check if a job can use Code Server
  const canUseCodeServer = useCallback((job: Job): boolean => {
    // Strict check - job must be RUNNING and have node and port
    const isRunning = job.status === "RUNNING";
    const hasNode = !!job.node;
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

  // Delete a job with loading state
  const handleDelete = useCallback(async (jobId: number) => {
    // Set processing state for this job
    setProcessingJobs(prev => ({ ...prev, [jobId]: true }));
    
    try {
      await jobsApi.deleteJob(jobId);
      setJobs(prev => prev.filter(job => job.id !== jobId));
      toast.success("Kontener został usunięty");
    } catch (error: any) {
      const errorMessage = error.response?.data?.detail || "Nie udało się usunąć kontenera";
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
    } catch (error: any) {
      const errorMessage = error.response?.data?.detail || "Could not open Code Server";
      console.log(error);
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
      <Card>
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
                <div className={`h-3 w-3 rounded-full mr-2 ${clusterStatus.connected ? 'bg-green-500' : 'bg-red-500'}`}></div>
                <p>Połączenie: {clusterStatus.connected ? 'Aktywne' : 'Nieaktywne'}</p>
              </div>
              <div className="flex items-center">
                <div className={`h-3 w-3 rounded-full mr-2 ${clusterStatus.slurm_running ? 'bg-green-500' : 'bg-red-500'}`}></div>
                <p>SLURM: {clusterStatus.slurm_running ? 'Działa' : 'Nie działa'}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Zadania */}
      <Tabs defaultValue="all" className="w-full">
        <TabsList>
          <TabsTrigger value="all">Aktywne zadania</TabsTrigger>
          <TabsTrigger value="active">Lista zadań</TabsTrigger>
          <TabsTrigger value="completed">Zadania zakończone</TabsTrigger>
        </TabsList>
        
        {/* Active jobs tab (renamed from All jobs) */}
        <TabsContent value="all" className="mt-4">
          {isJobsLoading && jobs.length === 0 ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {Array(3).fill(0).map((_, i) => (
                <Card key={i} className="relative overflow-hidden">
                  <div className="animate-pulse bg-muted/50 absolute inset-0" />
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <div className="h-5 w-32 bg-muted rounded" />
                    <div className="h-5 w-20 bg-muted rounded" />
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="h-4 w-full bg-muted rounded" />
                      <div className="h-4 w-3/4 bg-muted rounded" />
                      <div className="h-20 w-full bg-muted rounded" />
                      <div className="h-8 w-full bg-muted rounded" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : getActiveJobs().length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <p>Brak aktywnych zadań. Utwórz nowe zadanie, aby rozpocząć pracę.</p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {getActiveJobs().map((job) => (
                <JobCard 
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
        </TabsContent>
        
        {/* Active jobs tab */}
        <TabsContent value="active" className="mt-4">
          <Card>
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
                    <JobCard 
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
          <Card>
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
                    <JobCard 
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