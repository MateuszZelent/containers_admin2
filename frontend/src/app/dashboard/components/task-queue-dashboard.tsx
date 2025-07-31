"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
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
import { Checkbox } from "@/components/ui/checkbox";
import { TaskCard } from "./task-card-new";
import { TaskQueueJob as GlobalTaskQueueJob } from "@/lib/types";
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
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { taskQueueApi } from "@/lib/api-client";
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
    filters: ["amumax", "mumax", "simulation", ".mx3", "mx3jobs", "mx3 simulation"]
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

// Helper function to convert local TaskQueueJob to global TaskQueueJob type
const convertToGlobalTaskQueueJob = (localTask: TaskQueueJob): GlobalTaskQueueJob => {
  return {
    id: localTask.id,
    task_id: localTask.task_id,
    name: localTask.name,
    status: localTask.status,
    progress: localTask.progress,
    priority: 1,
    task_type: getTaskCategory(localTask),
    simulation_file: localTask.simulation_file,
    slurm_job_id: localTask.slurm_job_id || undefined,
    node: localTask.node || undefined,
    partition: localTask.partition,
    num_cpus: localTask.num_cpus,
    memory_gb: localTask.memory_gb,
    num_gpus: localTask.num_gpus,
    time_limit: localTask.time_limit,
    script: undefined,
    logs: localTask.logs || undefined,
    error_message: localTask.error_message || undefined,
    retry_count: 0,
    max_retries: 3,
    created_at: localTask.created_at,
    started_at: localTask.started_at || undefined,
    finished_at: localTask.finished_at || undefined,
    updated_at: localTask.finished_at || localTask.started_at || localTask.created_at,
    owner_id: localTask.owner_id
  };
};

