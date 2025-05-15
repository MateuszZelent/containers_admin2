"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Loader2, RefreshCcw, Plus, FileText } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { tasksApi } from "@/lib/api-client"; // Update import to use tasksApi
import { Progress } from "@/components/ui/progress";

// Define task interface
interface Task {
  id: number;
  task_id: string;
  name: string;
  status: string;
  simulation_file: string;
  progress: number;
  created_at: string;
  partition: string;
  num_cpus: number;
  memory_gb: number;
  num_gpus: number;
  time_limit: string;
  owner_id: number;
  retry_count: number;
  node?: string;
  error_message?: string;
}

// Define interface for the queue status
interface QueueStatus {
  total_tasks: number;
  status_counts: Record<string, number>;
  avg_wait_time: number | null;
  next_task_id: string | null;
  active_worker_count: number;
}

// Schema for submitting new task
const formSchema = z.object({
  name: z.string().min(3, "Nazwa musi mieć co najmniej 3 znaki").max(50, "Nazwa nie może przekraczać 50 znaków"),
  simulation_file: z.string().min(1, "Ścieżka do pliku symulacji jest wymagana"),
  partition: z.string().min(1, "Wybierz partycję"),
  num_cpus: z.coerce.number().int().min(1, "Minimum 1 CPU").max(128, "Maksimum 128 CPU"),
  memory_gb: z.coerce.number().int().min(4, "Minimum 4 GB").max(1024, "Maksimum 1024 GB"),
  num_gpus: z.coerce.number().int().min(0, "Minimum 0 GPU").max(8, "Maksimum 8 GPU"),
  time_limit: z.string().min(5, "Określ limit czasu (np. 24:00:00)").regex(/^\d+:\d{2}:\d{2}$/, "Format: HH:MM:SS"),
  priority: z.coerce.number().int().min(0, "Minimum 0").max(100, "Maksimum 100"),
});

