"use client";

import React, { useEffect, useState } from "react";
import { Job } from "@/lib/types";
import { 
  Code2,
  Trash2,
  ExternalLink,
  Server,
  Zap,
  Cpu,
  HardDrive,
  Activity
} from "lucide-react";
import { formatContainerName, formatContainerNameShort } from "@/lib/container-utils";
import { ModernCardLayout, BaseCardData, CardAction, ResourceInfo, StatusBadge } from "./modern-card-layout";
import { ContainerCreationOverlay } from "./container-creation-overlay";

interface TunnelData {
  id: number;
  local_port: number;
  remote_port: number;
  remote_host: string;
  status: string;
  created_at: string;
}

interface ActiveJobData {
  job_id: string;
  name: string;
  state: string;
  node: string;
  node_count: number;
  time_left: string;
  time_used?: string;
  memory_requested?: string;
  memory?: string;
  start_time?: string;
  submit_time?: string;
}

interface JobCardProps {
  job: Job;
  activeJobData?: ActiveJobData;
  tunnels: TunnelData[];
  isProcessing: boolean;
  canUseCodeServer: boolean;
  onDelete: () => void;
  onOpenCodeServer: () => void;
  onDetails: () => void;
  formatDate: (date: string) => string;
}

// Calculate job progress
const calculateProgress = (job: Job): number => {
  if (job.type === 'task_queue' && job.progress !== undefined) {
    return Math.min(100, Math.max(0, job.progress));
  }

  if (job.status !== "RUNNING" || !job.created_at || !job.time_limit) {
    return 0;
  }
  
  try {
    const created = new Date(job.created_at);
    const now = new Date();
    const elapsedMs = now.getTime() - created.getTime();
    
    const timeParts = job.time_limit.split(':');
    if (timeParts.length !== 3) return 0;
    
    const [hours, minutes, seconds] = timeParts.map(Number);
    if (isNaN(hours) || isNaN(minutes) || isNaN(seconds)) return 0;
    
    const timeLimitMs = (hours * 3600 + minutes * 60 + seconds) * 1000;
    
    if (timeLimitMs <= 0) return 0;
    
    const progress = Math.min(100, Math.max(0, (elapsedMs / timeLimitMs) * 100));
    return progress;
  } catch (error) {
    console.error('Error calculating progress:', error);
    return 0;
  }
};

// Helper function to determine job type and format name
const getJobDisplayName = (job: Job): string => {
  if (job.type === 'task_queue') {
    return job.name || job.job_name || 'Task Queue Job';
  }
  return formatContainerName(job.job_name);
};

// Get status badge configuration
const getStatusBadge = (status: string): StatusBadge => {
  switch (status) {
    case "RUNNING":
      return { label: status, variant: "default", icon: Activity };
    case "PENDING":
    case "CONFIGURING":
      return { label: status, variant: "outline" };
    case "COMPLETED":
      return { label: status, variant: "secondary" };
    case "FAILED":
      return { label: status, variant: "destructive" };
    default:
      return { label: status, variant: "outline" };
  }
};

// Get type badge configuration
const getTypeBadge = (job: Job): StatusBadge | undefined => {
  if (job.type === 'task_queue') {
    return {
      label: "AMUMAX",
      variant: "outline",
      icon: Zap,
      className: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/20 dark:text-orange-300 dark:border-orange-700"
    };
  }
  return {
    label: "CONTAINER",
    variant: "outline",
    className: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-700"
  };
};

