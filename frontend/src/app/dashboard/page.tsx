"use client";

import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { jobsApi } from "@/lib/api-client";
import { Plus, RefreshCcw, Code2, Settings } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Job } from "../../../lib/types";

// Live countdown timer component
const LiveTimer = ({ initialTime }: { initialTime: string }) => {
  const [timeRemaining, setTimeRemaining] = useState<string>(initialTime);
  const [seconds, setSeconds] = useState<number>(0);
  
  useEffect(() => {
    // Parse the initial time (format: "12:21:18")
    const timeParts = initialTime.split(':');
    if (timeParts.length !== 3) return;
    
    let totalSeconds = 
      parseInt(timeParts[0]) * 3600 + // hours
      parseInt(timeParts[1]) * 60 +   // minutes
      parseInt(timeParts[2]);         // seconds
    
    setSeconds(totalSeconds);
    
    // Update every second
    const interval = setInterval(() => {
      if (totalSeconds <= 0) {
        clearInterval(interval);
        return;
      }
      
      totalSeconds -= 1;
      setSeconds(totalSeconds);
      
      // Format the time
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const secs = totalSeconds % 60;
      
      setTimeRemaining(
        `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
      );
    }, 1000);
    
    return () => clearInterval(interval);
  }, [initialTime]);
  
  // Determine color based on remaining time
  const getTimeColor = () => {
    if (seconds < 300) return "text-red-500"; // Less than 5 minutes
    if (seconds < 1800) return "text-amber-500"; // Less than 30 minutes
    return "text-green-500";
  };
  
  return (
    <span className={`font-mono ${getTimeColor()}`}>{timeRemaining}</span>
  );
};

// Format date string to more readable format
const formatDate = (dateString: string) => {
  if (!dateString) return "N/A";
  const date = new Date(dateString);
  return date.toLocaleString();
};

export default function DashboardPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [activeJobs, setActiveJobs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [clusterStatus, setClusterStatus] = useState<{connected: boolean, slurm_running: boolean} | null>(null);
  const [jobTunnels, setJobTunnels] = useState<Record<number, any>>({});

  // Pobierz zadania i status klastra przy pierwszym renderowaniu
  useEffect(() => {
    fetchJobs();
    fetchActiveJobs();
    checkClusterStatus();
  }, []);

  // Pobierz wszystkie zadania
  const fetchJobs = async () => {
    setIsLoading(true);
    try {
      const response = await jobsApi.getJobs();
      setJobs(response.data);
    } catch (error) {
      toast.error("Nie udało się pobrać listy zadań");
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  // Pobierz aktywne zadania
  const fetchActiveJobs = async () => {
    try {
      const response = await jobsApi.getActiveJobs();
      console.log(response);
      setActiveJobs(response.data);
    } catch (error) {
      console.error(error);
    }
  };

  // Sprawdź status klastra
  const checkClusterStatus = async () => {
    try {
      const response = await jobsApi.getClusterStatus();
      setClusterStatus(response.data);
    } catch (error) {
      setClusterStatus({ connected: false, slurm_running: false });
      console.error(error);
    }
  };

  // Add function to fetch tunnel information
  const fetchTunnelInfo = async (jobId: number) => {
    try {
      const response = await jobsApi.getJobTunnels(jobId);
      setJobTunnels(prev => ({
        ...prev,
        [jobId]: response.data
      }));
    } catch (error) {
      console.error('Error fetching tunnel info:', error);
    }
  };

  // Add effect to fetch tunnel info when jobs change
  useEffect(() => {
    jobs.forEach(job => {
      if (job.status === "RUNNING") {
        fetchTunnelInfo(job.id);
      }
    });
  }, [jobs]);

  // Odśwież dane
  const refreshData = () => {
    fetchJobs();
    fetchActiveJobs();
    checkClusterStatus();
    toast.success("Dane zostały odświeżone");
  };

  const handleDelete = async (jobId: number) => {
    try {
      await jobsApi.deleteJob(jobId)
      setJobs(jobs.filter(job => job.id !== jobId))
      toast.success("Kontener został usunięty")
    } catch (error) {
      toast.error("Nie udało się usunąć kontenera")
    }
  }

  const openCodeServer = async (job: Job) => {
    try {
      toast.loading("Establishing connection...");
      const response = await jobsApi.getCodeServerUrl(job.id);
      const { url } = response.data;
      
      window.open(url, '_blank');
      toast.success("Code Server connection established. Opening in new tab...");
    } catch (error: any) {
      const errorMessage = error.response?.data?.detail || "Could not open Code Server";
      toast.error(errorMessage);
      console.error('Code Server error:', error);
    } finally {
      toast.dismiss();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Panel zarządzania zadaniami</h1>
        <div className="flex gap-2">
          <Button onClick={refreshData} variant="outline" size="sm">
            <RefreshCcw className="h-4 w-4 mr-2" />
            Odśwież
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
          {!clusterStatus ? (
            <p>Sprawdzanie statusu klastra...</p>
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
          <TabsTrigger value="all">Wszystkie zadania</TabsTrigger>
          <TabsTrigger value="active">Aktywne zadania</TabsTrigger>
        </TabsList>
        <TabsContent value="all" className="mt-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {jobs.map((job) => (
              <Card key={job.id}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    {job.job_name}
                  </CardTitle>
                  <Badge variant={job.status === "RUNNING" ? "default" : "secondary"}>
                    {job.status}
                  </Badge>
                </CardHeader>
                <CardContent>
                  <div className="text-xs text-muted-foreground space-y-1">
                    <div className="grid grid-cols-2 gap-1">
                      <p><span className="font-medium">ID:</span> {job.id}</p>
                      <p><span className="font-medium">SLURM ID:</span> {job.job_id}</p>
                      <p><span className="font-medium">Partycja:</span> {job.partition}</p>
                      <p><span className="font-medium">Szablon:</span> {job.template_name}</p>
                    </div>
                    
                    {/* Resource allocation */}
                    <div className="mt-2 p-2 bg-muted/50 rounded-md">
                      <h4 className="font-medium mb-1">Zasoby:</h4>
                      <div className="grid grid-cols-2 gap-1">
                        <p><span className="font-medium">CPU:</span> {job.num_cpus}</p>
                        <p><span className="font-medium">Pamięć:</span> {job.memory_gb}GB</p>
                        <p><span className="font-medium">GPU:</span> {job.num_gpus}</p>
                        {job.node && <p><span className="font-medium">Węzeł:</span> {job.node}</p>}
                      </div>
                    </div>
                    
                    {/* Timing information - only show for running jobs */}
                    {job.status === "RUNNING" && (
                      <div className="mt-2 p-2 bg-muted/50 rounded-md">
                        <h4 className="font-medium mb-1">Czas:</h4>
                        <div className="space-y-1">
                          {/* If we have time_left from active jobs data */}
                          {activeJobs.find(aj => aj.job_id === job.job_id)?.time_left && (
                            <p>
                              <span className="font-medium">Pozostało:</span>{" "}
                              <LiveTimer initialTime={activeJobs.find(aj => aj.job_id === job.job_id)?.time_left} />
                            </p>
                          )}
                          {/* If we have time_used from active jobs data */}
                          {activeJobs.find(aj => aj.job_id === job.job_id)?.time_used && (
                            <p>
                              <span className="font-medium">Czas użyty:</span>{" "}
                              <span className="font-mono">{activeJobs.find(aj => aj.job_id === job.job_id)?.time_used}</span>
                            </p>
                          )}
                          {activeJobs.find(aj => aj.job_id === job.job_id)?.start_time && (
                            <p>
                              <span className="font-medium">Start:</span>{" "}
                              {formatDate(activeJobs.find(aj => aj.job_id === job.job_id)?.start_time)}
                            </p>
                          )}
                          {activeJobs.find(aj => aj.job_id === job.job_id)?.submit_time && (
                            <p>
                              <span className="font-medium">Zgłoszenie:</span>{" "}
                              {formatDate(activeJobs.find(aj => aj.job_id === job.job_id)?.submit_time)}
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                    
                    {job.port && <p><span className="font-medium">Port aplikacji:</span> {job.port}</p>}
                    
                    {/* Enhanced tunnel information */}
                    {jobTunnels[job.id]?.length > 0 && (
                      <div className="mt-2 p-2 bg-muted rounded-md">
                        <p className="font-medium mb-1">Tunel SSH:</p>
                        {jobTunnels[job.id].map((tunnel: any) => (
                          <div key={tunnel.id} className="space-y-1">
                            <p className="flex items-center">
                              <span className={`h-2 w-2 rounded-full mr-2 ${
                                tunnel.status === 'ACTIVE' ? 'bg-green-500' : 
                                tunnel.status === 'DEAD' ? 'bg-red-500' : 'bg-gray-500'
                              }`}/>
                              <span>{tunnel.status === 'ACTIVE' ? 'Aktywny' : 
                                     tunnel.status === 'DEAD' ? 'Nieaktywny' : 'Łączenie...'}</span>
                            </p>
                            <div className="text-xs border-l-2 border-muted-foreground/20 pl-2 mt-1 space-y-1">
                              <p className="font-medium">Przekierowanie portów:</p>
                              <p title="Port dostępny w przeglądarce i z zewnątrz kontenera">
                                Port zewnętrzny: <span className="font-mono bg-background px-1 rounded">{tunnel.local_port}</span>
                              </p>
                              <p title="Port wewnętrzny tunelu SSH w kontenerze">
                                Port wewnętrzny: <span className="font-mono bg-background px-1 rounded">{tunnel.remote_port}</span>
                              </p>
                              <p>
                                Host: <span className="font-mono">{tunnel.remote_host}</span>
                              </p>
                              <p className="text-[10px] text-muted-foreground mt-1">
                                <span className="font-medium">Schemat:</span> 0.0.0.0:{tunnel.local_port} → 127.0.0.1:wewnętrzny → {tunnel.remote_host}:{tunnel.remote_port}
                              </p>
                            </div>
                            <p className="text-xs">Utworzony: {new Date(tunnel.created_at).toLocaleString()}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  
                  <div className="mt-4 flex justify-end space-x-2">
                    {job.status === "RUNNING" && job.node && job.port && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openCodeServer(job)}
                        disabled={isLoading}
                      >
                        <Code2 className="h-4 w-4 mr-2" />
                        Code Server
                      </Button>
                    )}
                    <Button 
                      variant="destructive" 
                      size="sm"
                      onClick={() => handleDelete(job.id)}
                    >
                      Usuń
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
        <TabsContent value="active" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Aktywne zadania</CardTitle>
              <CardDescription>
                Zadania aktualnie wykonywane na klastrze
              </CardDescription>
            </CardHeader>
            <CardContent>
              {activeJobs.length === 0 ? (
                <p>Brak aktywnych zadań na klastrze.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2">ID</th>
                        <th className="text-left py-2">Nazwa</th>
                        <th className="text-left py-2">Status</th>
                        <th className="text-left py-2">Węzeł</th>
                        <th className="text-left py-2">Liczba węzłów</th>
                        <th className="text-left py-2">Pozostały czas</th>
                        <th className="text-left py-2">Pamięć</th>
                        <th className="text-left py-2">Data startu</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeJobs.map((job) => (
                        <tr key={job.job_id} className="border-b hover:bg-muted/50">
                          <td className="py-2">{job.job_id}</td>
                          <td className="py-2">{job.name}</td>
                          <td className="py-2">
                            <span className={`inline-block px-2 py-1 text-xs rounded-full 
                              ${job.state === 'RUNNING' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                              {job.state}
                            </span>
                          </td>
                          <td className="py-2">{job.node === '(None)' ? 'Nie przypisano' : job.node}</td>
                          <td className="py-2">{job.node_count}</td>
                          <td className="py-2 font-mono">
                            {job.state === 'RUNNING' ? <LiveTimer initialTime={job.time_left} /> : job.time_left}
                          </td>
                          <td className="py-2">{job.memory_requested || job.memory}</td>
                          <td className="py-2">{formatDate(job.start_time)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}