export function TaskQueueDashboard() {
  const router = useRouter();
  
  // State
  const [tasks, setTasks] = useState<TaskQueueJob[]>([]);
  const [stats, setStats] = useState<TaskQueueStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Filters and search
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("created_at");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [activeTab, setActiveTab] = useState<"active" | "completed">("active");
  
  // UI state
  const [selectedTasks, setSelectedTasks] = useState<Set<string>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [massDeleteDialogOpen, setMassDeleteDialogOpen] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<TaskQueueJob | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [selectedTask, setSelectedTask] = useState<TaskQueueJob | null>(null);
  const [taskDetailsOpen, setTaskDetailsOpen] = useState(false);
  const [refreshingDetails, setRefreshingDetails] = useState(false);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(12); // 12 items per page for grid view
  const [totalItems, setTotalItems] = useState(0);

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

  // Navigation handler
  const handleNewTask = () => {
    router.push("/dashboard/task_queue/submit");
  };

  // Data fetching
  const fetchTasks = useCallback(async () => {
    try {
      const response = await taskQueueApi.getTasks();
      setTasks(response.data);
    } catch (error) {
      toast.error("Failed to fetch tasks");
      console.error("Error fetching tasks:", error);
    }
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const response = await taskQueueApi.getQueueStatus();
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
      // Tab filter - active vs completed
      const activeStatuses = ["PENDING", "CONFIGURING", "RUNNING"];
      const completedStatuses = ["COMPLETED", "ERROR", "CANCELLED", "TIMEOUT"];
      
      if (activeTab === "active" && !activeStatuses.includes(task.status)) {
        return false;
      }
      if (activeTab === "completed" && !completedStatuses.includes(task.status)) {
        return false;
      }

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

      // Status filter (if not "all")
      if (statusFilter !== "all" && statusFilter !== "active" && task.status !== statusFilter) {
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
  }, [tasks, searchTerm, statusFilter, categoryFilter, sortBy, sortOrder, activeTab]);

  // Paginated tasks
  const paginatedTasks = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    setTotalItems(filteredTasks.length);
    return filteredTasks.slice(startIndex, endIndex);
  }, [filteredTasks, currentPage, itemsPerPage]);

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, categoryFilter, activeTab, itemsPerPage]);

  // Task operations
  const deleteTask = async (task: TaskQueueJob) => {
    try {
      await taskQueueApi.deleteTask(task.task_id);
      toast.success(`Task "${task.name}" deleted successfully`);
      await refreshData();
    } catch (error) {
      toast.error("Failed to delete task");
      console.error("Error deleting task:", error);
    }
  };

  // Mass deletion functionality
  const massDeleteTasks = async () => {
    const tasksToDelete = Array.from(selectedTasks)
      .map(taskId => tasks.find(task => task.task_id === taskId))
      .filter((task): task is TaskQueueJob => task !== undefined);

    if (tasksToDelete.length === 0) {
      toast.error("No tasks selected for deletion");
      return;
    }

    try {
      const deletePromises = tasksToDelete.map(task => taskQueueApi.deleteTask(task.task_id));
      await Promise.all(deletePromises);
      
      toast.success(`${tasksToDelete.length} tasks deleted successfully`);
      setSelectedTasks(new Set());
      setMassDeleteDialogOpen(false);
      await refreshData();
    } catch (error) {
      toast.error("Failed to delete some tasks");
      console.error("Error in mass deletion:", error);
    }
  };

  // Selection management
  const toggleTaskSelection = (taskId: string) => {
    const newSelected = new Set(selectedTasks);
    if (newSelected.has(taskId)) {
      newSelected.delete(taskId);
    } else {
      newSelected.add(taskId);
    }
    setSelectedTasks(newSelected);
  };

  const selectAllTasks = () => {
    if (selectedTasks.size === paginatedTasks.length && paginatedTasks.every(task => selectedTasks.has(task.task_id))) {
      // Deselect all on current page
      paginatedTasks.forEach(task => {
        if (selectedTasks.has(task.task_id)) {
          toggleTaskSelection(task.task_id);
        }
      });
    } else {
      // Select all on current page
      paginatedTasks.forEach(task => {
        if (!selectedTasks.has(task.task_id)) {
          toggleTaskSelection(task.task_id);
        }
      });
    }
  };

  const cancelTask = async (task: TaskQueueJob) => {
    try {
      await taskQueueApi.cancelTask(task.task_id);
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
      await taskQueueApi.refreshTaskDetails(task.task_id);
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
          <Button 
            size="sm" 
            onClick={handleNewTask}
            className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-semibold shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105"
          >
            <Plus className="h-4 w-4 mr-2" />
            Nowa symulacja
          </Button>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="group relative overflow-hidden backdrop-blur-md bg-gradient-to-br from-blue-500/10 via-cyan-600/5 to-indigo-700/10 dark:from-blue-400/20 dark:via-cyan-500/10 dark:to-indigo-600/20 border border-blue-200/30 dark:border-blue-700/30 hover:border-blue-300/50 dark:hover:border-blue-600/50 transition-all duration-300">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative">
            <CardTitle className="text-sm font-medium text-blue-900 dark:text-blue-100">Tasks Completed</CardTitle>
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-400 to-cyan-600 flex items-center justify-center shadow-md">
              <Activity className="h-4 w-4 text-white" />
            </div>
          </CardHeader>
          <CardContent className="relative">
            <div className="text-2xl font-bold text-blue-900 dark:text-blue-100">{statusStats.COMPLETED || 0}</div>
            <p className="text-xs text-blue-600 dark:text-blue-400">
              Successfully finished
            </p>
          </CardContent>
        </Card>

        <Card className="group relative overflow-hidden backdrop-blur-md bg-gradient-to-br from-green-500/10 via-emerald-600/5 to-teal-700/10 dark:from-green-400/20 dark:via-emerald-500/10 dark:to-teal-600/20 border border-green-200/30 dark:border-green-700/30 hover:border-green-300/50 dark:hover:border-green-600/50 transition-all duration-300">
          <div className="absolute inset-0 bg-gradient-to-br from-green-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative">
            <CardTitle className="text-sm font-medium text-green-900 dark:text-green-100">Running</CardTitle>
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center shadow-md">
              <Play className="h-4 w-4 text-white" />
            </div>
          </CardHeader>
          <CardContent className="relative">
            <div className="text-2xl font-bold text-green-900 dark:text-green-100">
              {statusStats.RUNNING || 0}
            </div>
            <p className="text-xs text-green-600 dark:text-green-400">
              Currently executing
            </p>
          </CardContent>
        </Card>

        <Card className="group relative overflow-hidden backdrop-blur-md bg-gradient-to-br from-yellow-500/10 via-amber-600/5 to-orange-700/10 dark:from-yellow-400/20 dark:via-amber-500/10 dark:to-orange-600/20 border border-yellow-200/30 dark:border-yellow-700/30 hover:border-yellow-300/50 dark:hover:border-yellow-600/50 transition-all duration-300">
          <div className="absolute inset-0 bg-gradient-to-br from-yellow-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative">
            <CardTitle className="text-sm font-medium text-yellow-900 dark:text-yellow-100">Pending</CardTitle>
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-yellow-400 to-amber-600 flex items-center justify-center shadow-md">
              <Clock className="h-4 w-4 text-white" />
            </div>
          </CardHeader>
          <CardContent className="relative">
            <div className="text-2xl font-bold text-yellow-900 dark:text-yellow-100">
              {statusStats.PENDING || 0}
            </div>
            <p className="text-xs text-yellow-600 dark:text-yellow-400">
              Waiting in queue
            </p>
          </CardContent>
        </Card>

        <Card className="group relative overflow-hidden backdrop-blur-md bg-gradient-to-br from-red-500/10 via-rose-600/5 to-pink-700/10 dark:from-red-400/20 dark:via-rose-500/10 dark:to-pink-600/20 border border-red-200/30 dark:border-red-700/30 hover:border-red-300/50 dark:hover:border-red-600/50 transition-all duration-300">
          <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative">
            <CardTitle className="text-sm font-medium text-red-900 dark:text-red-100">Failed</CardTitle>
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-red-400 to-rose-600 flex items-center justify-center shadow-md">
              <XCircle className="h-4 w-4 text-white" />
            </div>
          </CardHeader>
          <CardContent className="relative">
            <div className="text-2xl font-bold text-red-900 dark:text-red-100">
              {statusStats.ERROR || 0}
            </div>
            <p className="text-xs text-red-600 dark:text-red-400">
              Needs attention
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Active/Completed Tabs and Filters */}
      <Card className="group relative overflow-hidden backdrop-blur-md bg-gradient-to-br from-slate-500/10 via-slate-600/5 to-gray-700/10 dark:from-slate-400/20 dark:via-slate-500/10 dark:to-gray-600/20 border border-slate-200/30 dark:border-slate-700/30 hover:border-slate-300/50 dark:hover:border-slate-600/50 transition-all duration-300">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        <CardHeader className="relative">
          <CardTitle className="text-lg text-slate-900 dark:text-slate-100">Task Queue</CardTitle>
          
          {/* Active/Completed Tabs */}
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "active" | "completed")} className="mt-4">
            <TabsList>
              <TabsTrigger value="active">Active Tasks</TabsTrigger>
              <TabsTrigger value="completed">Completed Tasks</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent className="relative">
          {/* Mass Action Bar */}
          {selectedTasks.size > 0 && (
            <div className="mb-4 flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-700">
              <span className="text-sm text-blue-700 dark:text-blue-300">
                {selectedTasks.size} task(s) selected
              </span>
              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setSelectedTasks(new Set())}
                >
                  Clear Selection
                </Button>
                <Button 
                  variant="destructive" 
                  size="sm"
                  onClick={() => setMassDeleteDialogOpen(true)}
                >
                  Delete Selected
                </Button>
              </div>
            </div>
          )}
          
          {/* Filters */}
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

            <Select value={itemsPerPage.toString()} onValueChange={(value) => setItemsPerPage(parseInt(value))}>
              <SelectTrigger className="w-[120px]">
                <SelectValue placeholder="Per page" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="6">6 per page</SelectItem>
                <SelectItem value="12">12 per page</SelectItem>
                <SelectItem value="24">24 per page</SelectItem>
                <SelectItem value="48">48 per page</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Tasks Grid/List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Checkbox
              checked={paginatedTasks.length > 0 && paginatedTasks.every(task => selectedTasks.has(task.task_id))}
              onCheckedChange={selectAllTasks}
              className="mr-2"
            />
            <p className="text-sm text-muted-foreground">
              Showing {paginatedTasks.length} of {totalItems} tasks (page {currentPage} of {Math.ceil(totalItems / itemsPerPage)})
            </p>
          </div>
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
              className="flex flex-wrap justify-center gap-6"
            >
              {paginatedTasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={convertToGlobalTaskQueueJob(task)}
                  onDelete={() => deleteTask(task)}
                  onCancel={() => cancelTask(task)}
                  onView={() => viewTaskDetails(task)}
                  isSelected={selectedTasks.has(task.task_id)}
                  onSelectionToggle={toggleTaskSelection}
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
                tasks={paginatedTasks}
                onDelete={deleteTask}
                onCancel={cancelTask}
                onView={viewTaskDetails}
                selectedTasks={selectedTasks}
                onSelectionToggle={toggleTaskSelection}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Pagination */}
        {totalItems > itemsPerPage && (
          <div className="flex items-center justify-between mt-6">
            <div className="text-sm text-muted-foreground">
              Page {currentPage} of {Math.ceil(totalItems / itemsPerPage)}
            </div>
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              
              {/* Page numbers */}
              <div className="flex items-center space-x-1">
                {(() => {
                  const totalPages = Math.ceil(totalItems / itemsPerPage);
                  const pages = [];
                  const maxVisible = 5;
                  
                  let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
                  let end = Math.min(totalPages, start + maxVisible - 1);
                  
                  if (end - start + 1 < maxVisible) {
                    start = Math.max(1, end - maxVisible + 1);
                  }
                  
                  for (let i = start; i <= end; i++) {
                    pages.push(
                      <Button
                        key={i}
                        variant={currentPage === i ? "default" : "outline"}
                        size="sm"
                        onClick={() => setCurrentPage(i)}
                        className="min-w-[2.5rem]"
                      >
                        {i}
                      </Button>
                    );
                  }
                  
                  return pages;
                })()}
              </div>
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, Math.ceil(totalItems / itemsPerPage)))}
                disabled={currentPage === Math.ceil(totalItems / itemsPerPage)}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {filteredTasks.length === 0 && (
          <Card className="group relative overflow-hidden backdrop-blur-md bg-gradient-to-br from-slate-500/10 via-slate-600/5 to-gray-700/10 dark:from-slate-400/20 dark:via-slate-500/10 dark:to-gray-600/20 border border-slate-200/30 dark:border-slate-700/30">
            <div className="absolute inset-0 bg-gradient-to-br from-slate-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            <CardContent className="flex flex-col items-center justify-center py-12 relative">
              <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-slate-400 to-gray-600 flex items-center justify-center shadow-lg mb-4">
                <Activity className="h-8 w-8 text-white" />
              </div>
              <h3 className="text-lg font-semibold mb-2 text-slate-900 dark:text-slate-100">No tasks found</h3>
              <p className="text-slate-600 dark:text-slate-400 text-center max-w-md">
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

      {/* Mass Delete Confirmation Dialog */}
      <AlertDialog open={massDeleteDialogOpen} onOpenChange={setMassDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Multiple Tasks</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedTasks.size} selected task(s)? 
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={massDeleteTasks}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete {selectedTasks.size} Task(s)
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

// Task List Component (for list view)
function TaskList({ 
  tasks, 
  onDelete, 
  onCancel,
  onView,
  selectedTasks,
  onSelectionToggle
}: { 
  tasks: TaskQueueJob[];
  onDelete: (task: TaskQueueJob) => void;
  onCancel: (task: TaskQueueJob) => void;
  onView: (task: TaskQueueJob) => void;
  selectedTasks: Set<string>;
  onSelectionToggle: (taskId: string) => void;
}) {
  const formatTime = (timestamp: string | null) => {
    if (!timestamp) return "N/A";
    return new Date(timestamp).toLocaleString();
  };

  return (
    <Card className="group relative overflow-hidden backdrop-blur-md bg-gradient-to-br from-slate-500/10 via-slate-600/5 to-gray-700/10 dark:from-slate-400/20 dark:via-slate-500/10 dark:to-gray-600/20 border border-slate-200/30 dark:border-slate-700/30 hover:border-slate-300/50 dark:hover:border-slate-600/50 transition-all duration-300">
      <div className="absolute inset-0 bg-gradient-to-br from-slate-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      <CardContent className="p-0 relative">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b">
              <tr className="text-left">
                <th className="p-4 font-medium">
                  <Checkbox
                    checked={tasks.length > 0 && tasks.every(task => selectedTasks.has(task.task_id))}
                    onCheckedChange={() => {
                      if (tasks.every(task => selectedTasks.has(task.task_id))) {
                        tasks.forEach(task => onSelectionToggle(task.task_id));
                      } else {
                        tasks.forEach(task => {
                          if (!selectedTasks.has(task.task_id)) {
                            onSelectionToggle(task.task_id);
                          }
                        });
                      }
                    }}
                  />
                </th>
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
                      <Checkbox
                        checked={selectedTasks.has(task.task_id)}
                        onCheckedChange={() => onSelectionToggle(task.task_id)}
                      />
                    </td>
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
