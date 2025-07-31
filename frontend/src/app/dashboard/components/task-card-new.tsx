import React from "react";
import { TaskQueueJob } from "@/lib/types";
import { 
  Trash2,
  Eye,
  Square,
  Zap,
  Activity,
  Code2,
  Cpu,
  HardDrive,
  Server
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { ModernCardLayout, BaseCardData, CardAction, ResourceInfo, StatusBadge } from "./modern-card-layout";

interface TaskCardProps {
  task: TaskQueueJob;
  onDelete: (task: TaskQueueJob) => void;
  onCancel: (task: TaskQueueJob) => void;
  onView: (task: TaskQueueJob) => void;
  isSelected?: boolean;
  onSelectionToggle?: (taskId: string) => void;
}

// Task categories
const TASK_CATEGORIES = {
  AMUMAX: { 
    icon: Zap, 
    color: "text-purple-600", 
    label: "AMUMAX Simulation" 
  },
  COMSOL: { 
    icon: Activity, 
    color: "text-blue-600", 
    label: "COMSOL Simulation" 
  },
  CUSTOM: { 
    icon: Code2, 
    color: "text-green-600", 
    label: "Custom Task" 
  },
  DEFAULT: { 
    icon: Server, 
    color: "text-gray-600", 
    label: "Generic Task" 
  }
};

// Helper function to categorize tasks
const getTaskCategory = (task: TaskQueueJob) => {
  if (task.name.toLowerCase().includes('amp_') || task.task_type?.toLowerCase().includes('amuc_amumax_')) {
    return TASK_CATEGORIES.AMUMAX;
  }
  if (task.task_type?.toLowerCase().includes('comsol')) {
    return TASK_CATEGORIES.COMSOL;
  }
  return TASK_CATEGORIES.DEFAULT;
};

// Get status badge configuration for tasks
const getTaskStatusBadge = (status: string): StatusBadge => {
  switch (status) {
    case "RUNNING":
      return { label: status, variant: "default", icon: Activity };
    case "PENDING":
      return { label: status, variant: "outline" };
    case "COMPLETED":
      return { label: status, variant: "secondary" };
    case "FAILED":
      return { label: status, variant: "destructive" };
    case "CANCELLED":
      return { label: status, variant: "outline" };
    default:
      return { label: status, variant: "outline" };
  }
};

// Get type badge configuration for tasks
const getTaskTypeBadge = (task: TaskQueueJob): StatusBadge => {
  const category = getTaskCategory(task);
  
  if (category === TASK_CATEGORIES.AMUMAX) {
    return {
      label: "AMUMAX",
      variant: "outline",
      icon: Zap,
      className: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/20 dark:text-orange-300 dark:border-orange-700"
    };
  }
  if (category === TASK_CATEGORIES.COMSOL) {
    return {
      label: "COMSOL",
      variant: "outline",
      icon: Activity,
      className: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-700"
    };
  }
  return {
    label: "TASK",
    variant: "outline",
    icon: Server,
    className: "bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-900/20 dark:text-gray-300 dark:border-gray-700"
  };
};

export const TaskCard = React.memo<TaskCardProps>(({
  task,
  onDelete,
  onCancel,
  onView,
  isSelected = false,
  onSelectionToggle
}) => {
  const category = getTaskCategory(task);

  // Convert TaskQueueJob to BaseCardData
  const cardData: BaseCardData = {
    id: task.id,
    name: task.name,
    job_name: task.name,
    status: task.status,
    created_at: task.created_at,
    simulation_file: task.simulation_file,
    num_cpus: task.num_cpus,
    memory_gb: task.memory_gb,
    num_gpus: task.num_gpus,
    node: task.node,
    progress: task.progress,
    error_message: task.error_message
  };

  // Define resources for tasks
  const resources: ResourceInfo[] = [
    {
      label: "CPU",
      value: task.num_cpus || 0,
      icon: Cpu,
      unit: task.num_cpus === 1 ? 'rdzeń' : 'rdzeni'
    },
    {
      label: "RAM",
      value: task.memory_gb || 0,
      icon: HardDrive,
      unit: "GB"
    },
    {
      label: "GPU",
      value: task.num_gpus || 0,
      icon: Zap
    }
  ];

  // Define actions for tasks
  const actions: CardAction[] = [];

  // View/Details button
  actions.push({
    label: task.status === 'COMPLETED' ? 'Zobacz wyniki' : 'Szczegóły',
    icon: Eye,
    onClick: () => onView(task),
    variant: "default",
    tooltip: task.status === 'COMPLETED' ? 'Zobacz wyniki symulacji' : 'Zobacz szczegóły zadania',
    className: "bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white shadow-lg hover:shadow-xl border-0"
  });

  // Cancel button (for running/pending tasks)
  if (task.status === "PENDING" || task.status === "RUNNING") {
    actions.push({
      label: "Anuluj",
      icon: Square,
      onClick: () => onCancel(task),
      variant: "outline",
      tooltip: "Anuluj wykonanie zadania",
      className: "bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm border border-white/70 dark:border-slate-700/70 shadow-md hover:shadow-lg"
    });
  }

  // Delete button (always last)
  actions.push({
    label: "Usuń",
    icon: Trash2,
    onClick: () => onDelete(task),
    variant: "outline",
    tooltip: "Usuń zadanie z kolejki"
  });

  // Additional sections for tasks (could include logs preview, etc.)
  const additionalSections: React.ReactNode[] = [];

  // Add time information for tasks
  if (task.started_at) {
    const formatDuration = (start: string, end?: string) => {
      const startTime = new Date(start);
      const endTime = end ? new Date(end) : new Date();
      const diff = endTime.getTime() - startTime.getTime();
      
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      
      if (hours > 0) return `${hours}h ${minutes}m`;
      return `${minutes}m`;
    };

    additionalSections.push(
      <div key="timing" className="bg-white/[0.4] dark:bg-slate-900/[0.3] backdrop-blur-xl rounded-2xl p-4 border border-white/[0.3] dark:border-slate-700/[0.3] shadow-lg">
        <div className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3 font-bold">
          Informacje czasowe
        </div>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Rozpoczęto:</span>
            <span className="font-medium">{new Date(task.started_at).toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Czas trwania:</span>
            <span className="font-medium">{formatDuration(task.started_at, task.finished_at)}</span>
          </div>
          {task.time_limit && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Limit czasu:</span>
              <span className="font-medium">{task.time_limit}</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <ModernCardLayout
      data={cardData}
      title={task.name}
      subtitle={task.simulation_file?.split('/').pop()}
      typeIcon={category.icon}
      typeBadge={getTaskTypeBadge(task)}
      statusBadge={getTaskStatusBadge(task.status)}
      resources={resources}
      actions={actions}
      showProgressBar={task.status === "RUNNING"}
      progressValue={task.progress || 0}
      showElapsedTime={task.status === "RUNNING"}
      additionalSections={additionalSections}
      className="task-card"
      isSelected={isSelected}
      onSelectionToggle={onSelectionToggle ? () => onSelectionToggle(task.task_id) : undefined}
    />
  );
});

TaskCard.displayName = "TaskCard";
