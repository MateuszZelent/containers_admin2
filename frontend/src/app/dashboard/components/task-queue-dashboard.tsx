"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Clock,
  Search,
  Filter,
  RefreshCcw,
  Plus,
  Play,
  Pause,
  Square,
  Trash2,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Loader2,
  Server,
  Cpu,
  HardDrive,
  Zap,
  Calendar,
  Timer,
  Activity,
  Eye,
  Download,
  FileText,
  Settings,
  MoreHorizontal,
} from "lucide-react";
import { tasksApi } from "@/lib/api-client";
import { toast } from "sonner";

// Types
interface TaskQueueJob {
  id: number;
  task_id: string;
  slurm_job_id: string | null;
  name: string;
  status: string;
  simulation_file: string;
  partition: string;
  num_cpus: number;
  memory_gb: number;
  num_gpus: number;
  time_limit: string;
  node: string | null;
  progress: number;
  created_at: string;
  queued_at: string;
  submitted_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  owner_id: number;
  error_message: string | null;
  logs: string | null;
}

interface TaskQueueStats {
  total_tasks: number;
  status_counts: Record<string, number>;
  avg_wait_time: number | null;
  next_task: TaskQueueJob | null;
  queue_health: "healthy" | "warning" | "critical";
}

// Status configurations
const STATUS_CONFIG = {
  PENDING: {
    color: "bg-yellow-500",
    textColor: "text-yellow-600",
    bgColor: "bg-yellow-50",
    label: "Pending",
    icon: Clock,
    description: "Waiting in queue"
  },
  CONFIGURING: {
    color: "bg-blue-500",
    textColor: "text-blue-600", 
    bgColor: "bg-blue-50",
    label: "Configuring",
    icon: Settings,
    description: "Being configured"
  },
  RUNNING: {
    color: "bg-green-500",
    textColor: "text-green-600",
    bgColor: "bg-green-50", 
    label: "Running",
    icon: Play,
    description: "Currently executing"
  },
  COMPLETED: {
    color: "bg-emerald-500",
    textColor: "text-emerald-600",
    bgColor: "bg-emerald-50",
    label: "Completed",
    icon: CheckCircle2,
    description: "Successfully finished"
  },
  ERROR: {
    color: "bg-red-500",
    textColor: "text-red-600",
    bgColor: "bg-red-50",
    label: "Error",
    icon: XCircle,
    description: "Failed with error"
  },
  CANCELLED: {
    color: "bg-gray-500",
    textColor: "text-gray-600",
    bgColor: "bg-gray-50",
    label: "Cancelled",
    icon: Square,
    description: "Cancelled by user"
  },
  TIMEOUT: {
    color: "bg-orange-500",
    textColor: "text-orange-600",
    bgColor: "bg-orange-50",
    label: "Timeout",
    icon: Timer,
    description: "Exceeded time limit"
  },
  UNKNOWN: {
    color: "bg-gray-400",
    textColor: "text-gray-500",
    bgColor: "bg-gray-25",
    label: "Unknown",
    icon: AlertCircle,
    description: "Unknown status"
  }
} as const;

// Task type categories
const TASK_CATEGORIES = {
  simulation: {
    label: "Simulations",
    description: "Physics and computational simulations",
    icon: Activity,
    color: "text-blue-600",
    filters: ["amumax", "mumax", "simulation", ".mx3"]
  },
  computation: {
    label: "Computations", 
    description: "General computational tasks",
    icon: Cpu,
    color: "text-purple-600",
    filters: ["compute", "calculation", "analysis"]
  },
  other: {
    label: "Other",
    description: "Other task types",
    icon: Server,
    color: "text-gray-600",
    filters: []
  }
} as const;

// Helper function to categorize tasks
const getTaskCategory = (task: TaskQueueJob): keyof typeof TASK_CATEGORIES => {
  const filename = task.simulation_file.toLowerCase();
  const taskName = task.name.toLowerCase();
  
  for (const [category, config] of Object.entries(TASK_CATEGORIES)) {
    if (config.filters.some(filter => 
      filename.includes(filter) || taskName.includes(filter)
    )) {
      return category as keyof typeof TASK_CATEGORIES;
    }
  }
  return "other";
};

