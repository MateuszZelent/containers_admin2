"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RefreshCcw, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { jobsApi } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";

interface AmumaxJobDetail {
  id: number;
  job_id: string;
  name: string;
  status: string;
  simulation_time: string;
  input_path: string;
  prefix: string;
  created_at: string;
  node?: string;
  owner_id: number;
  logs?: string;
  progress?: number;
  estimated_completion?: string;
}

export default function AmumaxJobDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const jobId = parseInt(params.id);
  
  const [job, setJob] = useState<AmumaxJobDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCanceling, setIsCanceling] = useState(false);

  // Fetch job details
  useEffect(() => {
    fetchData();
  }, [jobId]);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const response = await jobsApi.getAmumaxJob(jobId);
      setJob(response.data);
    } catch (error) {
      toast.error("Nie udało się pobrać szczegółów zadania");
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  // Refresh data
  const refreshData = () => {
    fetchData();
    toast.success("Dane zostały odświeżone");
  };

  // Cancel job
  const cancelJob = async () => {
    setIsCanceling(true);
    try {
      await jobsApi.cancelAmumaxJob(jobId);
      toast.success("Zadanie zostało anulowane");
      router.push("/dashboard/jobs_queue");
    } catch (error: any) {
      toast.error(
        error.response?.data?.detail || "Nie udało się anulować zadania"
      );
      console.error(error);
    } finally {
      setIsCanceling(false);
    }
  };

  // Format date
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
          <Button variant="outline" size="icon" onClick={() => router.push("/dashboard/jobs_queue")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-3xl font-bold">Zadanie amumax: {job.name}</h1>
        </div>
        <div className="flex gap-2">
          <Button onClick={refreshData} variant="outline" size="sm">
            <RefreshCcw className="h-4 w-4 mr-2" />
            Odśwież
          </Button>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="destructive" size="sm" disabled={isCanceling || job.status === 'COMPLETED' || job.status === 'CANCELLED'}>
                {isCanceling ? "Anulowanie..." : "Anuluj zadanie"}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Potwierdzenie anulowania</DialogTitle>
                <DialogDescription>
                  Czy na pewno chcesz anulować zadanie "{job.name}"? 
                  Ta operacja jest nieodwracalna.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">Nie</Button>
                </DialogClose>
                <Button variant="destructive" onClick={cancelJob}>
                  Tak, anuluj zadanie
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
              <span>{job.name}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="font-medium">Status:</span>
              <Badge
                variant={
                  job.status === 'RUNNING' ? 'default' : 
                  job.status === 'PENDING' ? 'secondary' : 
                  job.status === 'COMPLETED' ? 'outline' : 
                  'destructive'
                }
              >
                {job.status}
              </Badge>
            </div>
            <div className="flex justify-between py-1">
              <span className="font-medium">Prefix:</span>
              <span>{job.prefix}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="font-medium">Data utworzenia:</span>
              <span>{formatDate(job.created_at)}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="font-medium">Wykonywane na węźle:</span>
              <span>{job.node || 'Nie przypisano'}</span>
            </div>
          </CardContent>
        </Card>

        {/* Szczegóły symulacji */}
        <Card>
          <CardHeader>
            <CardTitle>Szczegóły symulacji</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between py-1">
              <span className="font-medium">Czas symulacji:</span>
              <span className="font-mono">{job.simulation_time}</span>
            </div>
            <div className="py-1">
              <span className="font-medium">Ścieżka do pliku wejściowego:</span>
              <div className="mt-1 p-2 bg-muted rounded-md break-words">
                <code>{job.input_path}</code>
              </div>
            </div>
            {job.progress !== undefined && (
              <div className="py-1">
                <span className="font-medium">Postęp symulacji:</span>
                <div className="mt-1 h-2 w-full bg-muted rounded overflow-hidden">
                  <div 
                    className="h-full bg-primary"
                    style={{ width: `${job.progress}%` }}
                  />
                </div>
                <span className="text-xs text-right block mt-1">{job.progress}%</span>
              </div>
            )}
            {job.estimated_completion && (
              <div className="flex justify-between py-1">
                <span className="font-medium">Szacowane zakończenie:</span>
                <span>{formatDate(job.estimated_completion)}</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Logi symulacji */}
      {job.logs && (
        <Card>
          <CardHeader>
            <CardTitle>Logi symulacji</CardTitle>
            <CardDescription>
              Ostatnie wpisy z logów symulacji amumax
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="bg-muted p-4 rounded-md font-mono text-xs whitespace-pre-wrap overflow-x-auto max-h-80 overflow-y-auto">
              {job.logs}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
