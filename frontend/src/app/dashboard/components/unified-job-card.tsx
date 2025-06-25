"use client";

import React, { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { motion, AnimatePresence } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Clock, 
  AlertCircle,  
  CheckCircle2, 
  XCircle, 
  Pause,
  Activity,
  Server,
  Code2,
  Zap,
  Trash2,
  ExternalLink,
  Calendar,
  Cpu,
  HardDrive,
  Monitor,
  Loader2,
  Eye,
  Square,
  Network,
  Play,
  Settings
} from "lucide-react";
import { Job, TaskQueueJob } from "@/lib/types";
import { LiveTimer } from "./live-timer";
import { ContainerCreationOverlay } from "./container-creation-overlay";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useDomainStatus } from "@/hooks/use-domain-status";
import { formatContainerName, formatContainerNameShort } from "@/lib/container-utils";

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

interface UnifiedJobCardProps {
  job?: Job;
  task?: TaskQueueJob;
  cardType: 'job' | 'task';
  activeJobData?: ActiveJobData;
  tunnels?: TunnelData[];
  isProcessing?: boolean;
  canUseCodeServer?: boolean;
  showProgressAnimation?: boolean;
  onDelete: () => void;
  onOpenCodeServer?: () => void;
  onDetails?: () => void;
  onCancel?: () => void;
  formatDate?: (date: string) => string;
}

// Status configurations for jobs
const JOB_STATUS_CONFIG = {
  PENDING: { 
    icon: Clock, 
    color: "text-yellow-600", 
    bgColor: "bg-yellow-50", 
    borderColor: "border-yellow-200",
    variant: "secondary" as const,
    gradient: "from-yellow-50 to-orange-50"
  },
  CONFIGURING: { 
    icon: Settings, 
    color: "text-blue-600", 
    bgColor: "bg-blue-50", 
    borderColor: "border-blue-200",
    variant: "secondary" as const,
    gradient: "from-blue-50 to-indigo-50"
  },
  RUNNING: { 
    icon: Play, 
    color: "text-green-600", 
    bgColor: "bg-green-50", 
    borderColor: "border-green-200",
    variant: "default" as const,
    gradient: "from-green-50 to-emerald-50"
  },
  COMPLETED: { 
    icon: CheckCircle2, 
    color: "text-green-600", 
    bgColor: "bg-green-50", 
    borderColor: "border-green-200",
    variant: "secondary" as const,
    gradient: "from-green-50 to-teal-50"
  },
  FAILED: { 
    icon: XCircle, 
    color: "text-red-600", 
    bgColor: "bg-red-50", 
    borderColor: "border-red-200",
    variant: "destructive" as const,
    gradient: "from-red-50 to-pink-50"
  },
  CANCELLED: { 
    icon: XCircle, 
    color: "text-gray-600", 
    bgColor: "bg-gray-50", 
    borderColor: "border-gray-200",
    variant: "secondary" as const,
    gradient: "from-gray-50 to-slate-50"
  },
  TIMEOUT: { 
    icon: Clock, 
    color: "text-orange-600", 
    bgColor: "bg-orange-50", 
    borderColor: "border-orange-200",
    variant: "secondary" as const,
    gradient: "from-orange-50 to-red-50"
  }
};

