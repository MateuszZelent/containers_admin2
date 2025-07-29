"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { clusterApi } from "@/lib/api-client";
import { ClusterStats } from "@/lib/types";
import { 
  Server, 
  Cpu, 
  RefreshCcw, 
  AlertCircle, 
  CheckCircle2,
  Activity,
  Calendar,
  ArrowLeft,
  Monitor,
  Gauge,
  Clock,
  BarChart3
} from "lucide-react";
import { toast } from "sonner";

export default function ClusterStatsPage() {
  const router = useRouter();
  const [stats, setStats] = useState<ClusterStats | null>(null);
  const [summary, setSummary] = useState<any>(null);
  const [history, setHistory] = useState<ClusterStats[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);

  const fetchStats = async () => {
    try {
      const [statsResponse, summaryResponse, historyResponse] = await Promise.all([
        clusterApi.getStats(),
        clusterApi.getSummary(),
        clusterApi.getStatsHistory(10)
      ]);
      
      setStats(statsResponse.data);
      setSummary(summaryResponse.data);
      setHistory(historyResponse.data);
    } catch (error) {
      console.error("Error fetching cluster stats:", error);
      toast.error("Failed to fetch cluster statistics");
    } finally {
      setIsLoading(false);
    }
  };

  const handleForceUpdate = async () => {
    setIsUpdating(true);
    try {
      const response = await clusterApi.updateStats();
      setStats(response.data);
      toast.success("Cluster statistics updated successfully");
      
      // Refresh summary and history after update
      const [summaryResponse, historyResponse] = await Promise.all([
        clusterApi.getSummary(),
        clusterApi.getStatsHistory(10)
      ]);
      setSummary(summaryResponse.data);
      setHistory(historyResponse.data);
    } catch (error) {
      console.error("Error updating cluster stats:", error);
      toast.error("Failed to update cluster statistics");
    } finally {
      setIsUpdating(false);
    }
  };

  useEffect(() => {
    fetchStats();
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchStats, 30 * 1000);
    
    return () => clearInterval(interval);
  }, []);

  const getUtilizationColor = (percentage: number) => {
    if (percentage >= 80) return "text-red-600";
    if (percentage >= 60) return "text-yellow-600";
    return "text-green-600";
  };

  const getUtilizationBadge = (percentage: number) => {
    if (percentage >= 80) return "destructive";
    if (percentage >= 60) return "secondary";
    return "default";
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center min-h-96">
          <div className="flex items-center gap-3">
            <Activity className="h-6 w-6 animate-pulse" />
            <span className="text-lg">Loading cluster statistics...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => router.back()}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Powrót
          </Button>
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <Monitor className="h-8 w-8 text-cyan-600" />
              Statystyki Klastra PCSS
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Szczegółowe informacje o wykorzystaniu zasobów klastra
            </p>
          </div>
        </div>
        
        <Button
          onClick={handleForceUpdate}
          disabled={isUpdating}
          className="flex items-center gap-2"
        >
          <RefreshCcw className={`h-4 w-4 ${isUpdating ? 'animate-spin' : ''}`} />
          {isUpdating ? 'Aktualizacja...' : 'Odśwież'}
        </Button>
      </div>

      {stats && summary?.status === 'ok' ? (
        <div className="grid gap-6">
          {/* Status Overview */}
          <div className="grid md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  Status Klastra
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">Online</div>
                <div className="text-sm text-gray-600">
                  Klaster jest aktywny i dostępny
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Ostatnia Aktualizacja
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-lg font-semibold">
                  {new Date(summary.timestamp).toLocaleString('pl-PL')}
                </div>
                <div className="text-sm text-gray-600">
                  Źródło: {stats.source || 'system'}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  Ogólne Wykorzystanie
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm">Węzły:</span>
                    <span className={`font-semibold ${getUtilizationColor(summary.nodes.utilization_percent)}`}>
                      {summary.nodes.utilization_percent}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">GPU:</span>
                    <span className={`font-semibold ${getUtilizationColor(summary.gpus.utilization_percent)}`}>
                      {summary.gpus.utilization_percent}%
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Detailed Stats */}
          <div className="grid md:grid-cols-2 gap-6">
            {/* Nodes Section */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Server className="h-5 w-5" />
                  Węzły Obliczeniowe
                </CardTitle>
                <CardDescription>
                  Szczegółowe informacje o węzłach klastra
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
                    <div className="text-2xl font-bold text-green-600">
                      {summary.nodes.free}
                    </div>
                    <div className="text-sm text-green-700 dark:text-green-400">
                      Wolne węzły
                    </div>
                  </div>
                  <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
                    <div className="text-2xl font-bold text-blue-600">
                      {summary.nodes.busy}
                    </div>
                    <div className="text-sm text-blue-700 dark:text-blue-400">
                      Zajęte węzły
                    </div>
                  </div>
                  <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-4">
                    <div className="text-2xl font-bold text-orange-600">
                      {summary.nodes.sleeping}
                    </div>
                    <div className="text-sm text-orange-700 dark:text-orange-400">
                      Śpiące węzły
                    </div>
                  </div>
                  <div className="bg-cyan-50 dark:bg-cyan-900/20 rounded-lg p-4">
                    <div className="text-2xl font-bold text-cyan-600">
                      {summary.nodes.available}
                    </div>
                    <div className="text-sm text-cyan-700 dark:text-cyan-400">
                      Dostępne węzły
                    </div>
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                    <div className="text-2xl font-bold text-gray-600">
                      {summary.nodes.total}
                    </div>
                    <div className="text-sm text-gray-700 dark:text-gray-400">
                      Wszystkie węzły
                    </div>
                  </div>
                </div>
                
                <Separator />
                
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Wykorzystanie węzłów</span>
                  <div className="flex items-center gap-2">
                    <span className={`text-lg font-bold ${getUtilizationColor(summary.nodes.utilization_percent)}`}>
                      {summary.nodes.utilization_percent}%
                    </span>
                    <Badge variant={getUtilizationBadge(summary.nodes.utilization_percent)}>
                      {summary.nodes.utilization_percent >= 80 ? 'Wysokie' : 
                       summary.nodes.utilization_percent >= 60 ? 'Średnie' : 'Niskie'}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* GPU Section */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Cpu className="h-5 w-5" />
                  Zasoby GPU
                </CardTitle>
                <CardDescription>
                  Stan wszystkich procesorów graficznych
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
                    <div className="text-2xl font-bold text-green-600">
                      {summary.gpus.free}
                    </div>
                    <div className="text-sm text-green-700 dark:text-green-400">
                      Wolne GPU
                    </div>
                  </div>
                  <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-4">
                    <div className="text-2xl font-bold text-yellow-600">
                      {summary.gpus.active}
                    </div>
                    <div className="text-sm text-yellow-700 dark:text-yellow-400">
                      Aktywne GPU
                    </div>
                  </div>
                  <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4">
                    <div className="text-2xl font-bold text-purple-600">
                      {summary.gpus.standby}
                    </div>
                    <div className="text-sm text-purple-700 dark:text-purple-400">
                      Standby GPU
                    </div>
                  </div>
                  <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
                    <div className="text-2xl font-bold text-blue-600">
                      {summary.gpus.busy}
                    </div>
                    <div className="text-sm text-blue-700 dark:text-blue-400">
                      Zajęte GPU
                    </div>
                  </div>
                  <div className="bg-cyan-50 dark:bg-cyan-900/20 rounded-lg p-4">
                    <div className="text-2xl font-bold text-cyan-600">
                      {summary.gpus.available}
                    </div>
                    <div className="text-sm text-cyan-700 dark:text-cyan-400">
                      Dostępne GPU
                    </div>
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                    <div className="text-2xl font-bold text-gray-600">
                      {summary.gpus.total}
                    </div>
                    <div className="text-sm text-gray-700 dark:text-gray-400">
                      Wszystkie GPU
                    </div>
                  </div>
                </div>
                
                <Separator />
                
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Wykorzystanie GPU</span>
                  <div className="flex items-center gap-2">
                    <span className={`text-lg font-bold ${getUtilizationColor(summary.gpus.utilization_percent)}`}>
                      {summary.gpus.utilization_percent}%
                    </span>
                    <Badge variant={getUtilizationBadge(summary.gpus.utilization_percent)}>
                      {summary.gpus.utilization_percent >= 80 ? 'Wysokie' : 
                       summary.gpus.utilization_percent >= 60 ? 'Średnie' : 'Niskie'}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Recent History */}
          {history.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Historia Ostatnich Aktualizacji
                </CardTitle>
                <CardDescription>
                  Ostatnie 10 pomiarów statystyk klastra
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {history.map((stat, index) => (
                    <div key={stat.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                      <div className="flex items-center gap-4">
                        <div className="text-sm text-gray-500">
                          #{history.length - index}
                        </div>
                        <div className="text-sm">
                          {new Date(stat.timestamp).toLocaleString('pl-PL')}
                        </div>
                      </div>
                      <div className="flex items-center gap-6 text-sm">
                        <div className="flex items-center gap-2">
                          <Server className="h-4 w-4 text-gray-400" />
                          <span>Węzły: {stat.busy_nodes || stat.used_nodes}/{stat.total_nodes}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Cpu className="h-4 w-4 text-gray-400" />
                          <span>GPU: {stat.busy_gpus || stat.used_gpus}/{stat.total_gpus}</span>
                        </div>
                        {stat.source && (
                          <Badge variant="outline" className="text-xs">
                            {stat.source}
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      ) : (
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <div className="text-center space-y-3">
              <AlertCircle className="h-12 w-12 text-red-500 mx-auto" />
              <h3 className="text-lg font-semibold">Brak danych o klastrze</h3>
              <p className="text-gray-600 dark:text-gray-400">
                Nie udało się pobrać aktualnych statystyk klastra
              </p>
              <Button onClick={fetchStats} className="mt-4">
                Spróbuj ponownie
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
