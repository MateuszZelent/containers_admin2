"use client";

import { useState, useEffect, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RefreshCcw, ArrowLeft, Link2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { jobsApi } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { formatContainerName } from "@/lib/container-utils";

// Helper function for error handling
const getErrorMessage = (error: unknown, defaultMessage: string): string => {
  if (error && typeof error === 'object' && 'response' in error) {
    const axiosError = error as { response?: { data?: { detail?: string } } };
    return axiosError.response?.data?.detail || defaultMessage;
  }
  return defaultMessage;
};

interface JobDetails {
  id: number;
  job_id: string;
  job_name: string;
  status: string;
  created_at: string;
  updated_at: string | null;
  template_name: string;
  num_cpus: number;
  memory_gb: number;
  num_gpus: number;
  time_limit: string;
  node?: string;
  port?: number;
  owner_id: number;
  partition: string;
}

interface JobStatus {
  job_id: string;
  status: string;
  state?: string;
  exit_code?: number;
  runtime?: string;
  nodes?: string[];
  [key: string]: any; // dla dodatkowych pól z SLURM
}

interface SSHTunnel {
  id: number;
  job_id: number;
  local_port: number;
  external_port: number;
  internal_port: number;
  remote_port: number;
  remote_host: string;
  node: string;
  status: string;
  ssh_pid?: number;
  socat_pid?: number;
  health_status?: string;
  last_health_check?: string;
  created_at: string;
  updated_at?: string;
}

interface TunnelStatus {
  status: string;
  message: string;
  tunnel?: {
    id: number;
    port: number;
    remote_port: number;
    remote_host: string;
    status: string;
    created_at: string;
    internal_accessible: boolean;
    external_accessible: boolean;
  }
}

export default function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const resolvedParams = use(params);
  const jobId = parseInt(resolvedParams.id);
  
  const [job, setJob] = useState<JobDetails | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [tunnels, setTunnels] = useState<SSHTunnel[]>([]);
  const [tunnelStatus, setTunnelStatus] = useState<TunnelStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [codeServerURL, setCodeServerURL] = useState<string | null>(null);
  
  // Confirmation dialog states
  const [tunnelToClose, setTunnelToClose] = useState<SSHTunnel | null>(null);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      // Pobierz szczegóły zadania
      const jobResponse = await jobsApi.getJob(jobId);
      setJob(jobResponse.data);
      
      // Pobierz aktualny status
      const statusResponse = await jobsApi.getJobStatus(jobId);
      setJobStatus(statusResponse.data);
      
      // Pobierz tunele SSH
      try {
        const tunnelsResponse = await jobsApi.getJobTunnels(jobId);
        setTunnels(tunnelsResponse.data);

        // Jeśli istnieją tunele, sprawdź ich status (status jest już w odpowiedzi)
        if (tunnelsResponse.data.length > 0) {
          // Status jest już część odpowiedzi getJobTunnels
          setTunnelStatus(tunnelsResponse.data[0]); // Zakładamy, że jeden tunel na job
        }
      } catch (error) {
        console.error("Błąd podczas pobierania tuneli SSH:", error);
        setTunnels([]);
      }
    } catch (error) {
      toast.error("Nie udało się pobrać szczegółów zadania");
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  }, [jobId]);

  // Pobierz szczegóły zadania i aktualne tunele SSH
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Odśwież dane
  const refreshData = () => {
    fetchData();
    toast.success("Dane zostały odświeżone", {
      duration: 3000,
      closeButton: true
    });
  };

  // Utwórz tunel SSH
  const createTunnel = async () => {
    try {
      await jobsApi.createJobTunnel(jobId);
      toast.success("Tunel SSH został utworzony", {
        duration: 5000,
        closeButton: true
      });
      fetchData();  // Odśwież dane
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error, "Nie udało się utworzyć tunelu SSH");
      toast.error(errorMessage, {
          duration: 5000,
          closeButton: true
        }
      );
      console.error(error);
    }
  };

  // Zamknij tunel SSH - show confirmation
  const handleCloseTunnel = (tunnelId: number) => {
    const tunnel = tunnels.find(t => t.id === tunnelId);
    if (tunnel) {
      setTunnelToClose(tunnel);
      setCloseConfirmOpen(true);
    }
  };

  // Actually close the tunnel after confirmation
  const confirmCloseTunnel = async () => {
    if (!tunnelToClose) return;
    
    try {
      await jobsApi.closeJobTunnel(jobId, tunnelToClose.id);
      toast.success("Tunel SSH został zamknięty", {
        duration: 5000,
        closeButton: true
      });
      fetchData();  // Odśwież dane
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error, "Nie udało się zamknąć tunelu SSH");
      toast.error(errorMessage, {
          duration: 5000,
          closeButton: true
        }
      );
      console.error(error);
    } finally {
      setTunnelToClose(null);
      setCloseConfirmOpen(false);
    }
  };

  // Sprawdź health check tunelu
  const checkTunnelHealth = async (tunnelId: number) => {
    try {
      const response = await jobsApi.checkTunnelHealth(jobId, tunnelId);
      toast.success("Health check został wykonany", {
        duration: 3000,
        closeButton: true
      });
      fetchData(); // Odśwież dane po health check
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error, "Nie udało się wykonać health check");
      toast.error(errorMessage, {
        duration: 5000,
        closeButton: true
      });
      console.error(error);
    }
  };

  // Pobierz URL do Code Server
  const getCodeServerURL = async () => {
    try {
      const response = await jobsApi.getCodeServerUrl(jobId);
      setCodeServerURL(response.data.url);
      toast.success("Adres do Code Server został wygenerowany", {
        duration: 5000,
        closeButton: true
      });
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error, "Nie udało się uzyskać dostępu do Code Server");
      toast.error(errorMessage, {
          duration: 5000,
          closeButton: true
        }
      );
      console.error(error);
    }
  };

  // Usuń zadanie
  const deleteJob = async () => {
    setIsDeleting(true);
    try {
      await jobsApi.deleteJob(jobId);
      toast.success("Zadanie zostało usunięte");
      router.push("/dashboard");
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error, "Nie udało się usunąć zadania");
      toast.error(errorMessage);
      console.error(error);
    } finally {
      setIsDeleting(false);
    }
  };

  // Format daty
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  if (isLoading) {
    return <div className="flex justify-center items-center h-[50vh]">Ładowanie szczegółów zadania...</div>;
  }

  if (!job) {
    return <div className="flex justify-center items-center h-[50vh]">Nie znaleziono zadania</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => router.push("/dashboard")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-3xl font-bold">Szczegóły zadania: {job.job_name}</h1>
        </div>
        <div className="flex gap-2">
          <Button onClick={refreshData} variant="outline" size="sm">
            <RefreshCcw className="h-4 w-4 mr-2" />
            Odśwież
          </Button>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="destructive" size="sm" disabled={isDeleting}>
                {isDeleting ? "Usuwanie..." : "Usuń zadanie"}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Potwierdzenie usunięcia</DialogTitle>
                <DialogDescription>
                  Czy na pewno chcesz usunąć zadanie &quot;{job.job_name}&quot;? 
                  Ta operacja jest nieodwracalna.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">Anuluj</Button>
                </DialogClose>
                <Button variant="destructive" onClick={deleteJob}>
                  Usuń zadanie
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Podstawowe informacje */}
        <Card>
          <CardHeader>
            <CardTitle>Informacje podstawowe</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between py-1">
              <span className="font-medium">ID zadania:</span>
              <span>{job.job_id}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="font-medium">Nazwa:</span>
              <span>{formatContainerName(job.job_name)}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="font-medium">Status:</span>
              <span className={`px-2 py-1 text-xs rounded-full inline-flex items-center 
                ${jobStatus?.status === 'RUNNING' ? 'bg-emerald-500/20 text-emerald-400 dark:bg-emerald-500/20 dark:text-emerald-300' : 
                jobStatus?.status === 'PENDING' ? 'bg-amber-500/20 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300' : 
                jobStatus?.status === 'COMPLETED' ? 'bg-blue-500/20 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300' : 
                'bg-slate-500/20 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300'}`}>
                {jobStatus?.status}
              </span>
            </div>
            <div className="flex justify-between py-1">
              <span className="font-medium">Szablon:</span>
              <span>{job.template_name}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="font-medium">Data utworzenia:</span>
              <span>{formatDate(job.created_at)}</span>
            </div>
            {job.updated_at && (
              <div className="flex justify-between py-1">
                <span className="font-medium">Ostatnia aktualizacja:</span>
                <span>{formatDate(job.updated_at)}</span>
              </div>
            )}
            <div className="flex justify-between py-1">
              <span className="font-medium">Partycja:</span>
              <span>{job.partition}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="font-medium">Wykonywane na węźle:</span>
              <span>{jobStatus?.node || 'Nie przypisano'}</span>
            </div>
          </CardContent>
        </Card>

        {/* Zasoby */}
        <Card>
          <CardHeader>
            <CardTitle>Zasoby</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between py-1">
              <span className="font-medium">CPU:</span>
              <span>{job.num_cpus}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="font-medium">Pamięć RAM:</span>
              <span>{job.memory_gb} GB</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="font-medium">GPU:</span>
              <span>{job.num_gpus}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="font-medium">Limit czasu:</span>
              <span>{job.time_limit}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="font-medium">Port:</span>
              <span>{job.port || 'Brak'}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tunele SSH */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Tunele SSH i przekierowania portów</CardTitle>
            <CardDescription>
              Zarządzaj tunelami SSH i przekierowaniami portów do połączenia z kontenerem
            </CardDescription>
          </div>
          <Button 
            onClick={createTunnel} 
            disabled={!jobStatus?.node || jobStatus?.status !== 'RUNNING'}
          >
            <Link2 className="h-4 w-4 mr-2" />
            Utwórz tunel
          </Button>
        </CardHeader>
        <CardContent>
          {tunnels.length === 0 ? (
            <p className="text-muted-foreground">
              {!jobStatus?.node || jobStatus?.status !== 'RUNNING' 
                ? "Tunele SSH są dostępne tylko dla zadań w stanie RUNNING i przypisanych do węzła." 
                : "Brak aktywnych tuneli SSH. Kliknij 'Utwórz tunel', aby połączyć się z kontenerem."}
            </p>
          ) : (
            <div>
              {tunnelStatus && (
                <div className="mb-4 p-4 rounded-md bg-muted">
                  <h4 className="font-medium mb-2">Status tunelu</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      <span>Stan:</span>
                      <Badge variant={tunnelStatus.status === 'ACTIVE' ? 'default' : 'destructive'}>
                        {tunnelStatus.status === 'ACTIVE' ? 'Aktywny' : 'Nieaktywny'}
                      </Badge>
                    </div>
                    <div>
                      <span>Komunikat: {tunnelStatus.message}</span>
                    </div>
                    {tunnelStatus.tunnel && (
                      <>
                        <div className="flex items-center gap-2">
                          <span>Dostępny w kontenerze:</span>
                          <Badge variant={tunnelStatus.tunnel.internal_accessible ? 'default' : 'destructive'}>
                            {tunnelStatus.tunnel.internal_accessible ? 'Tak' : 'Nie'}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          <span>Dostępny na zewnątrz kontenera:</span>
                          <Badge variant={tunnelStatus.tunnel.external_accessible ? 'default' : 'destructive'}>
                            {tunnelStatus.tunnel.external_accessible ? 'Tak' : 'Nie'}
                          </Badge>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2">ID</th>
                      <th className="text-left py-2">Port lokalny</th>
                      <th className="text-left py-2">Port zewnętrzny</th>
                      <th className="text-left py-2">Port wewnętrzny</th>
                      <th className="text-left py-2">Host zdalny</th>
                      <th className="text-left py-2">Węzeł</th>
                      <th className="text-left py-2">Status</th>
                      <th className="text-left py-2">Health Status</th>
                      <th className="text-left py-2">PID SSH</th>
                      <th className="text-left py-2">PID Socat</th>
                      <th className="text-left py-2">Ostatni health check</th>
                      <th className="text-left py-2">Akcje</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tunnels.map((tunnel) => (
                      <tr key={tunnel.id} className="border-b hover:bg-muted/50">
                        <td className="py-2">{tunnel.id}</td>
                        <td className="py-2">
                          <span className="font-mono bg-muted px-1 py-0.5 rounded text-xs" 
                                title="Port lokalny tunelu SSH">
                            {tunnel.local_port}
                          </span>
                        </td>
                        <td className="py-2">
                          <span className="font-mono bg-blue-500/20 text-blue-700 dark:text-blue-300 px-1 py-0.5 rounded text-xs" 
                                title="Port dostępny w przeglądarce i z zewnątrz kontenera">
                            {tunnel.external_port}
                          </span>
                        </td>
                        <td className="py-2">
                          <span className="font-mono bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 px-1 py-0.5 rounded text-xs" 
                                title="Port wewnętrzny tunelu SSH w kontenerze">
                            {tunnel.internal_port}
                          </span>
                        </td>
                        <td className="py-2">
                          <span className="font-mono bg-muted px-1 py-0.5 rounded text-xs">
                            {tunnel.remote_host}:{tunnel.remote_port}
                          </span>
                        </td>
                        <td className="py-2">
                          <Badge variant="outline" className="text-xs">
                            {tunnel.node}
                          </Badge>
                        </td>
                        <td className="py-2">
                          <Badge variant={tunnel.status === 'ACTIVE' ? 'default' : 'destructive'} className="text-xs">
                            {tunnel.status}
                          </Badge>
                        </td>
                        <td className="py-2">
                          {tunnel.health_status ? (
                            <Badge 
                              variant={
                                tunnel.health_status === 'HEALTHY' ? 'default' : 
                                tunnel.health_status === 'UNHEALTHY' ? 'destructive' : 
                                'secondary'
                              } 
                              className="text-xs"
                            >
                              {tunnel.health_status}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-xs">-</span>
                          )}
                        </td>
                        <td className="py-2">
                          {tunnel.ssh_pid ? (
                            <span className="font-mono bg-amber-500/20 text-amber-700 dark:text-amber-300 px-1 py-0.5 rounded text-xs" 
                                  title={`PID procesu SSH: ${tunnel.ssh_pid}`}>
                              {tunnel.ssh_pid}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-xs">-</span>
                          )}
                        </td>
                        <td className="py-2">
                          {tunnel.socat_pid ? (
                            <span className="font-mono bg-purple-500/20 text-purple-700 dark:text-purple-300 px-1 py-0.5 rounded text-xs" 
                                  title={`PID procesu socat: ${tunnel.socat_pid}`}>
                              {tunnel.socat_pid}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-xs">-</span>
                          )}
                        </td>
                        <td className="py-2">
                          {tunnel.last_health_check ? (
                            <span className="text-xs" title={formatDate(tunnel.last_health_check)}>
                              {new Date(tunnel.last_health_check).toLocaleString('pl-PL', {
                                month: '2-digit',
                                day: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-xs">Nigdy</span>
                          )}
                        </td>
                        <td className="py-2">
                          <div className="flex gap-1">
                            <Button 
                              variant="outline" 
                              size="sm" 
                              onClick={() => checkTunnelHealth(tunnel.id)}
                              className="px-2 py-1 text-xs"
                              title="Sprawdź stan tunelu"
                            >
                              Health
                            </Button>
                            <Button 
                              variant="outline" 
                              size="sm" 
                              onClick={() => handleCloseTunnel(tunnel.id)}
                              className="px-2 py-1 text-xs"
                              title="Zamknij tunel"
                            >
                              Zamknij
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              
              {/* Informacje o architekturze tuneli */}
              <div className="mt-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">Opis portów</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="font-mono bg-blue-500/20 text-blue-700 dark:text-blue-300 px-2 py-1 rounded text-xs">Port zewnętrzny</span>
                        <span>- Dostępny z przeglądarki (http://node:port)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 px-2 py-1 rounded text-xs">Port wewnętrzny</span>
                        <span>- Port tunelu SSH w kontenerze</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono bg-muted px-2 py-1 rounded text-xs">Port lokalny</span>
                        <span>- Port lokalny tunelu SSH</span>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">Status procesów</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="font-mono bg-amber-500/20 text-amber-700 dark:text-amber-300 px-2 py-1 rounded text-xs">SSH PID</span>
                        <span>- Identyfikator procesu SSH</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono bg-purple-500/20 text-purple-700 dark:text-purple-300 px-2 py-1 rounded text-xs">Socat PID</span>
                        <span>- Identyfikator procesu Socat</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="default" className="text-xs">HEALTHY</Badge>
                        <span>- Tunel działa poprawnie</span>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Diagram przepływu danych */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Diagram przepływu danych przez tunel SSH</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-center p-4">
                      <div className="flex items-center space-x-4 text-sm">
                        <div className="text-center">
                          <div className="border rounded-md px-3 py-2 bg-blue-500/20 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300">
                            <div className="font-medium">Przeglądarka</div>
                            <div className="text-xs opacity-80">http://node:external_port</div>
                          </div>
                        </div>
                        
                        <div className="flex items-center">
                          <div className="w-8 h-0.5 bg-muted-foreground"></div>
                          <div className="text-xs text-muted-foreground mx-1">→</div>
                        </div>
                        
                        <div className="text-center">
                          <div className="border rounded-md px-3 py-2 bg-emerald-500/20 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300">
                            <div className="font-medium">Socat</div>
                            <div className="text-xs opacity-80">Port forwarding</div>
                          </div>
                        </div>
                        
                        <div className="flex items-center">
                          <div className="w-8 h-0.5 bg-muted-foreground"></div>
                          <div className="text-xs text-muted-foreground mx-1">→</div>
                        </div>
                        
                        <div className="text-center">
                          <div className="border rounded-md px-3 py-2 bg-amber-500/20 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300">
                            <div className="font-medium">SSH Tunel</div>
                            <div className="text-xs opacity-80">localhost:local_port</div>
                          </div>
                        </div>
                        
                        <div className="flex items-center">
                          <div className="w-8 h-0.5 bg-muted-foreground"></div>
                          <div className="text-xs text-muted-foreground mx-1">→</div>
                        </div>
                        
                        <div className="text-center">
                          <div className="border rounded-md px-3 py-2 bg-purple-500/20 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300">
                            <div className="font-medium">Kontener</div>
                            <div className="text-xs opacity-80">remote_host:remote_port</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
              
              {/* Diagram wizualizujący przekierowanie portów */}
              <div className="mt-4 p-4 bg-muted/30 rounded-md">
                <h4 className="font-medium mb-2">Schemat przekierowania portów</h4>
                <div className="relative p-4 flex justify-center items-center">
                  {/* Tworzenie wizualizacji przekierowania portów */}
                  <div className="flex items-center space-x-2">
                    <div className="border rounded-md px-3 py-2 bg-card">
                      <div className="text-xs font-medium">Zewnętrzny świat</div>
                      <div className="text-xs mt-1">0.0.0.0:{tunnels[0]?.local_port}</div>
                    </div>
                    
                    <div className="text-muted-foreground">→</div>
                    
                    <div className="border rounded-md px-3 py-2 bg-card">
                      <div className="text-xs font-medium">Docker (socat)</div>
                      <div className="text-xs mt-1">Port: {tunnels[0]?.local_port}</div>
                    </div>
                    
                    <div className="text-muted-foreground">→</div>
                    
                    <div className="border rounded-md px-3 py-2 bg-card">
                      <div className="text-xs font-medium">Tunel SSH</div>
                      <div className="text-xs mt-1">127.0.0.1:wewnętrzny</div>
                    </div>
                    
                    <div className="text-muted-foreground">→</div>
                    
                    <div className="border rounded-md px-3 py-2 bg-card">
                      <div className="text-xs font-medium">Klaster SLURM</div>
                      <div className="text-xs mt-1">{tunnels[0]?.remote_host}:{tunnels[0]?.remote_port}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
        <CardFooter className="flex flex-col items-start space-y-2">
          <p className="text-xs text-muted-foreground">
            Tunele SSH umożliwiają bezpieczne połączenie z usługami uruchomionymi w kontenerze poprzez przekierowanie portów.
          </p>
          <p className="text-xs text-muted-foreground">
            <span className="font-medium">Technologia:</span> Użyto kombinacji tunelowania SSH oraz narzędzia socat do przekierowania portów na zewnątrz kontenera.
          </p>
        </CardFooter>
      </Card>

      {/* Dostęp do kontenera */}
      {jobStatus?.status === 'RUNNING' && jobStatus?.node && (
        <Card>
          <CardHeader>
            <CardTitle>Dostęp do kontenera</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p>
              Kontener jest uruchomiony i dostępny na węźle <strong>{jobStatus.node}</strong>.
              Możesz połączyć się z interfejsem webowym kontenera:
            </p>
            
            <div className="flex flex-col md:flex-row gap-4">
              <div className="bg-muted p-4 rounded-md flex-1">
                <p className="font-medium mb-2">Bezpośredni dostęp przez tunel:</p>
                <p className="mt-2">
                  URL: <code className="bg-background p-1 rounded">http://localhost:{tunnels.length > 0 ? tunnels[0].local_port : job.port}</code>
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Wymaga aktywnego tunelu SSH.
                </p>
              </div>
              
              <div className="bg-muted p-4 rounded-md flex-1">
                <div className="flex justify-between items-center mb-2">
                  <p className="font-medium">Dostęp przez subdomenę (Caddy):</p>
                  <Button 
                    variant="outline" 
                    size="sm"
                    disabled={tunnels.length === 0 || !tunnelStatus?.tunnel?.internal_accessible}
                    onClick={getCodeServerURL}
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Generuj URL
                  </Button>
                </div>
                
                {codeServerURL ? (
                  <div className="mt-2">
                    <p>
                      URL: <a href={codeServerURL} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">
                        {codeServerURL}
                      </a>
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Bezpieczny dostęp przez HTTPS z automatycznym certyfikatem.
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground mt-2">
                    Kliknij &quot;Generuj URL&quot;, aby utworzyć bezpieczny adres dostępowy.
                  </p>
                )}
              </div>
            </div>

            <div className="bg-muted p-4 rounded-md">
              <p className="font-medium mb-2">Jak to działa:</p>
              <ol className="list-decimal list-inside text-sm space-y-1">
                <li>SSH tworzy tunel do kontenera na klastrze SLURM</li>
                <li>Socat przekierowuje połączenia z portu zewnętrznego do lokalnego tunelu SSH</li>
                <li>Caddy tworzy bezpieczny endpoint z certyfikatem SSL</li>
              </ol>
            </div>
          </CardContent>
          <CardFooter>
            <p className="text-xs text-muted-foreground">
              Upewnij się, że tunel SSH jest aktywny przed próbą połączenia.
            </p>
          </CardFooter>
        </Card>
      )}
      
      {/* Tunnel Close Confirmation Dialog */}
      <ConfirmationDialog
        open={closeConfirmOpen}
        onOpenChange={setCloseConfirmOpen}
        title="Zamknij tunel SSH"
        description={tunnelToClose ? `Czy na pewno chcesz zamknąć tunel SSH?\n\nInformacje o tunelu:\n• ID: ${tunnelToClose.id}\n• Port lokalny: ${tunnelToClose.local_port}\n• Port zewnętrzny: ${tunnelToClose.external_port}\n• Port wewnętrzny: ${tunnelToClose.internal_port}\n• Host zdalny: ${tunnelToClose.remote_host}:${tunnelToClose.remote_port}\n• Węzeł: ${tunnelToClose.node}\n• Status: ${tunnelToClose.status}\n\nTa operacja zamknie połączenie i usunie tunel.` : ""}
        confirmText="Zamknij tunel"
        cancelText="Anuluj"
        onConfirm={confirmCloseTunnel}
      />
    </div>
  );
}