// Status configurations for tasks
const TASK_STATUS_CONFIG = {
  PENDING: { 
    icon: Clock, 
    color: "text-yellow-600", 
    bgColor: "bg-yellow-50", 
    borderColor: "border-yellow-200",
    variant: "secondary" as const,
    gradient: "from-yellow-50 to-orange-50"
  },
  RUNNING: { 
    icon: Activity, 
    color: "text-green-600", 
    bgColor: "bg-green-50", 
    borderColor: "border-green-200",
    variant: "default" as const,
    gradient: "from-green-50 to-emerald-50"
  },
  COMPLETED: { 
    icon: CheckCircle2, 
    color: "text-green-600", 
    bgColor: "bg-green-50", 
    borderColor: "border-green-200",
    variant: "secondary" as const,
    gradient: "from-green-50 to-teal-50"
  },
  FAILED: { 
    icon: XCircle, 
    color: "text-red-600", 
    bgColor: "bg-red-50", 
    borderColor: "border-red-200",
    variant: "destructive" as const,
    gradient: "from-red-50 to-pink-50"
  },
  CANCELLED: { 
    icon: XCircle, 
    color: "text-gray-600", 
    bgColor: "bg-gray-50", 
    borderColor: "border-gray-200",
    variant: "secondary" as const,
    gradient: "from-gray-50 to-slate-50"
  }
};

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

// Helper functions
const getStatusConfig = (status: string, cardType: 'job' | 'task') => {
  const configs = cardType === 'job' ? JOB_STATUS_CONFIG : TASK_STATUS_CONFIG;
  return configs[status as keyof typeof configs] || configs.PENDING;
};

const getTaskCategory = (task: TaskQueueJob) => {
  if (task.name.toLowerCase().includes('amp_') || task.task_type?.toLowerCase().includes('amuc_amumax_')) {
    return 'AMUMAX';
  }
  if (task.task_type?.toLowerCase().includes('comsol')) {
    return 'COMSOL';
  }
  return 'DEFAULT';
};

const getJobTypeIcon = (job: Job) => {
  if (job.type === 'task_queue') {
    return <Zap className="h-4 w-4 text-purple-600" />;
  }
  return <Server className="h-4 w-4 text-blue-600" />;
};

const getJobDisplayName = (job: Job) => {
  return formatContainerNameShort(job.job_name);
};

const calculateProgress = (job: Job) => {
  if (job.status !== "RUNNING") return 0;
  
  if (!job.time_limit) return 0;
  
  const now = new Date();
  const created = new Date(job.created_at);
  const elapsedMs = now.getTime() - created.getTime();
  const elapsedHours = elapsedMs / (1000 * 60 * 60);
  
  const timeLimitHours = parseFloat(job.time_limit);
  const progressPercent = Math.min(100, (elapsedHours / timeLimitHours) * 100);
  
  return Math.max(0, progressPercent);
};

