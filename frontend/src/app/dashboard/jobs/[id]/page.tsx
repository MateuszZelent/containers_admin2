"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RefreshCcw, ArrowLeft, Link2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { jobsApi } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";

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
  remote_port: number;
  remote_host: string;
  status: string;
  created_at: string;
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

export default function JobDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const jobId = parseInt(params.id);
  
  const [job, setJob] = useState<JobDetails | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [tunnels, setTunnels] = useState<SSHTunnel[]>([]);
  const [tunnelStatus, setTunnelStatus] = useState<TunnelStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [codeServerURL, setCodeServerURL] = useState<string | null>(null);

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

  // Zamknij tunel SSH
  const closeTunnel = async (tunnelId: number) => {
    try {
      await jobsApi.closeJobTunnel(jobId, tunnelId);
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
              <span>{job.job_name}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="font-medium">Status:</span>
              <span className={`px-2 py-1 text-xs rounded-full inline-flex items-center 
                ${jobStatus?.status === 'RUNNING' ? 'bg-green-100 text-green-700' : 
                jobStatus?.status === 'PENDING' ? 'bg-yellow-100 text-yellow-700' : 
                jobStatus?.status === 'COMPLETED' ? 'bg-blue-100 text-blue-700' : 
                'bg-gray-100 text-gray-700'}`}>
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
                      <th className="text-left py-2">Port zewnętrzny</th>
                      <th className="text-left py-2">Port wewnętrzny</th>
                      <th className="text-left py-2">Host zdalny</th>
                      <th className="text-left py-2">Status</th>
                      <th className="text-left py-2">Utworzono</th>
                      <th className="text-left py-2">Akcje</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tunnels.map((tunnel) => (
                      <tr key={tunnel.id} className="border-b hover:bg-muted/50">
                        <td className="py-2">{tunnel.id}</td>
                        <td className="py-2">
                          <span className="font-mono bg-muted px-1 py-0.5 rounded" 
                                title="Port dostępny w przeglądarce i z zewnątrz kontenera">
                            {tunnel.local_port}
                          </span>
                        </td>
                        <td className="py-2">
                          <span className="font-mono bg-muted px-1 py-0.5 rounded" 
                                title="Port wewnętrzny tunelu SSH w kontenerze">
                            {tunnel.remote_port}
                          </span>
                        </td>
                        <td className="py-2">{tunnel.remote_host}</td>
                        <td className="py-2">
                          <span className={`inline-block px-2 py-1 text-xs rounded-full 
                            ${tunnel.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {tunnel.status}
                          </span>
                        </td>
                        <td className="py-2">{formatDate(tunnel.created_at)}</td>
                        <td className="py-2">
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={() => closeTunnel(tunnel.id)}
                          >
                            Zamknij
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
                      URL: <a href={codeServerURL} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
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
    </div>
  );
}