export const JobCard = React.memo<JobCardProps>(({
  job,
  activeJobData,
  tunnels,
  isProcessing,
  canUseCodeServer,
  onDelete,
  onOpenCodeServer,
  onDetails,
  formatDate
}) => {
  const [progress, setProgress] = useState<number>(calculateProgress(job));

  // Auto-update progress every second for running jobs
  useEffect(() => {
    if (job.status !== "RUNNING") return;
    
    const intervalId = setInterval(() => {
      setProgress(calculateProgress(job));
    }, 1000);
    
    return () => clearInterval(intervalId);
  }, [job.status, job.created_at, job.time_limit]);

  // Convert Job to BaseCardData
  const cardData: BaseCardData = {
    id: job.id,
    name: job.name,
    job_name: job.job_name,
    status: job.status,
    created_at: job.created_at,
    simulation_file: job.simulation_file,
    num_cpus: job.num_cpus,
    memory_gb: job.memory_gb,
    num_gpus: job.num_gpus,
    node: activeJobData?.node || job.node || undefined,
    progress: job.progress,
    error_message: undefined
  };

  // Define resources
  const resources: ResourceInfo[] = [
    {
      label: "CPU",
      value: job.num_cpus || 0,
      icon: Cpu,
      unit: job.num_cpus === 1 ? 'rdzeń' : 'rdzeni'
    },
    {
      label: "RAM",
      value: job.memory_gb || 0,
      icon: HardDrive,
      unit: "GB"
    },
    {
      label: "GPU",
      value: job.num_gpus || 0,
      icon: Zap
    }
  ];

  // Define actions
  const actions: CardAction[] = [];

  if (job.type === 'task_queue') {
    // Task queue jobs - show results or progress
    actions.push({
      label: job.status === 'COMPLETED' ? 'Zobacz wyniki' : 'Szczegóły',
      icon: Activity,
      onClick: onDetails,
      variant: "default",
      tooltip: job.status === 'COMPLETED' ? 'Zobacz wyniki symulacji' : 'Zobacz szczegóły zadania',
      className: "bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white shadow-lg hover:shadow-xl border-0"
    });
  } else {
    // Container jobs - show Code Server
    actions.push({
      label: canUseCodeServer ? "Otwórz IDE" : "Code Server",
      icon: Code2,
      onClick: onOpenCodeServer,
      variant: canUseCodeServer ? "default" : "outline",
      disabled: !canUseCodeServer || isProcessing,
      loading: isProcessing,
      tooltip: !canUseCodeServer ? 
        "Kontener musi być w stanie RUNNING, aby uruchomić Code Server" : 
        "Otwórz interfejs Code Server w nowej karcie",
      className: canUseCodeServer ? 
        "bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white shadow-lg hover:shadow-xl border-0" : 
        "bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm border border-white/70 dark:border-slate-700/70 shadow-md hover:shadow-lg"
    });

    // Details button for containers
    actions.push({
      label: "Szczegóły",
      icon: ExternalLink,
      onClick: onDetails,
      variant: "outline",
      tooltip: "Zobacz szczegółowe informacje o kontenerze",
      className: "bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm border border-white/70 dark:border-slate-700/70 shadow-md hover:shadow-lg"
    });
  }

  // Delete button (always last)
  actions.push({
    label: "Usuń",
    icon: Trash2,
    onClick: onDelete,
    variant: "outline",
    disabled: isProcessing,
    loading: isProcessing,
    tooltip: `Usuń ${job.type === 'task_queue' ? 'zadanie' : 'kontener'}`
  });

  // Additional sections for containers (tunnels)
  const additionalSections: React.ReactNode[] = [];
  
  if (job.type !== 'task_queue' && tunnels.length > 0) {
    additionalSections.push(
      <div key="tunnels" className="bg-white/[0.4] dark:bg-slate-900/[0.3] backdrop-blur-xl rounded-2xl p-4 border border-white/[0.3] dark:border-slate-700/[0.3] shadow-lg">
        <div className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3 font-bold">
          Dostęp sieciowy
        </div>
        <div className="space-y-2">
          {tunnels.map((tunnel) => (
            <div key={tunnel.id} className="bg-white/90 dark:bg-slate-900/50 backdrop-blur-sm p-3 rounded-xl border border-white/50 dark:border-slate-700/50 shadow-sm hover:shadow-md transition-all duration-200">
              <div className="flex items-center gap-3">
                <div className={`h-2.5 w-2.5 rounded-full ${
                  tunnel.status === 'ACTIVE' ? 'bg-emerald-500 dark:bg-emerald-400 shadow-sm' : 
                  tunnel.status === 'DEAD' ? 'bg-red-500 dark:bg-red-400' : 'bg-amber-500 dark:bg-amber-400'
                }`} />
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex-1">
                  Tunel {tunnel.status === 'ACTIVE' ? 'aktywny' : tunnel.status === 'DEAD' ? 'nieaktywny' : 'w trakcie łączenia'}
                </span>
                <span className="text-xs bg-white/95 dark:bg-slate-800/95 border border-white/50 dark:border-slate-600/50 px-2 py-1 rounded ml-auto">
                  {tunnel.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Overlay for container creation
  const overlay = (job.status === "PENDING" || job.status === "CONFIGURING") ? (
    <ContainerCreationOverlay 
      key={job.status}
      status={job.status}
      jobName={job.job_name}
      onDelete={onDelete}
    />
  ) : undefined;

  return (
    <ModernCardLayout
      data={cardData}
      title={getJobDisplayName(job)}
      subtitle={job.simulation_file?.split('/').pop()}
      typeIcon={job.type === 'task_queue' ? Zap : Server}
      typeBadge={getTypeBadge(job)}
      statusBadge={getStatusBadge(job.status)}
      resources={resources}
      actions={actions}
      showProgressBar={job.status === "RUNNING"}
      progressValue={progress}
      showElapsedTime={job.status === "RUNNING"}
      additionalSections={additionalSections}
      overlay={overlay}
      formatDate={formatDate}
    />
  );
});

JobCard.displayName = "JobCard";
