"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { 
  Loader2, 
  RefreshCcw, 
  Plus, 
  Search,
  Filter,
  Play,
  Pause,
  Square,
  Trash2,
  Eye,
  Download,
  Calendar,
  Clock,
  Cpu,
  MemoryStick,
  HardDrive,
  AlertCircle,
  CheckCircle,
  XCircle,
  Settings,
  ChevronDown,
  SortAsc,
  SortDesc
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
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

import { tasksApi } from "@/lib/api-client";

// Enhanced task interface
interface Task {
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
  node?: string;
  error_message?: string;
  slurm_job_id?: string;
}

// Queue status interface
interface QueueStatus {
  total_tasks: number;
  status_counts: Record<string, number>;
  avg_wait_time: number | null;
  next_task_id: string | null;
  active_worker_count: number;
}

// Task type categorization
type TaskType = 'all' | 'amumax' | 'inne' | 'python';
type TaskStatus = 'all' | 'PENDING' | 'RUNNING' | 'COMPLETED' | 'ERROR' | 'CANCELLED';
type SortField = 'created_at' | 'name' | 'status' | 'progress';
type SortOrder = 'asc' | 'desc';

// Form schema for new tasks
const formSchema = z.object({
  name: z.string().min(3, "Nazwa musi mieć co najmniej 3 znaki").max(50, "Nazwa nie może przekraczać 50 znaków"),
  simulation_file: z.string().min(1, "Plik symulacji jest wymagany"),
  partition: z.string().default("proxima"),
  num_cpus: z.number().min(1).max(128).default(5),
  memory_gb: z.number().min(1).max(512).default(24),
  num_gpus: z.number().min(0).max(8).default(1),
  time_limit: z.string().default("24:00:00"),
});

// Status configuration
const statusConfig = {
  PENDING: { 
    label: "Oczekujące", 
    color: "bg-yellow-500", 
    textColor: "text-yellow-600",
    bgColor: "bg-yellow-50 dark:bg-yellow-900/20",
    icon: Clock 
  },
  RUNNING: { 
    label: "Uruchomione", 
    color: "bg-blue-500", 
    textColor: "text-blue-600",
    bgColor: "bg-blue-50 dark:bg-blue-900/20",
    icon: Play 
  },
  COMPLETED: { 
    label: "Zakończone", 
    color: "bg-green-500", 
    textColor: "text-green-600",
    bgColor: "bg-green-50 dark:bg-green-900/20",
    icon: CheckCircle 
  },
  ERROR: { 
    label: "Błąd", 
    color: "bg-red-500", 
    textColor: "text-red-600",
    bgColor: "bg-red-50 dark:bg-red-900/20",
    icon: XCircle 
  },
  CANCELLED: { 
    label: "Anulowane", 
    color: "bg-gray-500", 
    textColor: "text-gray-600",
    bgColor: "bg-gray-50 dark:bg-gray-900/20",
    icon: Square 
  },
  CONFIGURING: { 
    label: "Konfigurowanie", 
    color: "bg-purple-500", 
    textColor: "text-purple-600",
    bgColor: "bg-purple-50 dark:bg-purple-900/20",
    icon: Settings 
  },
};

// Utility functions
const getTaskType = (simulation_file: string): TaskType => {
  if (simulation_file.includes('.mx3')) return 'amumax';
  if (simulation_file.includes('.py')) return 'python';
  return 'inne';
};

const formatDuration = (startTime?: string, endTime?: string) => {
  if (!startTime) return "—";
  
  const start = new Date(startTime);
  const end = endTime ? new Date(endTime) : new Date();
  const diffMs = end.getTime() - start.getTime();
  
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  
  if (hours > 0) {
    return `${hours}g ${minutes}m`;
  }
  return `${minutes}m`;
};