export default function TaskQueuePage() {
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [queueStatus, setQueueStatus] = useState<QueueStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  // Initialize form
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      simulation_file: "",
      partition: "proxima",
      num_cpus: 5,
      memory_gb: 24,
      num_gpus: 1,
      time_limit: "24:00:00",
      priority: 0,
    },
  });

  // Fetch tasks
  const fetchTasks = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await tasksApi.getTasks();
      setTasks(response.data);
      return response;
    } catch (error: any) {
      const errorMessage = error.response?.data?.detail || "Nie udało się pobrać listy zadań";
      toast.error(errorMessage);
      console.error("Error fetching tasks:", error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch queue status
  const fetchQueueStatus = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await tasksApi.getQueueStatus();
      setQueueStatus(response.data);
    } catch (error: any) {
      console.error("Error fetching queue status:", error);
      // Don't show toast to avoid overwhelming the user
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch data on first render
  useEffect(() => {
    const initialFetch = async () => {
      await Promise.all([fetchTasks(), fetchQueueStatus()]);
    };
    initialFetch();
  }, [fetchTasks, fetchQueueStatus]);

  // Refresh data
  const refreshData = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([fetchTasks(), fetchQueueStatus()]);
      toast.success("Dane zostały odświeżone");
    } catch (error) {
      console.error("Error refreshing data:", error);
      toast.error("Błąd podczas odświeżania danych");
    } finally {
      setIsRefreshing(false);
    }
  };

  // Submit new task
  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsSubmitting(true);
    try {
      const response = await tasksApi.createTask(values);
      toast.success(`Zadanie symulacji zostało utworzone! ID: ${response.data.task_id}`);
      form.reset();
      fetchTasks(); // Refresh list after adding
    } catch (error: any) {
      const errorMessage = error.response?.data?.detail || "Błąd podczas wysyłania zadania";
      toast.error(errorMessage);
      console.error("Error submitting task:", error);
    } finally {
      setIsSubmitting(false);
    }
  }

  // Cancel task - updated to use task id as number
  const cancelTask = async (taskId: number) => {
    try {
      await tasksApi.cancelTask(taskId);
      toast.success("Zadanie zostało anulowane");
      fetchTasks(); // Refresh the list
    } catch (error: any) {
      const errorMessage = error.response?.data?.detail || "Nie udało się anulować zadania";
      toast.error(errorMessage);
      console.error(`Error cancelling task ${taskId}:`, error);
    }
  };

  // Format date
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
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

  // Filter tasks based on their status
  const getFilteredTasks = useCallback(() => {
    if (!tasks) return [];
    
    // Apply status filter if set
    if (statusFilter) {
      return tasks.filter(task => task.status === statusFilter);
    }
    
    return tasks;
  }, [tasks, statusFilter]);

  // Get active tasks (PENDING, RUNNING, CONFIGURING)
  const getActiveTasks = useCallback(() => {
    return tasks.filter(task => 
      ["PENDING", "RUNNING", "CONFIGURING"].includes(task.status)
    );
  }, [tasks]);

  // Get finished tasks (COMPLETED, ERROR, CANCELLED, etc.)
  const getFinishedTasks = useCallback(() => {
    return tasks.filter(task => 
      ["COMPLETED", "ERROR", "ERROR_RETRY_1", "ERROR_RETRY_2", "ERROR_RETRY_3", "CANCELLED", "TIMEOUT"].includes(task.status)
    );
  }, [tasks]);

  // Auto-refresh
  useEffect(() => {
    const interval = setInterval(() => {
      // Only auto-refresh if there are running or pending tasks
      if (
        tasks.some(
          (task) =>
            task.status === "RUNNING" ||
            task.status === "PENDING" ||
            task.status === "CONFIGURING"
        )
      ) {
        fetchTasks();
        fetchQueueStatus();
      }
    }, 10000); // Every 10 seconds

    return () => clearInterval(interval);
  }, [tasks, fetchTasks, fetchQueueStatus]);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Kolejka zadań symulacji</h1>
        <div className="flex gap-2">
          <Button 
            onClick={refreshData} 
            variant="outline" 
            size="sm"
            disabled={isRefreshing}
          >
            <RefreshCcw className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
            {isRefreshing ? "Odświeżanie..." : "Odśwież"}
          </Button>
        </div>
      </div>

      {/* Queue status card */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Status kolejki</CardTitle>
        </CardHeader>
        <CardContent>
          {!queueStatus ? (
            <div className="flex items-center">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              <p>Pobieranie statusu kolejki...</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-muted/50 p-4 rounded-md">
                <p className="text-sm text-muted-foreground">Zadań w kolejce</p>
                <p className="text-2xl font-bold">{queueStatus.total_tasks}</p>
              </div>
              <div className="bg-muted/50 p-4 rounded-md">
                <p className="text-sm text-muted-foreground">Aktywne zadania</p>
                <p className="text-2xl font-bold">{queueStatus.status_counts.RUNNING || 0}</p>
              </div>
              <div className="bg-muted/50 p-4 rounded-md">
                <p className="text-sm text-muted-foreground">Oczekujące zadania</p>
                <p className="text-2xl font-bold">{queueStatus.status_counts.PENDING || 0}</p>
              </div>
              <div className="bg-muted/50 p-4 rounded-md">
                <p className="text-sm text-muted-foreground">Średni czas oczekiwania</p>
                <p className="text-2xl font-bold">
                  {queueStatus.avg_wait_time 
                    ? `${Math.round(queueStatus.avg_wait_time / 60)} min` 
                    : "N/A"}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Separator />

      <Tabs defaultValue="all-tasks" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="all-tasks">Wszystkie zadania</TabsTrigger>
          <TabsTrigger value="active-tasks">Zadania aktywne</TabsTrigger>
          <TabsTrigger value="finished-tasks">Zadania zakończone</TabsTrigger>
          <TabsTrigger value="add-task">Dodaj nowe zadanie</TabsTrigger>
        </TabsList>

        {/* Tab 1: All Tasks */}
        <TabsContent value="all-tasks">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                <CardTitle>Wszystkie zadania symulacji</CardTitle>
                <div className="flex flex-wrap gap-2">
                  <Button 
                    variant={statusFilter === null ? "default" : "outline"} 
                    size="sm"
                    onClick={() => setStatusFilter(null)}
                  >
                    Wszystkie
                  </Button>
                  <Button 
                    variant={statusFilter === "RUNNING" ? "default" : "outline"} 
                    size="sm"
                    onClick={() => setStatusFilter("RUNNING")}
                  >
                    Aktywne
                  </Button>
                  <Button 
                    variant={statusFilter === "PENDING" ? "default" : "outline"} 
                    size="sm"
                    onClick={() => setStatusFilter("PENDING")}
                  >
                    Oczekujące
                  </Button>
                  <Button 
                    variant={statusFilter === "COMPLETED" ? "default" : "outline"} 
                    size="sm"
                    onClick={() => setStatusFilter("COMPLETED")}
                  >
                    Zakończone
                  </Button>
                  <Button 
                    variant={statusFilter === "ERROR" ? "default" : "outline"} 
                    size="sm"
                    onClick={() => setStatusFilter("ERROR")}
                  >
                    Błędy
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-6 w-6 animate-spin mr-2" />
                  <p>Ładowanie zadań...</p>
                </div>
              ) : getFilteredTasks().length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>Brak zadań symulacji.</p>
                  <p className="mt-2">Użyj zakładki "Dodaj nowe zadanie", aby utworzyć symulację.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2">ID</th>
                        <th className="text-left py-2">Nazwa</th>
                        <th className="text-left py-2">Status</th>
                        <th className="text-left py-2">Postęp</th>
                        <th className="text-left py-2">Plik symulacji</th>
                        <th className="text-left py-2">Węzeł</th>
                        <th className="text-left py-2">Utworzono</th>
                        <th className="text-left py-2">Akcje</th>
                      </tr>
                    </thead>
                    <tbody>
                      {getFilteredTasks().map((task) => (
                        <tr key={task.id} className="border-b hover:bg-muted/50">
                          <td className="py-2">{task.task_id}</td>
                          <td className="py-2">{task.name}</td>
                          <td className="py-2">
                            <Badge variant={getStatusBadgeVariant(task.status)}>
                              {task.status}
                              {task.retry_count > 0 && ` (${task.retry_count})`}
                            </Badge>
                          </td>
                          <td className="py-2 w-32">
                            {task.status === "RUNNING" && (
                              <div className="flex items-center gap-2">
                                <Progress value={task.progress} className="w-full" />
                                <span className="text-xs">{task.progress}%</span>
                              </div>
                            )}
                          </td>
                          <td className="py-2 truncate max-w-xs" title={task.simulation_file}>
                            {task.simulation_file.split('/').pop()}
                          </td>
                          <td className="py-2">{task.node || 'Nie przypisano'}</td>
                          <td className="py-2">{formatDate(task.created_at)}</td>
                          <td className="py-2">
                            <div className="flex gap-2">
                              <Link href={`/dashboard/task_queue/${task.id}`}>
                                <Button variant="outline" size="sm">
                                  <FileText className="h-4 w-4 mr-1" />
                                  Szczegóły
                                </Button>
                              </Link>
                              {(task.status === "PENDING" || 
                                task.status === "RUNNING" || 
                                task.status === "CONFIGURING") && (
                                <Button 
                                  variant="destructive" 
                                  size="sm"
                                  onClick={() => cancelTask(task.id)} // Changed from task.task_id to task.id
                                >
                                  Anuluj
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Active Tasks */}
        <TabsContent value="active-tasks">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Zadania aktywne</CardTitle>
              <CardDescription>
                Zadania w trakcie wykonywania lub oczekujące w kolejce
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-6 w-6 animate-spin mr-2" />
                  <p>Ładowanie zadań...</p>
                </div>
              ) : getActiveTasks().length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>Brak aktywnych zadań.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2">ID</th>
                        <th className="text-left py-2">Nazwa</th>
                        <th className="text-left py-2">Status</th>
                        <th className="text-left py-2">Postęp</th>
                        <th className="text-left py-2">Plik symulacji</th>
                        <th className="text-left py-2">Węzeł</th>
                        <th className="text-left py-2">Utworzono</th>
                        <th className="text-left py-2">Akcje</th>
                      </tr>
                    </thead>
                    <tbody>
                      {getActiveTasks().map((task) => (
                        <tr key={task.id} className="border-b hover:bg-muted/50">
                          <td className="py-2">{task.task_id}</td>
                          <td className="py-2">{task.name}</td>
                          <td className="py-2">
                            <Badge variant={getStatusBadgeVariant(task.status)}>
                              {task.status}
                              {task.retry_count > 0 && ` (${task.retry_count})`}
                            </Badge>
                          </td>
                          <td className="py-2 w-32">
                            {task.status === "RUNNING" && (
                              <div className="flex items-center gap-2">
                                <Progress value={task.progress} className="w-full" />
                                <span className="text-xs">{task.progress}%</span>
                              </div>
                            )}
                          </td>
                          <td className="py-2 truncate max-w-xs" title={task.simulation_file}>
                            {task.simulation_file.split('/').pop()}
                          </td>
                          <td className="py-2">{task.node || 'Nie przypisano'}</td>
                          <td className="py-2">{formatDate(task.created_at)}</td>
                          <td className="py-2">
                            <div className="flex gap-2">
                              <Link href={`/dashboard/task_queue/${task.id}`}>
                                <Button variant="outline" size="sm">
                                  <FileText className="h-4 w-4 mr-1" />
                                  Szczegóły
                                </Button>
                              </Link>
                              {(task.status === "PENDING" || 
                                task.status === "RUNNING" || 
                                task.status === "CONFIGURING") && (
                                <Button 
                                  variant="destructive" 
                                  size="sm"
                                  onClick={() => cancelTask(task.id)} // Changed from task.task_id to task.id
                                >
                                  Anuluj
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3: Finished Tasks */}
        <TabsContent value="finished-tasks">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Zadania zakończone</CardTitle>
              <CardDescription>
                Zadania zakończone, anulowane lub zakończone błędem
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-6 w-6 animate-spin mr-2" />
                  <p>Ładowanie zadań...</p>
                </div>
              ) : getFinishedTasks().length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>Brak zakończonych zadań.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2">ID</th>
                        <th className="text-left py-2">Nazwa</th>
                        <th className="text-left py-2">Status</th>
                        <th className="text-left py-2">Plik symulacji</th>
                        <th className="text-left py-2">Zakończone</th>
                        <th className="text-left py-2">Akcje</th>
                      </tr>
                    </thead>
                    <tbody>
                      {getFinishedTasks().map((task) => (
                        <tr key={task.id} className="border-b hover:bg-muted/50">
                          <td className="py-2">{task.task_id}</td>
                          <td className="py-2">{task.name}</td>
                          <td className="py-2">
                            <Badge variant={getStatusBadgeVariant(task.status)}>
                              {task.status}
                              {task.retry_count > 0 && ` (${task.retry_count})`}
                            </Badge>
                          </td>
                          <td className="py-2 truncate max-w-xs" title={task.simulation_file}>
                            {task.simulation_file.split('/').pop()}
                          </td>
                          <td className="py-2">{formatDate(task.created_at)}</td>
                          <td className="py-2">
                            <div className="flex gap-2">
                              <Link href={`/dashboard/task_queue/${task.id}`}>
                                <Button variant="outline" size="sm">
                                  <FileText className="h-4 w-4 mr-1" />
                                  Szczegóły
                                </Button>
                              </Link>
                              {(task.status === "PENDING" || 
                                task.status === "RUNNING" || 
                                task.status === "CONFIGURING") && (
                                <Button 
                                  variant="destructive" 
                                  size="sm"
                                  onClick={() => cancelTask(task.id)} // Changed from task.task_id to task.id
                                >
                                  Anuluj
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 4: Add New Task form */}
        <TabsContent value="add-task">
          <Card>
            <CardHeader>
              <CardTitle>Dodaj nowe zadanie symulacji</CardTitle>
              <CardDescription>
                Wypełnij formularz, aby utworzyć nowe zadanie symulacji Mumax3
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nazwa zadania</FormLabel>
                        <FormControl>
                          <Input placeholder="np. Resonator FMR" {...field} />
                        </FormControl>
                        <FormDescription>
                          Opisowa nazwa zadania symulacji
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="simulation_file"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Ścieżka do pliku .mx3</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="/mnt/local/kkingstoun/admin/pcss_storage/mannga/path/to/file.mx3"
                            {...field} 
                          />
                        </FormControl>
                        <FormDescription>
                          Pełna ścieżka do pliku symulacji w kontenerze
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="partition"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Partycja SLURM</FormLabel>
                          <FormControl>
                            <select
                              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                              {...field}
                            >
                              <option value="proxima">proxima</option>
                              <option value="a100">a100</option>
                              <option value="standard">standard</option>
                            </select>
                          </FormControl>
                          <FormDescription>
                            Partycja SLURM dla zadania
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="priority"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Priorytet</FormLabel>
                          <FormControl>
                            <Input type="number" min={0} max={100} {...field} />
                          </FormControl>
                          <FormDescription>
                            Priorytet zadania (0-100, wyższy = ważniejszy)
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <FormField
                      control={form.control}
                      name="num_cpus"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Liczba CPU</FormLabel>
                          <FormControl>
                            <Input type="number" min={1} max={128} {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="memory_gb"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Pamięć RAM (GB)</FormLabel>
                          <FormControl>
                            <Input type="number" min={4} max={1024} {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="num_gpus"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Liczba GPU</FormLabel>
                          <FormControl>
                            <Input type="number" min={0} max={8} {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="time_limit"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Limit czasu</FormLabel>
                        <FormControl>
                          <Input placeholder="24:00:00" {...field} />
                        </FormControl>
                        <FormDescription>
                          Format: godziny:minuty:sekundy (np. 24:00:00 dla 24 godzin)
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Wysyłanie...
                      </>
                    ) : (
                      <>
                        <Plus className="mr-2 h-4 w-4" />
                        Dodaj zadanie
                      </>
                    )}
                  </Button>
                </form>
              </Form>
            </CardContent>
            <CardFooter className="bg-muted/50 text-sm text-muted-foreground">
              <div className="space-y-2">
                <p>
                  <span className="font-semibold">Uwaga:</span> Zadanie zostanie dodane do kolejki i wykonane, gdy dostępne będą zasoby.
                </p>
                <p>
                  Symulacja zostanie wykonana na klastrze z użyciem programu Mumax3 z podanymi parametrami.
                </p>
              </div>
            </CardFooter>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