export const UnifiedJobCard = React.memo(({
  job,
  task,
  cardType,
  activeJobData,
  tunnels = [],
  isProcessing = false,
  canUseCodeServer = false,
  showProgressAnimation = true,
  onDelete,
  onOpenCodeServer,
  onDetails,
  onCancel,
  formatDate = (date: string) => new Date(date).toLocaleString()
}: UnifiedJobCardProps) => {
  // Unified data object
  const data = cardType === 'job' ? job : task;
  
  if (!data) {
    return null;
  }

  const status = cardType === 'job' ? job!.status : task!.status;
  const statusConfig = getStatusConfig(status, cardType);
  const StatusIcon = statusConfig.icon;
  const itemStatusKey = `${data.id}-${status}`;

  const [progress, setProgress] = React.useState<number>(
    cardType === 'job' ? calculateProgress(job!) : (task!.progress || 0)
  );

  // Domain status for jobs
  const { domainStatus, isLoading: isDomainLoading } = useDomainStatus(
    cardType === 'job' ? job!.id : 0,
    cardType === 'job' && job!.status === 'RUNNING'
  );

  React.useEffect(() => {
    if (cardType === 'job' && job!.status === "RUNNING") {
      const interval = setInterval(() => {
        setProgress(calculateProgress(job!));
      }, 1000);
      
      return () => clearInterval(interval);
    }
  }, [cardType, job, task]);

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

  const taskCategory = cardType === 'task' ? TASK_CATEGORIES[getTaskCategory(task!)] : null;

  return (
    <motion.div
      key={itemStatusKey}
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.2 }}
      className="relative group"
    >
      {/* Container creation overlay for jobs */}
      {cardType === 'job' && (job!.status === "PENDING" || job!.status === "CONFIGURING") && (
        <AnimatePresence>
          <ContainerCreationOverlay
            key={job!.status}
            status={job!.status}
            jobName={job!.job_name}
          />
        </AnimatePresence>
      )}

      <Card className={`relative overflow-hidden transition-all duration-300 group-hover:shadow-lg bg-gradient-to-br ${statusConfig.gradient}`}>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              {cardType === 'job' ? (
                getJobTypeIcon(job!)
              ) : (
                taskCategory && <taskCategory.icon className={`h-4 w-4 ${taskCategory.color}`} />
              )}
              <div className="min-w-0 flex-1">
                <CardTitle className="text-base font-semibold truncate" title={cardType === 'job' ? getJobDisplayName(job!) : task!.name}>
                  {cardType === 'job' ? getJobDisplayName(job!) : task!.name}
                </CardTitle>
                {cardType === 'job' && job!.simulation_file && (
                  <p className="text-xs text-muted-foreground truncate" title={job!.simulation_file}>
                    {job!.simulation_file.split('/').pop()}
                  </p>
                )}
                {cardType === 'task' && taskCategory && (
                  <p className="text-xs text-muted-foreground">
                    {taskCategory.label}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 ml-2">
              <Badge variant={statusConfig.variant} className="flex items-center gap-1 text-xs">
                <StatusIcon className="h-3 w-3" />
                {status}
              </Badge>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Progress bar - only for running tasks/jobs */}
          {status === "RUNNING" && (
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span>Progress</span>
                <span>{Math.round(progress)}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                <motion.div
                  className="bg-gradient-to-r from-blue-500 to-green-500 h-2 rounded-full"
                  initial={{ width: "0%" }}
                  animate={{ width: `${progress}%` }}
                  transition={{ 
                    duration: showProgressAnimation ? 0.5 : 0,
                    ease: "easeInOut" 
                  }}
                />
              </div>
            </div>
          )}

          {/* Resource information */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="flex items-center gap-1">
              <Cpu className="h-3 w-3 text-muted-foreground" />
              <span>{cardType === 'job' ? (job!.num_cpus || 'N/A') : (task!.num_cpus || 'N/A')} CPU</span>
            </div>
            <div className="flex items-center gap-1">
              <HardDrive className="h-3 w-3 text-muted-foreground" />
              <span>{cardType === 'job' ? (job!.memory_gb || 'N/A') : (task!.memory_gb || 'N/A')}GB</span>
            </div>
            <div className="flex items-center gap-1">
              <Zap className="h-3 w-3 text-muted-foreground" />
              <span>{cardType === 'job' ? (job!.num_gpus || 0) : (task!.num_gpus || 0)} GPU</span>
            </div>
            <div className="flex items-center gap-1">
              <Server className="h-3 w-3 text-muted-foreground" />
              <span>{cardType === 'job' ? (activeJobData?.node || job!.node || "N/A") : (task!.node || "N/A")}</span>
            </div>
          </div>

          {/* Time information */}
          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Created:</span>
              <span>{formatTime(data.created_at)}</span>
            </div>
            {cardType === 'task' && task!.started_at && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Duration:</span>
                <span>{formatDuration(task!.started_at, task!.finished_at || null)}</span>
              </div>
            )}
          </div>

          {/* Error message */}
          {cardType === 'task' && task!.error_message && (
            <div className="p-2 bg-red-50 border border-red-200 rounded text-xs">
              <p className="text-red-600 truncate" title={task!.error_message}>
                {task!.error_message}
              </p>
            </div>
          )}

          {/* Tunnel information for jobs */}
          {cardType === 'job' && tunnels.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Active Tunnels:</p>
              <div className="space-y-1">
                {tunnels.map((tunnel) => (
                  <div key={tunnel.id} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1">
                      <Network className="h-3 w-3 text-green-500" />
                      <span>Port {tunnel.local_port}</span>
                    </div>
                    <Badge variant="secondary" className="text-xs">
                      {tunnel.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Domain readiness for running jobs */}
          {cardType === 'job' && job!.status === 'RUNNING' && domainStatus && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Domain Status:</p>
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1">
                  {domainStatus.domain_ready ? (
                    <CheckCircle2 className="h-3 w-3 text-green-500" />
                  ) : isDomainLoading ? (
                    <Loader2 className="h-3 w-3 text-blue-500 animate-spin" />
                  ) : (
                    <Clock className="h-3 w-3 text-yellow-500" />
                  )}
                  <span className="truncate max-w-32" title={domainStatus.domain}>
                    {domainStatus.domain}
                  </span>
                </div>
                <Badge variant={domainStatus.domain_ready ? "default" : "secondary"} className="text-xs">
                  {domainStatus.domain_ready ? "Ready" : "Preparing"}
                </Badge>
              </div>
              {domainStatus.domain_ready && domainStatus.url && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full mt-1"
                  onClick={() => window.open(domainStatus.url, '_blank')}
                >
                  <ExternalLink className="h-3 w-3 mr-1" />
                  Open Domain
                </Button>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            {/* View/Details button */}
            {onDetails && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="flex-1"
                      onClick={onDetails}
                    >
                      <Eye className="h-3 w-3 mr-1" />
                      {cardType === 'job' ? 'Details' : 'View'}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {cardType === 'job' ? 'View Job Details' : 'View Task Details'}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}

            {/* Code Server button (only for jobs) */}
            {cardType === 'job' && canUseCodeServer && onOpenCodeServer && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="flex-1"
                      onClick={onOpenCodeServer}
                      disabled={isProcessing}
                    >
                      {isProcessing ? (
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      ) : domainStatus?.domain_ready ? (
                        <CheckCircle2 className="h-3 w-3 mr-1 text-green-500" />
                      ) : (
                        <Code2 className="h-3 w-3 mr-1" />
                      )}
                      {domainStatus?.domain_ready ? 'Ready' : 'Code'}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {domainStatus?.domain_ready 
                      ? 'Domain is ready - Open Code Server' 
                      : 'Open Code Server (domain preparing)'}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}

            {/* Cancel button (for running/pending items) */}
            {((status === "PENDING" || status === "RUNNING") && onCancel) && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={onCancel}
                      className="flex-1"
                    >
                      <Square className="h-3 w-3 mr-1" />
                      Cancel
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Cancel {cardType === 'job' ? 'Job' : 'Task'}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}

            {/* Delete button */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={onDelete}
                    className="flex-1 text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="h-3 w-3 mr-1" />
                    Delete
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Delete {cardType === 'job' ? 'Job' : 'Task'}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
});

UnifiedJobCard.displayName = "UnifiedJobCard";

// Export both the original ModernJobCard for backwards compatibility and the new UnifiedJobCard
export const ModernJobCard = React.memo(({
  job,
  activeJobData,
  tunnels,
  isProcessing,
  canUseCodeServer,
  onDelete,
  onOpenCodeServer,
  onDetails,
  formatDate
}: {
  job: Job;
  activeJobData?: ActiveJobData;
  tunnels: TunnelData[];
  isProcessing: boolean;
  canUseCodeServer: boolean;
  onDelete: () => void;
  onOpenCodeServer: () => void;
  onDetails: () => void;
  formatDate: (date: string) => string;
}) => {
  return (
    <UnifiedJobCard
      job={job}
      cardType="job"
      activeJobData={activeJobData}
      tunnels={tunnels}
      isProcessing={isProcessing}
      canUseCodeServer={canUseCodeServer}
      onDelete={onDelete}
      onOpenCodeServer={onOpenCodeServer}
      onDetails={onDetails}
      formatDate={formatDate}
    />
  );
});

ModernJobCard.displayName = "ModernJobCard";
