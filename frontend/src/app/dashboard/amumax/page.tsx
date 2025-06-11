"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Loader2, RefreshCcw, Plus, FileText, Cpu, HardDrive, Zap } from "lucide-react";
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
import { Progress } from "@/components/ui/progress";
import { tasksApi } from "@/lib/api-client";

// Amumax Task interface
interface AmumaxTask {
  id: number;
  task_id: string;
  name: string;
  status: string;
  simulation_file: string;
  progress: number;
  created_at: string;
  started_at?: string;
  finished_at?: string;
  partition: string;
  num_cpus: number;
  memory_gb: number;
  num_gpus: number;
  time_limit: string;
  owner_id: number;
  retry_count: number;
  node?: string;
  error_message?: string;
  slurm_job_id?: string;
}

// Validation schema for Amumax tasks
const amumaxFormSchema = z.object({
  task_name: z.string()
    .min(3, "Nazwa musi mieć co najmniej 3 znaki")
    .max(50, "Nazwa nie może przekraczać 50 znaków"),
  mx3_file_path: z.string()
    .min(1, "Ścieżka do pliku .mx3 jest wymagana")
    .regex(/\.mx3$/, "Plik musi mieć rozszerzenie .mx3"),
  partition: z.string().min(1, "Wybierz partycję"),
  num_cpus: z.coerce.number().int().min(1, "Minimum 1 CPU").max(128, "Maksimum 128 CPU"),
  memory_gb: z.coerce.number().int().min(4, "Minimum 4 GB").max(1024, "Maksimum 1024 GB"),
  num_gpus: z.coerce.number().int().min(1, "Amumax wymaga co najmniej 1 GPU").max(8, "Maksimum 8 GPU"),
  time_limit: z.string()
    .min(5, "Określ limit czasu (np. 24:00:00)")
    .regex(/^\d+:\d{2}:\d{2}$/, "Format: HH:MM:SS"),
  priority: z.coerce.number().int().min(0, "Minimum 0").max(100, "Maksimum 100"),
  auto_submit: z.boolean().default(true),
});

