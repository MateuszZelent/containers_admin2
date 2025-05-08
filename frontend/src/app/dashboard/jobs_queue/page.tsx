"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Loader2, RefreshCcw, Plus } from "lucide-react";
import { useRouter } from "next/navigation";

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
import { jobsApi } from "@/lib/api-client";

// Define interface for amumax job
interface AmumaxJob {
  id: number;
  job_id: string;
  name: string;
  status: string;
  simulation_time: string;
  input_path: string;
  prefix: string;
  created_at: string;
  owner_id: number;
  node?: string;
}

// Schema for adding new amumax job
const formSchema = z.object({
  simulation_time: z.string()
    .min(5, "Określ czas symulacji (np. 24:00:00)")
    .regex(/^\d+:\d{2}:\d{2}$/, "Format czasu musi być HH:MM:SS"),
  input_path: z.string()
    .min(1, "Ścieżka do pliku wejściowego jest wymagana"),
  prefix: z.string()
    .min(2, "Prefix musi mieć co najmniej 2 znaki")
    .max(15, "Prefix nie może przekraczać 15 znaków"),
});

export default function JobsQueuePage() {
  const router = useRouter();
  const [activeJobs, setActiveJobs] = useState<AmumaxJob[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Initialize form
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      simulation_time: "24:00:00",
      input_path: "",
      prefix: "amumax_",
    },
  });

  // Fetch active amumax jobs
  const fetchActiveJobs = useCallback(async () => {
    setIsLoading(true);
    try {
      // This is a placeholder - you'll need to update the API client to include this endpoint
      const response = await jobsApi.getActiveAmumaxJobs();
      setActiveJobs(response.data);
    } catch (error: any) {
      const errorMessage = error.response?.data?.detail || "Nie udało się pobrać listy zadań amumax";
      toast.error(errorMessage);
      console.error("Error fetching amumax jobs:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch data on first render
  useEffect(() => {
    fetchActiveJobs();
  }, [fetchActiveJobs]);

  // Refresh data
  const refreshData = async () => {
    setIsRefreshing(true);
    try {
      await fetchActiveJobs();
      toast.success("Dane zostały odświeżone");
    } catch (error) {
      console.error("Error refreshing data:", error);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Submit new amumax job
  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsSubmitting(true);
    try {
      // This is a placeholder - you'll need to update the API client to include this endpoint
      const response = await jobsApi.createAmumaxJob(values);
      toast.success(`Zadanie amumax zostało utworzone! ID: ${response.data.job_id}`);
      form.reset();
      fetchActiveJobs(); // Refresh list after adding
    } catch (error: any) {
      const errorMessage = error.response?.data?.detail || "Błąd podczas wysyłania zadania amumax";
      toast.error(errorMessage);
      console.error("Error submitting amumax job:", error);
    } finally {
      setIsSubmitting(false);
    }
  }

  // Format date
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Kolejka zadań amumax</h1>
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

      <Separator />

      <Tabs defaultValue="active-jobs" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="active-jobs">Lista aktywnych zadań</TabsTrigger>
          <TabsTrigger value="add-job">Dodaj nowe zadanie</TabsTrigger>
        </TabsList>

        {/* Tab 1: Active amumax jobs list */}
        <TabsContent value="active-jobs">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Zadania amumax w kolejce</CardTitle>
              <CardDescription>
                Lista aktualnie przetwarzanych zadań symulacji amumax
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-6 w-6 animate-spin mr-2" />
                  <p>Ładowanie zadań...</p>
                </div>
              ) : activeJobs.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>Brak aktywnych zadań amumax.</p>
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
                        <th className="text-left py-2">Czas symulacji</th>
                        <th className="text-left py-2">Ścieżka wejściowa</th>
                        <th className="text-left py-2">Węzeł</th>
                        <th className="text-left py-2">Utworzono</th>
                        <th className="text-left py-2">Akcje</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeJobs.map((job) => (
                        <tr key={job.id} className="border-b hover:bg-muted/50">
                          <td className="py-2">{job.job_id}</td>
                          <td className="py-2">{job.name}</td>
                          <td className="py-2">
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
                          </td>
                          <td className="py-2 font-mono">{job.simulation_time}</td>
                          <td className="py-2 truncate max-w-xs" title={job.input_path}>
                            {job.input_path}
                          </td>
                          <td className="py-2">{job.node || 'Nie przypisano'}</td>
                          <td className="py-2">{formatDate(job.created_at)}</td>
                          <td className="py-2">
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => router.push(`/dashboard/jobs_queue/${job.id}`)}
                            >
                              Szczegóły
                            </Button>
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

        {/* Tab 2: Add new amumax job form */}
        <TabsContent value="add-job">
          <Card>
            <CardHeader>
              <CardTitle>Dodaj nowe zadanie amumax</CardTitle>
              <CardDescription>
                Wypełnij formularz, aby utworzyć nowe zadanie symulacji amumax
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <FormField
                    control={form.control}
                    name="simulation_time"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Czas symulacji</FormLabel>
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

                  <FormField
                    control={form.control}
                    name="input_path"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Ścieżka do pliku wejściowego</FormLabel>
                        <FormControl>
                          <Input placeholder="/path/to/input/file.mx3" {...field} />
                        </FormControl>
                        <FormDescription>
                          Pełna ścieżka do pliku wejściowego symulacji
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="prefix"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Prefix nazwy zadania SLURM</FormLabel>
                        <FormControl>
                          <Input placeholder="amumax_" {...field} />
                        </FormControl>
                        <FormDescription>
                          Prefix będzie dodany do nazwy zadania SLURM
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
                  Symulacja zostanie wykonana na klastrze z użyciem programu amumax z podanymi parametrami.
                </p>
              </div>
            </CardFooter>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
