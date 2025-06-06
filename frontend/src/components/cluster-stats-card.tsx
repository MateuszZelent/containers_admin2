"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
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
  BarChart3,
  Monitor
} from "lucide-react";
import { toast } from "sonner";

interface ClusterStatsCardProps {
  onRefresh?: () => void;
}

export function ClusterStatsCard({ onRefresh }: ClusterStatsCardProps) {
  const [stats, setStats] = useState<ClusterStats | null>(null);
  const [summary, setSummary] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const fetchStats = async () => {
    try {
      const [statsResponse, summaryResponse] = await Promise.all([
        clusterApi.getStats(),
        clusterApi.getSummary()
      ]);
      
      setStats(statsResponse.data);
      setSummary(summaryResponse.data);
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
      
      // Refresh summary after update
      const summaryResponse = await clusterApi.getSummary();
      setSummary(summaryResponse.data);
      
      if (onRefresh) {
        onRefresh();
      }
    } catch (error) {
      console.error("Error updating cluster stats:", error);
      toast.error("Failed to update cluster statistics");
    } finally {
      setIsUpdating(false);
    }
  };

  useEffect(() => {
    fetchStats();
    
    // Auto-refresh every 2 minutes
    const interval = setInterval(fetchStats, 2 * 60 * 1000);
    
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

  if (isLoading && !stats) {
    return (
      <Card className="bg-white/60 backdrop-blur-sm border-cyan-200/60 dark:bg-slate-800/60 dark:border-cyan-700/40">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <p className="text-sm font-medium text-cyan-700 dark:text-cyan-300 mb-2">Klaster PCSS</p>
              <div className="space-y-1">
                <div className="h-3 w-20 bg-cyan-200/50 dark:bg-cyan-700/50 rounded animate-pulse"></div>
                <div className="h-3 w-16 bg-cyan-200/50 dark:bg-cyan-700/50 rounded animate-pulse"></div>
              </div>
            </div>
            <Monitor className="h-8 w-8 text-cyan-400/50 dark:text-cyan-500/50" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-white/60 backdrop-blur-sm border-cyan-200/60 hover:bg-white/70 hover:border-cyan-300/70 transition-all duration-300 dark:bg-slate-800/60 dark:border-cyan-700/40 dark:hover:bg-slate-800/70 dark:hover:border-cyan-600/50">
  <CardContent className="p-4">
    <div className="flex items-start justify-between">
      {/* Lewa kolumna: tytuł + statystyki */}
      <div className="flex-1">
        <div className="mb-2">
          <p className="text-sm font-medium text-cyan-700 dark:text-cyan-300">Klaster PCSS</p>
        </div>
        <div className="text-lg font-bold text-cyan-900 dark:text-cyan-100">
          {isLoading ? (
            <div className="space-y-1">
              <div className="h-3 w-20 bg-cyan-200/50 dark:bg-cyan-700/50 rounded animate-pulse"></div>
              <div className="h-3 w-16 bg-cyan-200/50 dark:bg-cyan-700/50 rounded animate-pulse"></div>
            </div>
          ) : stats && summary?.status === "ok" ? (
            <div className="space-y-1">
              <div className="text-xs text-cyan-600 dark:text-cyan-400">
                Węzły: {summary.nodes.busy}/{summary.nodes.total}
                {summary.nodes.free > 0 && (
                  <span className="text-green-600 dark:text-green-400 ml-1">
                    ({summary.nodes.free} wolne)
                  </span>
                )}
              </div>
              <div className="text-xs text-cyan-600 dark:text-cyan-400">
                GPU: {summary.gpus.busy}/{summary.gpus.total}
                {summary.gpus.free > 0 && (
                  <span className="text-green-600 dark:text-green-400 ml-1">
                    ({summary.gpus.free} wolne)
                  </span>
                )}
              </div>
              {summary.nodes.unavailable > 0 && (
                <div className="text-xs text-red-600 dark:text-red-400">
                  Niedostępne: {summary.nodes.unavailable} węzłów
                </div>
              )}
            </div>
          ) : (
            <span className="text-xs text-gray-500 dark:text-gray-400">Brak danych</span>
          )}
        </div>
      </div>

      {/* Prawa kolumna: ikona + przycisk Details pod nią */}
      <div className="flex flex-col items-end gap-2">
        <Monitor
          className={`h-8 w-8 transition-colors duration-300 ${
            isLoading
              ? "text-cyan-400/50 dark:text-cyan-500/50"
              : "text-cyan-600 dark:text-cyan-400"
          }`}
        />
        <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
          <DialogTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-6 px-2 text-xs flex items-center gap-1 border-cyan-300/50 hover:border-cyan-400/70 text-cyan-600 hover:text-cyan-700 dark:border-cyan-600/50 dark:hover:border-cyan-500/70 dark:text-cyan-400 dark:hover:text-cyan-300"
            >
              <BarChart3 className="h-3 w-3" />
              Details
            </Button>
          </DialogTrigger>

          {/* Zawartość modala pozostaje bez zmian */}
          <DialogContent className="max-w-4xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                PCSS Cluster Statistics
              </DialogTitle>
              <DialogDescription>
                Real-time cluster utilization and resource availability
              </DialogDescription>
            </DialogHeader>

            {stats && summary?.status === "ok" ? (
              <div className="space-y-6">
                {/* Update Button wewnątrz modala */}
                <div className="flex justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleForceUpdate}
                    disabled={isUpdating}
                    className="flex items-center gap-2"
                  >
                    <RefreshCcw
                      className={`h-4 w-4 ${
                        isUpdating ? "animate-spin" : ""
                      }`}
                    />
                    {isUpdating ? "Updating..." : "Update"}
                  </Button>
                </div>

                {/* Szczegółowe statystyki węzłów */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Server className="h-5 w-5" />
                    <h4 className="text-lg font-semibold">Compute Nodes</h4>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 border border-green-200 dark:border-green-800">
                      <div className="text-2xl font-bold text-green-700 dark:text-green-400">
                        {summary.nodes.free}
                      </div>
                      <div className="text-sm text-green-600 dark:text-green-500">
                        Free Nodes
                      </div>
                    </div>
                    <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
                      <div className="text-2xl font-bold text-blue-700 dark:text-blue-400">
                        {summary.nodes.busy}
                      </div>
                      <div className="text-sm text-blue-600 dark:text-blue-500">
                        Busy Nodes
                      </div>
                    </div>
                    <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-4 border border-red-200 dark:border-red-800">
                      <div className="text-2xl font-bold text-red-700 dark:text-red-400">
                        {summary.nodes.unavailable}
                      </div>
                      <div className="text-sm text-red-600 dark:text-red-500">
                        Unavailable
                      </div>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 border">
                      <div className="text-2xl font-bold">
                        {summary.nodes.total}
                      </div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        Total Nodes
                      </div>
                    </div>
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                    <div
                      className={`text-xl font-bold ${getUtilizationColor(
                        summary.nodes.utilization_percent
                      )}`}
                    >
                      {summary.nodes.utilization_percent}% Utilization
                    </div>
                    <Badge
                      variant={getUtilizationBadge(
                        summary.nodes.utilization_percent
                      )}
                      className="mt-2"
                    >
                      {summary.nodes.utilization_percent >= 80
                        ? "High Load"
                        : summary.nodes.utilization_percent >= 60
                        ? "Medium Load"
                        : "Low Load"}
                    </Badge>
                  </div>
                </div>

                {/* Szczegółowe statystyki GPU */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Cpu className="h-5 w-5" />
                    <h4 className="text-lg font-semibold">GPU Resources</h4>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 border border-green-200 dark:border-green-800">
                      <div className="text-2xl font-bold text-green-700 dark:text-green-400">
                        {summary.gpus.free}
                      </div>
                      <div className="text-sm text-green-600 dark:text-green-500">
                        Free GPUs
                      </div>
                    </div>
                    <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
                      <div className="text-2xl font-bold text-blue-700 dark:text-blue-400">
                        {summary.gpus.active}
                      </div>
                      <div className="text-sm text-blue-600 dark:text-blue-500">
                        Active GPUs
                      </div>
                    </div>
                    <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-4 border border-yellow-200 dark:border-yellow-800">
                      <div className="text-2xl font-bold text-yellow-700 dark:text-yellow-400">
                        {summary.gpus.standby}
                      </div>
                      <div className="text-sm text-yellow-600 dark:text-yellow-500">
                        Standby GPUs
                      </div>
                    </div>
                    <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-4 border border-orange-200 dark:border-orange-800">
                      <div className="text-2xl font-bold text-orange-700 dark:text-orange-400">
                        {summary.gpus.busy}
                      </div>
                      <div className="text-sm text-orange-600 dark:text-orange-500">
                        Busy GPUs
                      </div>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 border">
                      <div className="text-2xl font-bold">
                        {summary.gpus.total}
                      </div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        Total GPUs
                      </div>
                    </div>
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                    <div
                      className={`text-xl font-bold ${getUtilizationColor(
                        summary.gpus.utilization_percent
                      )}`}
                    >
                      {summary.gpus.utilization_percent}% Utilization
                    </div>
                    <Badge
                      variant={getUtilizationBadge(
                        summary.gpus.utilization_percent
                      )}
                      className="mt-2"
                    >
                      {summary.gpus.utilization_percent >= 80
                        ? "High Load"
                        : summary.gpus.utilization_percent >= 60
                        ? "Medium Load"
                        : "Low Load"}
                    </Badge>
                  </div>
                </div>

                {/* Status i Timestamp */}
                <div className="flex items-center justify-between pt-4 border-t">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <span className="text-sm text-green-600 font-medium">
                      Cluster Online
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Calendar className="h-4 w-4" />
                    <span>
                      Last updated:{" "}
                      {new Date(summary.timestamp).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            ) : summary?.status === "error" ? (
              <div className="flex items-center justify-center py-8">
                <div className="text-center">
                  <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-red-700 mb-2">
                    Error Loading Statistics
                  </h3>
                  <p className="text-red-600">{summary.message}</p>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center py-8">
                <RefreshCcw className="h-6 w-6 animate-spin mr-2" />
                <span>Loading detailed statistics...</span>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  </CardContent>
</Card>
  );
}