export default function AmumaxTasksPage() {
  const router = useRouter();
  const [tasks, setTasks] = useState<AmumaxTask[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [fileValidation, setFileValidation] = useState<{
    isValid: boolean;
    message: string;
  } | null>(null);

  // Form for creating Amumax tasks
  const form = useForm<z.infer<typeof amumaxFormSchema>>({
    resolver: zodResolver(amumaxFormSchema),
    defaultValues: {
      task_name: "",
      mx3_file_path: "",
      partition: "proxima",
      num_cpus: 5,
      memory_gb: 24,
      num_gpus: 1,
      time_limit: "24:00:00",
      priority: 0,
      auto_submit: true,
    },
  });

  // Fetch Amumax tasks
  const fetchAmumaxTasks = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await tasksApi.getAmumaxTasks();
      setTasks(response.data);
    } catch (error: any) {
      const errorMessage = error.response?.data?.detail || "Nie udało się pobrać zadań Amumax";
      console.error("Error fetching Amumax tasks:", error);
      // Don't show toast on initial load to avoid spam
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Validate MX3 file
  const validateMx3File = async (filePath: string) => {
    if (!filePath.trim()) {
      setFileValidation(null);
      return;
    }

    setIsValidating(true);
    try {
      const response = await tasksApi.validateMx3File(filePath);
      setFileValidation({
        isValid: response.data.is_valid,
        message: response.data.message,
      });
    } catch (error: any) {
      setFileValidation({
        isValid: false,
        message: "Błąd podczas walidacji pliku",
      });
    } finally {
      setIsValidating(false);
    }
  };

  // Watch file path changes for validation
  const watchedFilePath = form.watch("mx3_file_path");
  useEffect(() => {
    const timer = setTimeout(() => {
      if (watchedFilePath) {
        validateMx3File(watchedFilePath);
      }
    }, 500); // Debounce validation

    return () => clearTimeout(timer);
  }, [watchedFilePath]);

  // Fetch data on component mount
  useEffect(() => {
    fetchAmumaxTasks();
  }, [fetchAmumaxTasks]);

  // Submit new Amumax task
  async function onSubmit(values: z.infer<typeof amumaxFormSchema>) {
    setIsSubmitting(true);
    try {
      const response = await tasksApi.createAmumaxTask(values);
      toast.success(`Zadanie Amumax zostało utworzone! ID: ${response.data.task_id}`);
      form.reset();
      setFileValidation(null);
      fetchAmumaxTasks(); // Refresh list
    } catch (error: any) {
      const errorMessage = error.response?.data?.detail || "Błąd podczas tworzenia zadania Amumax";
      toast.error(errorMessage);
      console.error("Error creating Amumax task:", error);
    } finally {
      setIsSubmitting(false);
    }
  }

  // Cancel task
  const cancelTask = async (taskId: number) => {
    try {
      await tasksApi.cancelTask(taskId);
      toast.success("Zadanie zostało anulowane");
      fetchAmumaxTasks();
    } catch (error: any) {
      const errorMessage = error.response?.data?.detail || "Nie udało się anulować zadania";
      toast.error(errorMessage);
    }
  };

  // Get results for completed task
  const viewResults = async (taskId: number) => {
    try {
      const response = await tasksApi.getAmumaxResults(taskId);
      // Navigate to results page or show modal
      router.push(`/dashboard/task_queue/${taskId}/amumax-results`);
    } catch (error: any) {
      const errorMessage = error.response?.data?.detail || "Nie udało się pobrać wyników";
      toast.error(errorMessage);
    }
  };

  // Refresh data
  const refreshData = async () => {
    setIsRefreshing(true);
    try {
      await fetchAmumaxTasks();
      toast.success("Dane zostały odświeżone");
    } catch (error) {
      toast.error("Błąd podczas odświeżania danych");
    } finally {
      setIsRefreshing(false);
    }
  };

  // Format date
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString("pl-PL");
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

  // Auto-refresh for active tasks
  useEffect(() => {
    const interval = setInterval(() => {
      if (tasks.some(task => ["RUNNING", "PENDING", "CONFIGURING"].includes(task.status))) {
        fetchAmumaxTasks();
      }
    }, 30000); // Refresh every 30 seconds

    return () => clearInterval(interval);
  }, [tasks, fetchAmumaxTasks]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Zadania Amumax</h1>
          <p className="text-muted-foreground">
            Zarządzaj symulacjami mikromagnetycznymi Amumax
          </p>
        </div>
        <Button
          onClick={refreshData}
          disabled={isRefreshing}
          variant="outline"
          className="h-8 w-8 p-0"
        >
          <RefreshCcw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
        </Button>
      </div>

      <Tabs defaultValue="tasks" className="space-y-4">
        <TabsList>
          <TabsTrigger value="tasks">Zadania</TabsTrigger>
          <TabsTrigger value="create">Nowe zadanie</TabsTrigger>
        </TabsList>

        <TabsContent value="tasks" className="space-y-4">
          <div className="grid gap-4">
            {isLoading ? (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : tasks.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center p-8">
                  <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-lg font-semibold">Brak zadań Amumax</p>
                  <p className="text-muted-foreground text-center">
                    Nie masz jeszcze żadnych zadań symulacji mikromagnetycznych.
                  </p>
                </CardContent>
              </Card>
            ) : (
              tasks.map((task) => (
                <Card key={task.id}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-lg">{task.name}</CardTitle>
                        <CardDescription>
                          ID: {task.task_id} • Plik: {task.simulation_file.split('/').pop()}
                        </CardDescription>
                      </div>
                      <Badge variant={getStatusBadgeVariant(task.status)}>
                        {task.status}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                      <div className="flex items-center gap-2">
                        <Cpu className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">{task.num_cpus} CPU</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <HardDrive className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">{task.memory_gb} GB RAM</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Zap className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">{task.num_gpus} GPU</span>
                      </div>
                    </div>

                    {task.progress > 0 && (
                      <div className="mb-4">
                        <div className="flex justify-between text-sm mb-1">
                          <span>Postęp</span>
                          <span>{task.progress}%</span>
                        </div>
                        <Progress value={task.progress} />
                      </div>
                    )}

                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                      <span>Utworzone: {formatDate(task.created_at)}</span>
                      {task.node && <span>Węzeł: {task.node}</span>}
                    </div>

                    {task.error_message && (
                      <div className="mt-2 p-2 bg-destructive/10 rounded text-sm text-destructive">
                        {task.error_message}
                      </div>
                    )}
                  </CardContent>
                  <CardFooter className="flex gap-2">
                    <Link href={`/dashboard/task_queue/${task.id}`}>
                      <Button variant="outline" size="sm">
                        Szczegóły
                      </Button>
                    </Link>
                    {task.status === "COMPLETED" && (
                      <Button variant="outline" size="sm" onClick={() => viewResults(task.id)}>
                        Wyniki
                      </Button>
                    )}
                    {["PENDING", "CONFIGURING", "RUNNING"].includes(task.status) && (
                      <Button 
                        variant="destructive" 
                        size="sm" 
                        onClick={() => cancelTask(task.id)}
                      >
                        Anuluj
                      </Button>
                    )}
                  </CardFooter>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="create" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Nowe zadanie Amumax</CardTitle>
              <CardDescription>
                Utwórz nową symulację mikromagnetyczną Amumax
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="task_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nazwa zadania</FormLabel>
                        <FormControl>
                          <Input placeholder="np. Symulacja domeny magnetycznej" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="mx3_file_path"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Ścieżka do pliku .mx3</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="/mnt/local/.../simulation.mx3" 
                            {...field} 
                          />
                        </FormControl>
                        <FormDescription>
                          Ścieżka do pliku symulacji Amumax (.mx3)
                        </FormDescription>
                        {isValidating && (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Sprawdzanie pliku...
                          </div>
                        )}
                        {fileValidation && (
                          <div className={`text-sm ${
                            fileValidation.isValid ? "text-green-600" : "text-red-600"
                          }`}>
                            {fileValidation.message}
                          </div>
                        )}
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
                          <FormLabel>Partycja</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="time_limit"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Limit czasu</FormLabel>
                          <FormControl>
                            <Input placeholder="24:00:00" {...field} />
                          </FormControl>
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
                          <FormLabel>CPU</FormLabel>
                          <FormControl>
                            <Input type="number" {...field} />
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
                          <FormLabel>RAM (GB)</FormLabel>
                          <FormControl>
                            <Input type="number" {...field} />
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
                          <FormLabel>GPU</FormLabel>
                          <FormControl>
                            <Input type="number" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="priority"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Priorytet (0-100)</FormLabel>
                        <FormControl>
                          <Input type="number" {...field} />
                        </FormControl>
                        <FormDescription>
                          Wyższy priorytet = wcześniejsze wykonanie
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button 
                    type="submit" 
                    disabled={isSubmitting || (fileValidation && !fileValidation.isValid)}
                    className="w-full"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Tworzenie zadania...
                      </>
                    ) : (
                      <>
                        <Plus className="mr-2 h-4 w-4" />
                        Utwórz zadanie Amumax
                      </>
                    )}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
