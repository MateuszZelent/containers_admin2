"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { clusterApi } from "@/lib/api-client";
import { ClusterStats } from "@/lib/types";
import { 
  Server, 
  Cpu, 
  RefreshCcw, 
  AlertCircle, 
  CheckCircle2,
  Activity,
  Calendar
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

  if (isLoading && !stats) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Cluster Statistics
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

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            <CardTitle>PCSS Cluster Statistics</CardTitle>
          </div>
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
        <CardDescription>
          Real-time cluster utilization and resource availability
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {stats && summary?.status === 'ok' ? (
          <>
            {/* Nodes Section */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Server className="h-4 w-4" />
                <h4 className="font-medium">Compute Nodes</h4>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="text-2xl font-bold">
                    {summary.nodes.used}/{summary.nodes.total}
                  </div>
                  <div className="text-sm text-gray-600">Used / Total</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className={`text-2xl font-bold ${getUtilizationColor(summary.nodes.utilization_percent)}`}>
                    {summary.nodes.utilization_percent}%
                  </div>
                  <div className="text-sm text-gray-600">Utilization</div>
                  <Badge variant={getUtilizationBadge(summary.nodes.utilization_percent)} className="mt-1">
                    {summary.nodes.utilization_percent >= 80 ? 'High' : 
                     summary.nodes.utilization_percent >= 60 ? 'Medium' : 'Low'}
                  </Badge>
                </div>
              </div>
            </div>

            {/* GPU Section */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Cpu className="h-4 w-4" />
                <h4 className="font-medium">GPU Resources</h4>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="text-2xl font-bold">
                    {summary.gpus.used}/{summary.gpus.total}
                  </div>
                  <div className="text-sm text-gray-600">Used / Total</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className={`text-2xl font-bold ${getUtilizationColor(summary.gpus.utilization_percent)}`}>
                    {summary.gpus.utilization_percent}%
                  </div>
                  <div className="text-sm text-gray-600">Utilization</div>
                  <Badge variant={getUtilizationBadge(summary.gpus.utilization_percent)} className="mt-1">
                    {summary.gpus.utilization_percent >= 80 ? 'High' : 
                     summary.gpus.utilization_percent >= 60 ? 'Medium' : 'Low'}
                  </Badge>
                </div>
              </div>
            </div>

            {/* Status and Timestamp */}
            <div className="flex items-center justify-between pt-4 border-t">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <span className="text-sm text-green-600 font-medium">Online</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Calendar className="h-4 w-4" />
                <span>
                  Last updated: {new Date(summary.timestamp).toLocaleString()}
                </span>
              </div>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center py-8">
            <div className="text-center">
              <AlertCircle className="h-8 w-8 text-yellow-600 mx-auto mb-2" />
              <p className="text-gray-600">
                {summary?.status === 'no_data' 
                  ? 'No cluster statistics available' 
                  : 'Failed to load cluster statistics'}
              </p>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleForceUpdate}
                className="mt-2"
                disabled={isUpdating}
              >
                <RefreshCcw className={`h-4 w-4 mr-2 ${isUpdating ? 'animate-spin' : ''}`} />
                Try Again
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