const formatTimeAgo = (dateString: string) => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  
  const minutes = Math.floor(diffMs / (1000 * 60));
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days}d temu`;
  if (hours > 0) return `${hours}g temu`;
  if (minutes > 0) return `${minutes}m temu`;
  return "Teraz";
};

export default function ModernTaskQueuePage() {
  // State management
  const [tasks, setTasks] = useState<Task[]>([]);
  const [queueStatus, setQueueStatus] = useState<QueueStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Filtering and sorting
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<TaskStatus>("all");
  const [typeFilter, setTypeFilter] = useState<TaskType>("all");
  const [sortField, setSortField] = useState<SortField>("created_at");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  
  // Dialog states
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  
  // Form
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
    },
  });

  // Data fetching
  const fetchTasks = useCallback(async () => {
    try {
      const response = await tasksApi.getTasks();
      setTasks(response.data);
    } catch (error: any) {
      console.error("Error fetching tasks:", error);
      toast.error("Błąd podczas pobierania zadań");
    }
  }, []);

  const fetchQueueStatus = useCallback(async () => {
    try {
      const response = await tasksApi.getQueueStatus();
      setQueueStatus(response.data);
    } catch (error: any) {
      console.error("Error fetching queue status:", error);
    }
  }, []);

  const refreshData = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([fetchTasks(), fetchQueueStatus()]);
      toast.success("Dane zostały odświeżone");
    } catch (error) {
      toast.error("Błąd podczas odświeżania danych");
    } finally {
      setIsRefreshing(false);
    }
  };

  // Initial data load
  useEffect(() => {
    const initialize = async () => {
      setIsLoading(true);
      await Promise.all([fetchTasks(), fetchQueueStatus()]);
      setIsLoading(false);
    };
    initialize();
  }, [fetchTasks, fetchQueueStatus]);

  // Task operations
  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    setIsSubmitting(true);
    try {
      const response = await tasksApi.createTask(values);
      toast.success(`Zadanie "${values.name}" zostało utworzone!`);
      form.reset();
      setIsCreateDialogOpen(false);
      await fetchTasks();
    } catch (error: any) {
      const errorMessage = error.response?.data?.detail || "Błąd podczas tworzenia zadania";
      toast.error(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const cancelTask = async (task: Task) => {
    try {
      await tasksApi.cancelTask(task.id);
      toast.success(`Zadanie "${task.name}" zostało anulowane`);
      await fetchTasks();
    } catch (error: any) {
      const errorMessage = error.response?.data?.detail || "Nie udało się anulować zadania";
      toast.error(errorMessage);
    }
  };

  const deleteTask = async () => {
    if (!taskToDelete) return;
    
    try {
      await tasksApi.deleteTask(taskToDelete.id);
      toast.success(`Zadanie "${taskToDelete.name}" zostało usunięte`);
      await fetchTasks();
      setIsDeleteDialogOpen(false);
      setTaskToDelete(null);
    } catch (error: any) {
      const errorMessage = error.response?.data?.detail || "Nie udało się usunąć zadania";
      toast.error(errorMessage);
    }
  };

  // Filtering and sorting logic
  const filteredAndSortedTasks = tasks
    .filter(task => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        if (!task.name.toLowerCase().includes(query) && 
            !task.simulation_file.toLowerCase().includes(query) &&
            !task.task_id.toLowerCase().includes(query)) {
          return false;
        }
      }
      
      // Status filter
      if (statusFilter !== "all" && task.status !== statusFilter) {
        return false;
      }
      
      // Type filter
      if (typeFilter !== "all") {
        const taskType = getTaskType(task.simulation_file);
        if (taskType !== typeFilter) {
          return false;
        }
      }
      
      return true;
    })
    .sort((a, b) => {
      let aVal, bVal;
      
      switch (sortField) {
        case 'created_at':
          aVal = new Date(a.created_at).getTime();
          bVal = new Date(b.created_at).getTime();
          break;
        case 'name':
          aVal = a.name.toLowerCase();
          bVal = b.name.toLowerCase();
          break;
        case 'status':
          aVal = a.status;
          bVal = b.status;
          break;
        case 'progress':
          aVal = a.progress;
          bVal = b.progress;
          break;
        default:
          return 0;
      }
      
      if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

  // Task type counts for filtering
  const taskTypeCounts = {
    all: tasks.length,
    amumax: tasks.filter(task => getTaskType(task.simulation_file) === 'amumax').length,
    python: tasks.filter(task => getTaskType(task.simulation_file) === 'python').length,
    inne: tasks.filter(task => getTaskType(task.simulation_file) === 'inne').length,
  };

  // Status counts for filtering
  const statusCounts = queueStatus?.status_counts || {};

  if (isLoading) {
    return (
      <div className="container mx-auto py-8">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
            <p className="text-muted-foreground">Ładowanie zadań...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Kolejka zadań</h1>
          <p className="text-muted-foreground">
            Zarządzaj zadaniami symulacji i monitoruj ich postęp
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={refreshData}
            disabled={isRefreshing}
            className="h-10"
          >
            <RefreshCcw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            Odśwież
          </Button>
          
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button className="h-10">
                <Plus className="h-4 w-4 mr-2" />
                Nowe zadanie
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Utwórz nowe zadanie</DialogTitle>
                <DialogDescription>
                  Dodaj nowe zadanie symulacji do kolejki
                </DialogDescription>
              </DialogHeader>
              
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nazwa zadania</FormLabel>
                        <FormControl>
                          <Input placeholder="np. Symulacja magnetyczna 1" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="simulation_file"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Plik symulacji</FormLabel>
                        <FormControl>
                          <Input placeholder="ścieżka/do/pliku.mx3" {...field} />
                        </FormControl>
                        <FormDescription>
                          Ścieżka do pliku .mx3, .py lub innego pliku symulacji
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="num_cpus"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>CPU</FormLabel>
                          <FormControl>
                            <Input 
                              type="number" 
                              {...field} 
                              onChange={e => field.onChange(parseInt(e.target.value))}
                            />
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
                            <Input 
                              type="number" 
                              {...field}
                              onChange={e => field.onChange(parseInt(e.target.value))}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <div className="flex justify-end gap-3 pt-4">
                    <Button 
                      type="button" 
                      variant="outline" 
                      onClick={() => setIsCreateDialogOpen(false)}
                    >
                      Anuluj
                    </Button>
                    <Button type="submit" disabled={isSubmitting}>
                      {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Utwórz zadanie
                    </Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats Cards */}
      {queueStatus && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="flex items-center p-6">
              <div className="flex-1">
                <p className="text-sm font-medium text-muted-foreground">Zadania całkowite</p>
                <p className="text-2xl font-bold">{queueStatus.total_tasks}</p>
              </div>
              <div className="h-8 w-8 bg-blue-100 dark:bg-blue-900/20 rounded-full flex items-center justify-center">
                <Settings className="h-4 w-4 text-blue-600" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="flex items-center p-6">
              <div className="flex-1">
                <p className="text-sm font-medium text-muted-foreground">Uruchomione</p>
                <p className="text-2xl font-bold text-blue-600">{statusCounts.RUNNING || 0}</p>
              </div>
              <div className="h-8 w-8 bg-blue-100 dark:bg-blue-900/20 rounded-full flex items-center justify-center">
                <Play className="h-4 w-4 text-blue-600" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="flex items-center p-6">
              <div className="flex-1">
                <p className="text-sm font-medium text-muted-foreground">Oczekujące</p>
                <p className="text-2xl font-bold text-yellow-600">{statusCounts.PENDING || 0}</p>
              </div>
              <div className="h-8 w-8 bg-yellow-100 dark:bg-yellow-900/20 rounded-full flex items-center justify-center">
                <Clock className="h-4 w-4 text-yellow-600" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="flex items-center p-6">
              <div className="flex-1">
                <p className="text-sm font-medium text-muted-foreground">Śr. czas oczekiwania</p>
                <p className="text-2xl font-bold">
                  {queueStatus.avg_wait_time 
                    ? `${Math.round(queueStatus.avg_wait_time / 60)}m`
                    : "—"
                  }
                </p>
              </div>
              <div className="h-8 w-8 bg-purple-100 dark:bg-purple-900/20 rounded-full flex items-center justify-center">
                <Calendar className="h-4 w-4 text-purple-600" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters and Search */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row gap-4">
            {/* Search */}
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Szukaj zadań..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            
            {/* Type Filter */}
            <Select value={typeFilter} onValueChange={(value: TaskType) => setTypeFilter(value)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Typ zadania" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Wszystkie ({taskTypeCounts.all})</SelectItem>
                <SelectItem value="amumax">Amumax ({taskTypeCounts.amumax})</SelectItem>
                <SelectItem value="python">Python ({taskTypeCounts.python})</SelectItem>
                <SelectItem value="inne">Inne ({taskTypeCounts.inne})</SelectItem>
              </SelectContent>
            </Select>
            
            {/* Status Filter */}
            <Select value={statusFilter} onValueChange={(value: TaskStatus) => setStatusFilter(value)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Wszystkie statusy</SelectItem>
                <SelectItem value="PENDING">Oczekujące ({statusCounts.PENDING || 0})</SelectItem>
                <SelectItem value="RUNNING">Uruchomione ({statusCounts.RUNNING || 0})</SelectItem>
                <SelectItem value="COMPLETED">Zakończone ({statusCounts.COMPLETED || 0})</SelectItem>
                <SelectItem value="ERROR">Błąd ({statusCounts.ERROR || 0})</SelectItem>
                <SelectItem value="CANCELLED">Anulowane ({statusCounts.CANCELLED || 0})</SelectItem>
              </SelectContent>
            </Select>
            
            {/* Sort */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="w-[140px]">
                  {sortOrder === 'asc' ? <SortAsc className="h-4 w-4 mr-2" /> : <SortDesc className="h-4 w-4 mr-2" />}
                  Sortuj
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Sortuj według</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => {
                  setSortField('created_at');
                  setSortOrder(sortField === 'created_at' && sortOrder === 'desc' ? 'asc' : 'desc');
                }}>
                  Data utworzenia
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => {
                  setSortField('name');
                  setSortOrder(sortField === 'name' && sortOrder === 'desc' ? 'asc' : 'desc');
                }}>
                  Nazwa
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => {
                  setSortField('status');
                  setSortOrder(sortField === 'status' && sortOrder === 'desc' ? 'asc' : 'desc');
                }}>
                  Status
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => {
                  setSortField('progress');
                  setSortOrder(sortField === 'progress' && sortOrder === 'desc' ? 'asc' : 'desc');
                }}>
                  Postęp
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardContent>
      </Card>

      {/* Tasks Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredAndSortedTasks.map(task => {
          const statusInfo = statusConfig[task.status as keyof typeof statusConfig] || statusConfig.ERROR;
          const StatusIcon = statusInfo.icon;
          const taskType = getTaskType(task.simulation_file);
          const isActive = ["PENDING", "RUNNING", "CONFIGURING"].includes(task.status);
          
          return (
            <Card key={task.id} className={`${statusInfo.bgColor} border-l-4 border-l-${statusInfo.color.replace('bg-', '')}`}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-lg font-semibold truncate">
                      {task.name}
                    </CardTitle>
                    <CardDescription className="text-sm">
                      ID: {task.task_id.substring(0, 8)}...
                    </CardDescription>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {taskType.toUpperCase()}
                    </Badge>
                    <Badge className={`${statusInfo.color} text-white text-xs`}>
                      <StatusIcon className="h-3 w-3 mr-1" />
                      {statusInfo.label}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              
              <CardContent className="pt-0">
                <div className="space-y-3">
                  {/* Progress Bar */}
                  {task.status === "RUNNING" && (
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span>Postęp</span>
                        <span>{task.progress}%</span>
                      </div>
                      <Progress value={task.progress} className="h-2" />
                    </div>
                  )}
                  
                  {/* File */}
                  <div className="flex items-center gap-2 text-sm">
                    <HardDrive className="h-4 w-4 text-muted-foreground" />
                    <span className="truncate font-mono text-xs">
                      {task.simulation_file.split('/').pop()}
                    </span>
                  </div>
                  
                  {/* Resources */}
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="flex items-center gap-1">
                      <Cpu className="h-3 w-3 text-muted-foreground" />
                      <span>{task.num_cpus} CPU</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <MemoryStick className="h-3 w-3 text-muted-foreground" />
                      <span>{task.memory_gb}GB</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Settings className="h-3 w-3 text-muted-foreground" />
                      <span>{task.num_gpus} GPU</span>
                    </div>
                  </div>
                  
                  {/* Node & Timing */}
                  <div className="space-y-1 text-xs text-muted-foreground">
                    {task.node && (
                      <div>Węzeł: <span className="font-mono">{task.node}</span></div>
                    )}
                    <div>Utworzono: {formatTimeAgo(task.created_at)}</div>
                    {task.started_at && (
                      <div>Czas trwania: {formatDuration(task.started_at, task.finished_at)}</div>
                    )}
                  </div>
                  
                  {/* Error Message */}
                  {task.error_message && (
                    <div className="p-2 bg-red-50 dark:bg-red-900/20 rounded text-xs text-red-600">
                      <div className="flex items-start gap-1">
                        <AlertCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                        <span>{task.error_message}</span>
                      </div>
                    </div>
                  )}
                  
                  {/* Actions */}
                  <div className="flex justify-end gap-2 pt-2">
                    <Button size="sm" variant="outline" className="h-8 text-xs">
                      <Eye className="h-3 w-3 mr-1" />
                      Szczegóły
                    </Button>
                    
                    {task.status === "COMPLETED" && (
                      <Button size="sm" variant="outline" className="h-8 text-xs">
                        <Download className="h-3 w-3 mr-1" />
                        Wyniki
                      </Button>
                    )}
                    
                    {isActive ? (
                      <Button 
                        size="sm" 
                        variant="destructive" 
                        className="h-8 text-xs"
                        onClick={() => cancelTask(task)}
                      >
                        <Square className="h-3 w-3 mr-1" />
                        Anuluj
                      </Button>
                    ) : (
                      <Button 
                        size="sm" 
                        variant="destructive" 
                        className="h-8 text-xs"
                        onClick={() => {
                          setTaskToDelete(task);
                          setIsDeleteDialogOpen(true);
                        }}
                      >
                        <Trash2 className="h-3 w-3 mr-1" />
                        Usuń
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Empty State */}
      {filteredAndSortedTasks.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Settings className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Brak zadań</h3>
            <p className="text-muted-foreground text-center mb-4">
              {searchQuery || statusFilter !== "all" || typeFilter !== "all"
                ? "Nie znaleziono zadań pasujących do aktualnych filtrów."
                : "Nie masz jeszcze żadnych zadań. Utwórz pierwsze zadanie, aby rozpocząć."
              }
            </p>
            {(!searchQuery && statusFilter === "all" && typeFilter === "all") && (
              <Button onClick={() => setIsCreateDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Utwórz pierwsze zadanie
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Czy na pewno chcesz usunąć to zadanie?</AlertDialogTitle>
            <AlertDialogDescription>
              Ta operacja jest nieodwracalna. Zadanie "{taskToDelete?.name}" zostanie trwale usunięte z bazy danych.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Anuluj</AlertDialogCancel>
            <AlertDialogAction onClick={deleteTask} className="bg-red-600 hover:bg-red-700">
              Usuń zadanie
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
