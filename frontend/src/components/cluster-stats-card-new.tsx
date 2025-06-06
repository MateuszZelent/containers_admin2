"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  BarChart3
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
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            PCSS Cluster
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <RefreshCcw className="h-6 w-6 animate-spin" />
            <span className="ml-2">Loading cluster statistics...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            <CardTitle>PCSS Cluster</CardTitle>
          </div>
          <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="flex items-center gap-2"
              >
                <BarChart3 className="h-4 w-4" />
                Details
              </Button>
            </DialogTrigger>
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
              
              {stats && summary?.status === 'ok' ? (
                <div className="space-y-6">
                  {/* Update Button in Modal */}
                  <div className="flex justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleForceUpdate}
                      disabled={isUpdating}
                      className="flex items-center gap-2"
                    >
                      <RefreshCcw className={`h-4 w-4 ${isUpdating ? 'animate-spin' : ''}`} />
                      {isUpdating ? 'Updating...' : 'Update'}
                    </Button>
                  </div>

                  {/* Detailed Node Stats */}
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
                        <div className="text-sm text-green-600 dark:text-green-500">Free Nodes</div>
                      </div>
                      <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
                        <div className="text-2xl font-bold text-blue-700 dark:text-blue-400">
                          {summary.nodes.busy}
                        </div>
                        <div className="text-sm text-blue-600 dark:text-blue-500">Busy Nodes</div>
                      </div>
                      <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-4 border border-red-200 dark:border-red-800">
                        <div className="text-2xl font-bold text-red-700 dark:text-red-400">
                          {summary.nodes.unavailable}
                        </div>
                        <div className="text-sm text-red-600 dark:text-red-500">Unavailable</div>
                      </div>
                      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 border">
                        <div className="text-2xl font-bold">
                          {summary.nodes.total}
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">Total Nodes</div>
                      </div>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                      <div className={`text-xl font-bold ${getUtilizationColor(summary.nodes.utilization_percent)}`}>
                        {summary.nodes.utilization_percent}% Utilization
                      </div>
                      <Badge variant={getUtilizationBadge(summary.nodes.utilization_percent)} className="mt-2">
                        {summary.nodes.utilization_percent >= 80 ? 'High Load' : 
                         summary.nodes.utilization_percent >= 60 ? 'Medium Load' : 'Low Load'}
                      </Badge>
                    </div>
                  </div>

                  {/* Detailed GPU Stats */}
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
                        <div className="text-sm text-green-600 dark:text-green-500">Free GPUs</div>
                      </div>
                      <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
                        <div className="text-2xl font-bold text-blue-700 dark:text-blue-400">
                          {summary.gpus.active}
                        </div>
                        <div className="text-sm text-blue-600 dark:text-blue-500">Active GPUs</div>
                      </div>
                      <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-4 border border-yellow-200 dark:border-yellow-800">
                        <div className="text-2xl font-bold text-yellow-700 dark:text-yellow-400">
                          {summary.gpus.standby}
                        </div>
                        <div className="text-sm text-yellow-600 dark:text-yellow-500">Standby GPUs</div>
                      </div>
                      <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-4 border border-orange-200 dark:border-orange-800">
                        <div className="text-2xl font-bold text-orange-700 dark:text-orange-400">
                          {summary.gpus.busy}
                        </div>
                        <div className="text-sm text-orange-600 dark:text-orange-500">Busy GPUs</div>
                      </div>
                      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 border">
                        <div className="text-2xl font-bold">
                          {summary.gpus.total}
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">Total GPUs</div>
                      </div>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                      <div className={`text-xl font-bold ${getUtilizationColor(summary.gpus.utilization_percent)}`}>
                        {summary.gpus.utilization_percent}% Utilization
                      </div>
                      <Badge variant={getUtilizationBadge(summary.gpus.utilization_percent)} className="mt-2">
                        {summary.gpus.utilization_percent >= 80 ? 'High Load' : 
                         summary.gpus.utilization_percent >= 60 ? 'Medium Load' : 'Low Load'}
                      </Badge>
                    </div>
                  </div>

                  {/* Status and Timestamp */}
                  <div className="flex items-center justify-between pt-4 border-t">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                      <span className="text-sm text-green-600 font-medium">Cluster Online</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <Calendar className="h-4 w-4" />
                      <span>
                        Last updated: {new Date(summary.timestamp).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              ) : summary?.status === 'error' ? (
                <div className="flex items-center justify-center py-8">
                  <div className="text-center">
                    <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-red-700 mb-2">Error Loading Statistics</h3>
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
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            <div className="h-4 w-32 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
            <div className="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
          </div>
        ) : stats && summary?.status === 'ok' ? (
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600 dark:text-gray-400">Nodes:</span>
              <span className="font-medium">
                {summary.nodes.busy}/{summary.nodes.total} busy
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600 dark:text-gray-400">GPUs:</span>
              <span className="font-medium">
                {summary.gpus.busy}/{summary.gpus.total} busy
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600 dark:text-gray-400">Load:</span>
              <Badge variant={getUtilizationBadge(summary.nodes.utilization_percent)} className="text-xs">
                {summary.nodes.utilization_percent}%
              </Badge>
            </div>
          </div>
        ) : (
          <div className="flex items-center text-red-600 dark:text-red-400">
            <AlertCircle className="h-4 w-4 mr-2" />
            <span className="text-sm">Connection Error</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
