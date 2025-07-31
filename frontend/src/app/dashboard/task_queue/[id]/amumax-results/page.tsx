"use client";

import { useState, useEffect } from "react";
import { use } from "react";
import { toast } from "sonner";
import { Loader2, ArrowLeft, Download, FileText, Database, Image } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { taskQueueApi } from "@/lib/api-client";

interface AmumaxResults {
  task_id: string;
  status: string;
  simulation_type: string;
  mx3_file: string;
  started_at?: string;
  finished_at?: string;
  elapsed_time?: number;
  output_dir?: string;
  
  // Amumax-specific files
  table_files?: string[];
  ovf_files?: string[];
  zarr_files?: string[];
  log_files?: string[];
  energy_files?: string[];
  field_files?: string[];
  
  // Parsed data
  main_table_data?: {
    total_steps: number;
    columns: string[];
    time_range?: {
      start: number;
      end: number;
    };
    final_values: Record<string, any>;
  };
  
  // Error information
  error_message?: string;
  exit_code?: number;
}

export default function AmumaxResultsPage({ 
  params 
}: { 
  params: Promise<{ id: string }> 
}) {
  const unwrappedParams = use(params);
  const router = useRouter();
  const taskId = parseInt(unwrappedParams.id);
  
  const [results, setResults] = useState<AmumaxResults | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch Amumax results
  useEffect(() => {
    const fetchResults = async () => {
      setIsLoading(true);
      try {
        const response = await taskQueueApi.getAmumaxResults(taskId);
        setResults(response.data);
      } catch (error: any) {
        const errorMessage = error.response?.data?.detail || "Nie udało się pobrać wyników";
        toast.error(errorMessage);
        console.error("Error fetching Amumax results:", error);
      } finally {
        setIsLoading(false);
      }
    };

    if (taskId) {
      fetchResults();
    }
  }, [taskId]);

  // Format file size
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  // Format duration
  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${hours}h ${minutes}m ${secs}s`;
  };

  // Format number with precision
  const formatNumber = (value: any) => {
    if (typeof value === 'number') {
      if (Math.abs(value) > 1000 || Math.abs(value) < 0.01) {
        return value.toExponential(3);
      }
      return value.toFixed(3);
    }
    return String(value);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!results) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="outline" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Powrót
          </Button>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center justify-center p-8">
            <p className="text-lg font-semibold">Nie znaleziono wyników</p>
            <p className="text-muted-foreground">
              Nie udało się pobrać wyników dla tego zadania.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="outline" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Powrót
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Wyniki Amumax
          </h1>
          <p className="text-muted-foreground">
            Zadanie ID: {results.task_id}
          </p>
        </div>
        <Badge variant={results.status === "COMPLETED" ? "success" : "destructive"}>
          {results.status}
        </Badge>
      </div>

      {/* Summary Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Podsumowanie symulacji
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Plik symulacji</p>
            <p className="text-sm font-mono">{results.mx3_file.split('/').pop()}</p>
          </div>
          {results.started_at && (
            <div>
              <p className="text-sm font-medium text-muted-foreground">Rozpoczęto</p>
              <p className="text-sm">{new Date(results.started_at).toLocaleString("pl-PL")}</p>
            </div>
          )}
          {results.finished_at && (
            <div>
              <p className="text-sm font-medium text-muted-foreground">Zakończono</p>
              <p className="text-sm">{new Date(results.finished_at).toLocaleString("pl-PL")}</p>
            </div>
          )}
          {results.elapsed_time && (
            <div>
              <p className="text-sm font-medium text-muted-foreground">Czas wykonania</p>
              <p className="text-sm">{formatDuration(results.elapsed_time)}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Error Message */}
      {results.error_message && (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">Błąd wykonania</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{results.error_message}</p>
            {results.exit_code !== undefined && (
              <p className="text-sm text-muted-foreground mt-2">
                Kod wyjścia: {results.exit_code}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Results Tabs */}
      <Tabs defaultValue="files" className="space-y-4">
        <TabsList>
          <TabsTrigger value="files">Pliki wynikowe</TabsTrigger>
          {results.main_table_data && (
            <TabsTrigger value="table-data">Dane tabelaryczne</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="files" className="space-y-4">
          <div className="grid gap-4">
            {/* Table Files */}
            {results.table_files && results.table_files.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Database className="h-5 w-5" />
                    Pliki tabelaryczne ({results.table_files.length})
                  </CardTitle>
                  <CardDescription>
                    Pliki zawierające dane skalarne z symulacji
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {results.table_files.map((file, index) => (
                      <div key={index} className="flex items-center justify-between p-2 rounded border">
                        <span className="text-sm font-mono">{file.split('/').pop()}</span>
                        <Button variant="outline" size="sm">
                          <Download className="h-3 w-3 mr-1" />
                          Pobierz
                        </Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* OVF Files */}
            {results.ovf_files && results.ovf_files.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Image className="h-5 w-5" />
                    Pliki OVF ({results.ovf_files.length})
                  </CardTitle>
                  <CardDescription>
                    Pliki z danymi magnetyzacji w formacie OVF
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {results.ovf_files.map((file, index) => (
                      <div key={index} className="flex items-center justify-between p-2 rounded border">
                        <span className="text-sm font-mono">{file.split('/').pop()}</span>
                        <Button variant="outline" size="sm">
                          <Download className="h-3 w-3 mr-1" />
                          Pobierz
                        </Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Other file types */}
            {results.zarr_files && results.zarr_files.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Pliki Zarr ({results.zarr_files.length})</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {results.zarr_files.map((file, index) => (
                      <div key={index} className="flex items-center justify-between p-2 rounded border">
                        <span className="text-sm font-mono">{file.split('/').pop()}</span>
                        <Button variant="outline" size="sm">
                          <Download className="h-3 w-3 mr-1" />
                          Pobierz
                        </Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Log Files */}
            {results.log_files && results.log_files.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Pliki logów ({results.log_files.length})</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {results.log_files.map((file, index) => (
                      <div key={index} className="flex items-center justify-between p-2 rounded border">
                        <span className="text-sm font-mono">{file.split('/').pop()}</span>
                        <Button variant="outline" size="sm">
                          <Download className="h-3 w-3 mr-1" />
                          Pobierz
                        </Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {results.main_table_data && (
          <TabsContent value="table-data" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Analiza danych tabelarycznych</CardTitle>
                <CardDescription>
                  Podsumowanie głównego pliku z danymi skalarnymi
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Liczba kroków</p>
                    <p className="text-2xl font-bold">{results.main_table_data.total_steps}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Liczba kolumn</p>
                    <p className="text-2xl font-bold">{results.main_table_data.columns.length}</p>
                  </div>
                  {results.main_table_data.time_range && (
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Zakres czasu</p>
                      <p className="text-sm">
                        {formatNumber(results.main_table_data.time_range.start)} - {formatNumber(results.main_table_data.time_range.end)}
                      </p>
                    </div>
                  )}
                </div>

                <Separator />

                <div>
                  <h4 className="text-sm font-medium mb-2">Kolumny danych</h4>
                  <div className="flex flex-wrap gap-2">
                    {results.main_table_data.columns.map((column, index) => (
                      <Badge key={index} variant="outline">
                        {column}
                      </Badge>
                    ))}
                  </div>
                </div>

                <Separator />

                <div>
                  <h4 className="text-sm font-medium mb-2">Wartości końcowe</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {Object.entries(results.main_table_data.final_values).map(([key, value]) => (
                      <div key={key} className="p-3 rounded border">
                        <p className="text-sm font-medium text-muted-foreground">{key}</p>
                        <p className="text-sm font-mono">{formatNumber(value)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