export function TaskQueueDashboard() {
  // State
  const [tasks, setTasks] = useState<TaskQueueJob[]>([]);
  const [stats, setStats] = useState<TaskQueueStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Filters and search
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("created_at");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  
  // UI state
  const [selectedTasks, setSelectedTasks] = useState<Set<number>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<TaskQueueJob | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [selectedTask, setSelectedTask] = useState<TaskQueueJob | null>(null);
  const [taskDetailsOpen, setTaskDetailsOpen] = useState(false);
  const [refreshingDetails, setRefreshingDetails] = useState(false);

  // Utility functions
  const formatTime = (timestamp: string | null) => {
    if (!timestamp) return "N/A";
    return new Date(timestamp).toLocaleString();
  };

  const formatDuration = (start: string | null, end: string | null) => {
    if (!start) return "N/A";
    const startTime = new Date(start);
    const endTime = end ? new Date(end) : new Date();
    const diff = endTime.getTime() - startTime.getTime();
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  // Data fetching
  const fetchTasks = useCallback(async () => {
    try {
      const response = await tasksApi.getTasks();
      setTasks(response.data);
    } catch (error) {
      toast.error("Failed to fetch tasks");
      console.error("Error fetching tasks:", error);
    }
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const response = await tasksApi.getQueueStatus();
      setStats(response.data);
    } catch (error) {
      toast.error("Failed to fetch queue status");
      console.error("Error fetching stats:", error);
    }
  }, []);

  const refreshData = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([fetchTasks(), fetchStats()]);
    } finally {
      setRefreshing(false);
    }
  }, [fetchTasks, fetchStats]);

  // Initial data load
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await refreshData();
      setLoading(false);
    };
    loadData();
  }, [refreshData]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(refreshData, 30000);
    return () => clearInterval(interval);
  }, [refreshData]);

  // Filtered and sorted tasks
  const filteredTasks = useMemo(() => {
    let filtered = tasks.filter(task => {
      // Search filter
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        if (!(
          task.name.toLowerCase().includes(search) ||
          task.simulation_file.toLowerCase().includes(search) ||
          task.slurm_job_id?.includes(search) ||
          task.node?.toLowerCase().includes(search)
        )) {
          return false;
        }
      }

      // Status filter
      if (statusFilter !== "all" && task.status !== statusFilter) {
        return false;
      }

      // Category filter
      if (categoryFilter !== "all") {
        const category = getTaskCategory(task);
        if (category !== categoryFilter) {
          return false;
        }
      }

      return true;
    });

    // Sort
    filtered.sort((a, b) => {
      let aVal: any = a[sortBy as keyof TaskQueueJob];
      let bVal: any = b[sortBy as keyof TaskQueueJob];

      if (sortBy === "created_at" || sortBy === "started_at" || sortBy === "finished_at") {
        aVal = aVal ? new Date(aVal).getTime() : 0;
        bVal = bVal ? new Date(bVal).getTime() : 0;
      }

      if (typeof aVal === "string") {
        aVal = aVal.toLowerCase();
        bVal = bVal.toLowerCase();
      }

      const result = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return sortOrder === "desc" ? -result : result;
    });

    return filtered;
  }, [tasks, searchTerm, statusFilter, categoryFilter, sortBy, sortOrder]);

  // Task operations
  const deleteTask = async (task: TaskQueueJob) => {
    try {
      await tasksApi.deleteTask(task.id);
      toast.success(`Task "${task.name}" deleted successfully`);
      await refreshData();
    } catch (error) {
      toast.error("Failed to delete task");
      console.error("Error deleting task:", error);
    }
  };

  const cancelTask = async (task: TaskQueueJob) => {
    try {
      await tasksApi.cancelTask(task.task_id);
      toast.success(`Task "${task.name}" cancelled successfully`);
      await refreshData();
    } catch (error) {
      toast.error("Failed to cancel task");
      console.error("Error cancelling task:", error);
    }
  };

  // View task details
  const viewTaskDetails = (task: TaskQueueJob) => {
    setSelectedTask(task);
    setTaskDetailsOpen(true);
  };

  // Refresh task details from SLURM
  const refreshTaskDetails = async (task: TaskQueueJob) => {
    if (!task.slurm_job_id) {
      toast.error("Task has no SLURM job ID");
      return;
    }

    setRefreshingDetails(true);
    try {
      await tasksApi.refreshTaskDetails(task.task_id);
      toast.success("Task details refresh triggered");
      
      // Refresh the task list after a short delay to get updated data
      setTimeout(async () => {
        await refreshData();
      }, 2000);
    } catch (error) {
      toast.error("Failed to refresh task details");
      console.error("Error refreshing task details:", error);
    } finally {
      setRefreshingDetails(false);
    }
  };

  // Status statistics for overview
  const statusStats = useMemo(() => {
    const counts: Record<string, number> = {};
    tasks.forEach(task => {
      counts[task.status] = (counts[task.status] || 0) + 1;
    });
    return counts;
  }, [tasks]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Task Queue</h2>
          <p className="text-muted-foreground">
            Manage and monitor your simulation tasks
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={refreshData}
            disabled={refreshing}
          >
            <RefreshCcw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button size="sm">
            <Plus className="h-4 w-4 mr-2" />
            New Task
          </Button>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Tasks</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{tasks.length}</div>
            <p className="text-xs text-muted-foreground">
              All tasks in queue
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Running</CardTitle>
            <Play className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {statusStats.RUNNING || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              Currently executing
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
            <Clock className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">
              {statusStats.PENDING || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              Waiting in queue
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Failed</CardTitle>
            <XCircle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {statusStats.ERROR || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              Needs attention
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters and Search */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search tasks, files, nodes..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>
            
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {Object.entries(STATUS_CONFIG).map(([status, config]) => (
                  <SelectItem key={status} value={status}>
                    {config.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {Object.entries(TASK_CATEGORIES).map(([category, config]) => (
                  <SelectItem key={category} value={category}>
                    {config.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="created_at">Created Date</SelectItem>
                <SelectItem value="started_at">Started Date</SelectItem>
                <SelectItem value="name">Name</SelectItem>
                <SelectItem value="status">Status</SelectItem>
                <SelectItem value="progress">Progress</SelectItem>
              </SelectContent>
            </Select>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
            >
              {sortOrder === "asc" ? "↑" : "↓"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tasks Grid/List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {filteredTasks.length} of {tasks.length} tasks
          </p>
          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as "grid" | "list")}>
            <TabsList>
              <TabsTrigger value="grid">Grid</TabsTrigger>
              <TabsTrigger value="list">List</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <AnimatePresence mode="wait">
          {viewMode === "grid" ? (
            <motion.div
              key="grid"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
            >
              {filteredTasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onDelete={deleteTask}
                  onCancel={cancelTask}
                  onView={viewTaskDetails}
                />
              ))}
            </motion.div>
          ) : (
            <motion.div
              key="list"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <TaskList
                tasks={filteredTasks}
                onDelete={deleteTask}
                onCancel={cancelTask}
                onView={viewTaskDetails}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {filteredTasks.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Activity className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No tasks found</h3>
              <p className="text-muted-foreground text-center max-w-md">
                {searchTerm || statusFilter !== "all" || categoryFilter !== "all"
                  ? "Try adjusting your filters or search terms."
                  : "Get started by creating your first simulation task."}
              </p>
              {(!searchTerm && statusFilter === "all" && categoryFilter === "all") && (
                <Button className="mt-4">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Task
                </Button>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Task</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{taskToDelete?.name}"? 
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (taskToDelete) {
                  deleteTask(taskToDelete);
                  setDeleteDialogOpen(false);
                  setTaskToDelete(null);
                }
              }}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Task Details Dialog */}
      <Dialog open={taskDetailsOpen} onOpenChange={setTaskDetailsOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle>
              Task Details: {selectedTask?.name}
            </DialogTitle>
            <DialogDescription>
              Task ID: {selectedTask?.task_id} 
              {selectedTask?.slurm_job_id && ` | SLURM Job ID: ${selectedTask.slurm_job_id}`}
            </DialogDescription>
          </DialogHeader>
          
          {selectedTask && (
            <div className="space-y-6">
              {/* Task Information */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium">Status:</span>
                  <Badge className="ml-2" variant={
                    selectedTask.status === 'RUNNING' ? 'default' :
                    selectedTask.status === 'COMPLETED' ? 'secondary' :
                    selectedTask.status === 'FAILED' ? 'destructive' :
                    'outline'
                  }>
                    {selectedTask.status}
                  </Badge>
                </div>
                <div>
                  <span className="font-medium">Progress:</span>
                  <span className="ml-2">{selectedTask.progress}%</span>
                </div>
                <div>
                  <span className="font-medium">Node:</span>
                  <span className="ml-2">{selectedTask.node || 'N/A'}</span>
                </div>
                <div>
                  <span className="font-medium">Partition:</span>
                  <span className="ml-2">{selectedTask.partition}</span>
                </div>
                <div>
                  <span className="font-medium">CPUs:</span>
                  <span className="ml-2">{selectedTask.num_cpus}</span>
                </div>
                <div>
                  <span className="font-medium">Memory:</span>
                  <span className="ml-2">{selectedTask.memory_gb}GB</span>
                </div>
                <div>
                  <span className="font-medium">GPUs:</span>
                  <span className="ml-2">{selectedTask.num_gpus}</span>
                </div>
                <div>
                  <span className="font-medium">Time Limit:</span>
                  <span className="ml-2">{selectedTask.time_limit}</span>
                </div>
              </div>

              {/* Simulation File */}
              <div>
                <span className="font-medium">Simulation File:</span>
                <p className="text-sm text-muted-foreground mt-1 font-mono break-all">
                  {selectedTask.simulation_file}
                </p>
              </div>

              {/* Timestamps */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium">Created:</span>
                  <p className="text-muted-foreground">{new Date(selectedTask.created_at).toLocaleString()}</p>
                </div>
                {selectedTask.started_at && (
                  <div>
                    <span className="font-medium">Started:</span>
                    <p className="text-muted-foreground">{new Date(selectedTask.started_at).toLocaleString()}</p>
                  </div>
                )}
                {selectedTask.finished_at && (
                  <div>
                    <span className="font-medium">Finished:</span>
                    <p className="text-muted-foreground">{new Date(selectedTask.finished_at).toLocaleString()}</p>
                  </div>
                )}
              </div>

              {/* Error Message */}
              {selectedTask.error_message && (
                <div>
                  <span className="font-medium text-red-600">Error:</span>
                  <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded text-sm font-mono text-red-800">
                    {selectedTask.error_message}
                  </div>
                </div>
              )}

              {/* Logs Section */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium">Logs (.out file):</span>
                  {selectedTask.slurm_job_id && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => refreshTaskDetails(selectedTask)}
                      disabled={refreshingDetails}
                    >
                      {refreshingDetails ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <RefreshCcw className="h-4 w-4 mr-2" />
                      )}
                      Refresh
                    </Button>
                  )}
                </div>
                <div className="h-64 p-3 bg-gray-50 border rounded text-sm font-mono overflow-auto">
                  {selectedTask.logs ? (
                    <pre className="whitespace-pre-wrap">{selectedTask.logs}</pre>
                  ) : (
                    <p className="text-muted-foreground italic">
                      {selectedTask.slurm_job_id ? 
                        "No logs available yet. Click refresh to fetch the latest output from SLURM." :
                        "No SLURM job ID available. Logs will be available once the task is submitted to SLURM."
                      }
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Task Card Component
function TaskCard({ 
  task, 
  onDelete, 
  onCancel,
  onView
}: { 
  task: TaskQueueJob;
  onDelete: (task: TaskQueueJob) => void;
  onCancel: (task: TaskQueueJob) => void;
  onView: (task: TaskQueueJob) => void;
}) {
  const status = STATUS_CONFIG[task.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.UNKNOWN;
  const category = TASK_CATEGORIES[getTaskCategory(task)];
  
  const formatTime = (timestamp: string | null) => {
    if (!timestamp) return "N/A";
    return new Date(timestamp).toLocaleString();
  };

  const formatDuration = (start: string | null, end: string | null) => {
    if (!start) return "N/A";
    const startTime = new Date(start);
    const endTime = end ? new Date(end) : new Date();
    const diff = endTime.getTime() - startTime.getTime();
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.2 }}
    >
      <Card className="hover:shadow-md transition-shadow">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <category.icon className={`h-4 w-4 ${category.color}`} />
              <div>
                <CardTitle className="text-sm font-medium truncate">
                  {task.name}
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  {category.label}
                </p>
              </div>
            </div>
            <Badge 
              variant="outline" 
              className={`${status.textColor} ${status.bgColor} border-0`}
            >
              <status.icon className="h-3 w-3 mr-1" />
              {status.label}
            </Badge>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-3">
          {/* Progress bar for running tasks */}
          {task.status === "RUNNING" && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span>Progress</span>
                <span>{task.progress}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-green-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${task.progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Task details */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex items-center gap-1">
              <Cpu className="h-3 w-3 text-muted-foreground" />
              <span>{task.num_cpus} CPU</span>
            </div>
            <div className="flex items-center gap-1">
              <HardDrive className="h-3 w-3 text-muted-foreground" />
              <span>{task.memory_gb}GB</span>
            </div>
            <div className="flex items-center gap-1">
              <Zap className="h-3 w-3 text-muted-foreground" />
              <span>{task.num_gpus} GPU</span>
            </div>
            <div className="flex items-center gap-1">
              <Server className="h-3 w-3 text-muted-foreground" />
              <span>{task.node || "N/A"}</span>
            </div>
          </div>

          {/* Time information */}
          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Created:</span>
              <span>{formatTime(task.created_at)}</span>
            </div>
            {task.started_at && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Duration:</span>
                <span>{formatDuration(task.started_at, task.finished_at)}</span>
              </div>
            )}
          </div>

          {/* Error message */}
          {task.error_message && (
            <div className="p-2 bg-red-50 border border-red-200 rounded text-xs">
              <p className="text-red-600 truncate" title={task.error_message}>
                {task.error_message}
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-1 pt-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="flex-1"
                    onClick={() => onView(task)}
                  >
                    <Eye className="h-3 w-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>View Details</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {(task.status === "PENDING" || task.status === "RUNNING") && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => onCancel(task)}
                      className="flex-1"
                    >
                      <Square className="h-3 w-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Cancel</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => onDelete(task)}
                    className="flex-1 text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Delete</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// Task List Component (for list view)
function TaskList({ 
  tasks, 
  onDelete, 
  onCancel,
  onView
}: { 
  tasks: TaskQueueJob[];
  onDelete: (task: TaskQueueJob) => void;
  onCancel: (task: TaskQueueJob) => void;
  onView: (task: TaskQueueJob) => void;
}) {
  const formatTime = (timestamp: string | null) => {
    if (!timestamp) return "N/A";
    return new Date(timestamp).toLocaleString();
  };

  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b">
              <tr className="text-left">
                <th className="p-4 font-medium">Task</th>
                <th className="p-4 font-medium">Status</th>
                <th className="p-4 font-medium">Resources</th>
                <th className="p-4 font-medium">Node</th>
                <th className="p-4 font-medium">Progress</th>
                <th className="p-4 font-medium">Created</th>
                <th className="p-4 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => {
                const status = STATUS_CONFIG[task.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.UNKNOWN;
                const category = TASK_CATEGORIES[getTaskCategory(task)];
                
                return (
                  <motion.tr
                    key={task.id}
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="border-b hover:bg-muted/50"
                  >
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <category.icon className={`h-4 w-4 ${category.color}`} />
                        <div>
                          <div className="font-medium">{task.name}</div>
                          <div className="text-sm text-muted-foreground truncate max-w-48">
                            {task.simulation_file}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      <Badge 
                        variant="outline" 
                        className={`${status.textColor} ${status.bgColor} border-0`}
                      >
                        <status.icon className="h-3 w-3 mr-1" />
                        {status.label}
                      </Badge>
                    </td>
                    <td className="p-4">
                      <div className="text-sm space-y-1">
                        <div>{task.num_cpus} CPU, {task.memory_gb}GB, {task.num_gpus} GPU</div>
                      </div>
                    </td>
                    <td className="p-4">
                      <span className="text-sm">{task.node || "N/A"}</span>
                    </td>
                    <td className="p-4">
                      {task.status === "RUNNING" ? (
                        <div className="flex items-center gap-2">
                          <div className="w-16 bg-gray-200 rounded-full h-2">
                            <div 
                              className="bg-green-500 h-2 rounded-full"
                              style={{ width: `${task.progress}%` }}
                            />
                          </div>
                          <span className="text-sm">{task.progress}%</span>
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="p-4">
                      <span className="text-sm">{formatTime(task.created_at)}</span>
                    </td>
                    <td className="p-4">
                      <div className="flex gap-1">
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => onView(task)}
                        >
                          <Eye className="h-3 w-3" />
                        </Button>
                        {(task.status === "PENDING" || task.status === "RUNNING") && (
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => onCancel(task)}
                          >
                            <Square className="h-3 w-3" />
                          </Button>
                        )}
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => onDelete(task)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
