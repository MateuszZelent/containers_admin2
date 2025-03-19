"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RefreshCcw, ArrowLeft, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { jobsApi } from "@/lib/api-client";

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

interface SSHTunnel {
  id: number;
  job_id: number;
  local_port: number;
  remote_port: number;
  remote_host: string;
  status: string;
  created_at: string;
}

export default function JobDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const jobId = parseInt(params.id);
  
  const [job, setJob] = useState<JobDetails | null>(null);
  const [jobStatus, setJobStatus] = useState<any | null>(null);
  const [tunnels, setTunnels] = useState<SSHTunnel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);

  // Pobierz szczegóły zadania i aktualne tunele SSH
  useEffect(() => {
    fetchData();
  }, [jobId]);

  const fetchData = async () => {
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
  };

  // Odśwież dane
  const refreshData = () => {
    fetchData();
    toast.success("Dane zostały odświeżone");
  };

  // Utwórz tunel SSH
  const createTunnel = async () => {
    try {
      await jobsApi.createJobTunnel(jobId);
      toast.success("Tunel SSH został utworzony");
      fetchData();  // Odśwież dane
    } catch (error: any) {
      toast.error(
        error.response?.data?.detail || "Nie udało się utworzyć tunelu SSH"
      );
      console.error(error);
    }
  };

  // Zamknij tunel SSH
  const closeTunnel = async (tunnelId: number) => {
    try {
      await jobsApi.closeJobTunnel(jobId, tunnelId);
      toast.success("Tunel SSH został zamknięty");
      fetchData();  // Odśwież dane
    } catch (error: any) {
      toast.error(
        error.response?.data?.detail || "Nie udało się zamknąć tunelu SSH"
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
    } catch (error: any) {
      toast.error(
        error.response?.data?.detail || "Nie udało się usunąć zadania"
      );
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
                  Czy na pewno chcesz usunąć zadanie "{job.job_name}"? 
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
            <CardTitle>Tunele SSH</CardTitle>
            <CardDescription>
              Zarządzaj tunelami SSH do połączenia z kontenerem
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
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2">ID</th>
                    <th className="text-left py-2">Port lokalny</th>
                    <th className="text-left py-2">Port zdalny</th>
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
                      <td className="py-2">{tunnel.local_port}</td>
                      <td className="py-2">{tunnel.remote_port}</td>
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
          )}
        </CardContent>
        <CardFooter>
          <p className="text-xs text-muted-foreground">
            Tunele SSH umożliwiają bezpieczne połączenie z usługami uruchomionymi w kontenerze poprzez przekierowanie portów.
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
            
            <div className="bg-muted p-4 rounded-md">
              <p className="font-medium">Dostęp przez przeglądarkę:</p>
              <p className="mt-2">
                URL: <code className="bg-background p-1 rounded">https://amucontainers.orion.zfns.eu.org:{job.port}</code>
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Wymaga aktywnego tunelu SSH na port {job.port}.
              </p>
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