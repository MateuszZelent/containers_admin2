"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RefreshCcw, ArrowLeft, Download, FilePlus2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { tasksApi } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { use } from "react"; // Import React.use

interface TaskDetail {
  id: number;
  task_id: string;
  name: string;
  status: string;
  simulation_file: string;
  parameters: any;
  owner_id: number;
  partition: string;
  num_cpus: number;
  memory_gb: number;
  num_gpus: number;
  time_limit: string;
  output_dir: string;
  results_file: string | null;
  progress: number;
  retry_count: number;
  created_at: string;
  queued_at: string;
  submitted_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  next_retry_at: string | null;
  error_message: string | null;
  exit_code: number | null;
  slurm_job_id: string | null;
  node: string | null;
}

interface TaskResults {
  task_id: string;
  status: string;
  started_at: string | null;
  finished_at: string | null;
  elapsed_time: number | null;
  output_dir: string | null;
  results_file: string | null;
  output_files?: string[];
  results_data?: any;
  error_message?: string;
  exit_code?: number;
  retry_count?: number;
  previous_attempts?: any[];
  output_dir_exists?: boolean;
}

export default function TaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const unwrappedParams = use(params); // Unwrap the params Promise
  const taskId = parseInt(unwrappedParams.id);
  
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [results, setResults] = useState<TaskResults | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingResults, setIsLoadingResults] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCanceling, setIsCanceling] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  // Fetch task details
  useEffect(() => {
    const fetchTask = async () => {
      setIsLoading(true);
      try {
        const response = await tasksApi.getTask(taskId);
        setTask(response.data);
        setErrorMessage(null);
      } catch (error: any) {
        const message = error.response?.data?.detail || "Nie udało się pobrać szczegółów zadania";
        setErrorMessage(message);
        toast.error(message);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchTask();
  }, [taskId]);
  
  // Fetch task results if the task is completed
  useEffect(() => {
    if (!task) return;
    
    if (['COMPLETED', 'ERROR', 'ERROR_RETRY_1', 'ERROR_RETRY_2', 'ERROR_RETRY_3', 'CANCELLED'].includes(task.status)) {
      const fetchResults = async () => {
        setIsLoadingResults(true);
        try {
          const response = await tasksApi.getTaskResults(taskId);
          setResults(response.data);
        } catch (error: any) {
          console.error("Nie udało się pobrać wyników zadania:", error);
        } finally {
          setIsLoadingResults(false);
        }
      };
      
      fetchResults();
    }
  }, [task, taskId]);
  
  // Auto-refresh for active tasks
  useEffect(() => {
    if (!task) return;
    
    let interval: NodeJS.Timeout | null = null;
    
    if (['PENDING', 'CONFIGURING', 'RUNNING'].includes(task.status)) {
      interval = setInterval(() => {
        refreshTask();
      }, 10000); // co 10 sekund
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [task]);
  
  // Function to refresh task data
  const refreshTask = async () => {
    setIsRefreshing(true);
    try {
      const response = await tasksApi.getTask(taskId);
      setTask(response.data);
    } catch (error) {
      console.error("Błąd podczas odświeżania zadania:", error);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Cancel task
  const cancelTask = async () => {
    if (!task) return;
    
    setIsCanceling(true);
    try {
      await tasksApi.cancelTask(task.task_id);
      toast.success("Zadanie zostało anulowane");
      refreshTask(); // Refresh data after cancellation
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
  const formatDate = (dateString: string | null) => {
    if (!dateString) return "Nie określono";
    return new Date(dateString).toLocaleString();
  };

  // Format duration from seconds
  const formatDuration = (seconds: number | null) => {
    if (seconds === null) return "Nie określono";
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m ${remainingSeconds}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${remainingSeconds}s`;
    } else {
      return `${remainingSeconds}s`;
    }
  };

  // Get status badge variant
  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case "RUNNING":
        return "default";
      case "PENDING":
      case "CONFIGURING":
        return "secondary";
      case "COMPLETED":
        return "success";
      case "ERROR":
      case "ERROR_RETRY_1":
      case "ERROR_RETRY_2":
      case "ERROR_RETRY_3":
        return "destructive";
      case "CANCELLED":
      case "TIMEOUT":
        return "outline";
      default:
        return "secondary";
    }
  };

  if (isLoading) {
    return <div className="flex justify-center items-center h-[50vh]">Ładowanie szczegółów zadania...</div>;
  }

  if (!task) {
    return <div className="flex justify-center items-center h-[50vh]">Nie znaleziono zadania</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => router.push("/dashboard/task_queue")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-3xl font-bold">Zadanie symulacji: {task.name}</h1>
        </div>
        <div className="flex gap-2">
          <Button onClick={refreshTask} variant="outline" size="sm">
            <RefreshCcw className="h-4 w-4 mr-2" />
            Odśwież
          </Button>
          {(task.status === "PENDING" || task.status === "CONFIGURING" || task.status === "RUNNING") && (
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="destructive" size="sm" disabled={isCanceling}>
                  {isCanceling ? "Anulowanie..." : "Anuluj zadanie"}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Potwierdzenie anulowania</DialogTitle>
                  <DialogDescription>
                    Czy na pewno chcesz anulować zadanie "{task.name}"? 
                    Ta operacja jest nieodwracalna.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button variant="outline">Anuluj</Button>
                  </DialogClose>
                  <Button variant="destructive" onClick={cancelTask}>
                    Tak, anuluj zadanie
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
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
              <span>{task.task_id}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="font-medium">Nazwa:</span>
              <span>{task.name}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="font-medium">Status:</span>
              <Badge variant={getStatusBadgeVariant(task.status)}>
                {task.status}
                {task.retry_count > 0 && ` (${task.retry_count})`}
              </Badge>
            </div>
            {task.slurm_job_id && (
              <div className="flex justify-between py-1">
                <span className="font-medium">SLURM Job ID:</span>
                <span>{task.slurm_job_id}</span>
              </div>
            )}
            <div className="flex justify-between py-1">
              <span className="font-medium">Partycja SLURM:</span>
              <span>{task.partition}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="font-medium">Wykonywane na węźle:</span>
              <span>{task.node || 'Nie przypisano'}</span>
            </div>
            {task.status === "RUNNING" && task.progress > 0 && (
              <div className="py-2">
                <span className="font-medium">Postęp:</span>
                <div className="mt-1">
                  <Progress value={task.progress} className="h-2" />
                  <div className="flex justify-between mt-1 text-xs text-muted-foreground">
                    <span>0%</span>
                    <span>{task.progress}%</span>
                    <span>100%</span>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Zasoby i czasowanie */}
        <Card>
          <CardHeader>
            <CardTitle>Zasoby i czasowanie</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex justify-between py-1">
                  <span className="font-medium">CPU:</span>
                  <span>{task.num_cpus}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="font-medium">Pamięć RAM:</span>
                  <span>{task.memory_gb} GB</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="font-medium">GPU:</span>
                  <span>{task.num_gpus}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="font-medium">Limit czasu:</span>
                  <span className="font-mono">{task.time_limit}</span>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between py-1">
                  <span className="font-medium">Utworzono:</span>
                  <span title={task.created_at}>{formatDate(task.created_at)}</span>
                </div>
                {task.submitted_at && (
                  <div className="flex justify-between py-1">
                    <span className="font-medium">Wysłano do SLURM:</span>
                    <span title={task.submitted_at}>{formatDate(task.submitted_at)}</span>
                  </div>
                )}
                {task.started_at && (
                  <div className="flex justify-between py-1">
                    <span className="font-medium">Czas startu:</span>
                    <span title={task.started_at}>{formatDate(task.started_at)}</span>
                  </div>
                )}
                {task.finished_at && (
                  <div className="flex justify-between py-1">
                    <span className="font-medium">Czas zakończenia:</span>
                    <span title={task.finished_at}>{formatDate(task.finished_at)}</span>
                  </div>
                )}
                {task.next_retry_at && (
                  <div className="flex justify-between py-1">
                    <span className="font-medium">Następna próba:</span>
                    <span title={task.next_retry_at}>{formatDate(task.next_retry_at)}</span>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Szczegóły symulacji */}
      <Card>
        <CardHeader>
          <CardTitle>Szczegóły symulacji</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <h3 className="font-medium">Plik symulacji:</h3>
            <div className="bg-muted p-2 rounded-md overflow-x-auto">
              <code>{task.simulation_file}</code>
            </div>
          </div>
          
          {task.parameters && (
            <div className="space-y-2">
              <h3 className="font-medium">Parametry symulacji:</h3>
              <div className="bg-muted p-2 rounded-md overflow-x-auto">
                <pre>{JSON.stringify(task.parameters, null, 2)}</pre>
              </div>
            </div>
          )}
          
          {task.output_dir && (
            <div className="space-y-2">
              <h3 className="font-medium">Katalog wyjściowy:</h3>
              <div className="bg-muted p-2 rounded-md overflow-x-auto">
                <code>{task.output_dir}</code>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Error information */}
      {task.error_message && (
        <Card className="border-destructive">
          <CardHeader className="bg-destructive/10">
            <CardTitle className="text-destructive">Błąd symulacji</CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <h3 className="font-medium">Komunikat błędu:</h3>
                <div className="bg-muted p-2 rounded-md overflow-x-auto">
                  <code className="text-destructive whitespace-pre-wrap">{task.error_message}</code>
                </div>
              </div>
              
              {task.exit_code !== null && (
                <div className="flex items-center">
                  <span className="font-medium mr-2">Kod wyjścia:</span>
                  <Badge variant="outline">{task.exit_code}</Badge>
                </div>
              )}
              
              {task.retry_count > 0 && (
                <div className="flex items-center">
                  <span className="font-medium mr-2">Liczba ponownych prób:</span>
                  <Badge variant="secondary">{task.retry_count}</Badge>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results section */}
      {(task.status === "COMPLETED" || 
        task.status === "ERROR" || 
        task.status === "ERROR_RETRY_1" || 
        task.status === "ERROR_RETRY_2" || 
        task.status === "ERROR_RETRY_3" || 
        task.status === "CANCELLED") && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Wyniki symulacji</CardTitle>
              <CardDescription>
                Dane wyjściowe z przeprowadzonej symulacji
              </CardDescription>
            </div>
            {!results && (
              <Button 
                variant="outline" 
                onClick={() => fetchResults()}
                disabled={isLoadingResults}
              >
                {isLoadingResults ? (
                  <><RefreshCcw className="h-4 w-4 mr-2 animate-spin" /> Pobieranie...</>
                ) : (
                  <><FilePlus2 className="h-4 w-4 mr-2" /> Pobierz wyniki</>
                )}
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {isLoadingResults ? (
              <div className="flex items-center justify-center py-6">
                <RefreshCcw className="h-6 w-6 animate-spin mr-2" />
                <p>Pobieranie wyników...</p>
              </div>
            ) : !results ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>Kliknij "Pobierz wyniki", aby zobaczyć dane wyjściowe symulacji.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Basic result info */}
                <div className="space-y-2">
                  <h3 className="font-medium">Informacje ogólne:</h3>
                  <div className="bg-muted p-3 rounded-md">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Status:</span>
                        <Badge variant={getStatusBadgeVariant(results.status)}>
                          {results.status}
                        </Badge>
                      </div>
                      {results.elapsed_time !== null && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Czas wykonania aa:</span>
                          <span>{formatDuration(results.elapsed_time)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                
                {/* Output files */}
                {results.output_files && results.output_files.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="font-medium">Pliki wyjściowe:</h3>
                    <div className="bg-muted p-3 rounded-md">
                      <ul className="space-y-2">
                        {results.output_files.map((file, index) => (
                          <li key={index} className="flex items-center justify-between">
                            <code className="text-xs overflow-hidden text-ellipsis">{file}</code>
                            <Button variant="ghost" size="sm">
                              <Download className="h-4 w-4" />
                            </Button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
                
                {/* Results data */}
                {results.results_data && (
                  <div className="space-y-2">
                    <h3 className="font-medium">Dane wynikowe:</h3>
                    <div className="bg-muted p-3 rounded-md overflow-x-auto">
                      <pre className="text-xs">{JSON.stringify(results.results_data, null, 2)}</pre>
                    </div>
                  </div>
                )}
                
                {/* Error information */}
                {(results.error_message || results.exit_code) && (
                  <div className="space-y-2">
                    <h3 className="font-medium text-destructive">Informacje o błędzie:</h3>
                    {results.error_message && (
                      <div className="bg-destructive/10 p-3 rounded-md border border-destructive">
                        <p className="text-destructive whitespace-pre-wrap">{results.error_message}</p>
                      </div>
                    )}
                    {results.exit_code !== undefined && (
                      <div className="flex items-center mt-2">
                        <span className="text-muted-foreground mr-2">Kod wyjścia:</span>
                        <Badge variant="outline">{results.exit_code}</Badge>
                      </div>
                    )}
                  </div>
                )}
                
                {/* Previous attempts */}
                {results.previous_attempts && results.previous_attempts.length > 0 && (
                  <div className="space-y-4">
                    <Separator />
                    <h3 className="font-medium">Historia ponownych prób:</h3>
                    <div className="space-y-4">
                      {results.previous_attempts.map((attempt, index) => (
                        <div key={index} className="bg-muted/50 p-3 rounded-md border">
                          <div className="flex justify-between items-center mb-2">
                            <h4 className="font-medium">Próba #{index + 1}</h4>
                            <Badge variant={getStatusBadgeVariant(attempt.status)}>
                              {attempt.status}
                            </Badge>
                          </div>
                          <div className="text-sm space-y-2">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">SLURM Job ID:</span>
                              <span>{attempt.slurm_job_id}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Czas:</span>
                              <span>{formatDate(attempt.timestamp)}</span>
                            </div>
                            {attempt.error_message && (
                              <div className="mt-2">
                                <span className="text-muted-foreground">Błąd:</span>
                                <div className="mt-1 bg-destructive/10 p-2 rounded text-destructive text-xs">
                                  {attempt.error_message}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}