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
  Play, 
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
  Network,
  Loader2
} from "lucide-react";
import { Job } from "@/lib/types";
import { LiveTimer } from "./live-timer";
import { ContainerCreationOverlay } from "./container-creation-overlay";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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

interface ModernJobCardProps {
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

// Auto-updating timer component for real-time display
const AutoTimer: React.FC<{ createdAt: string }> = ({ createdAt }) => {
  const [timeElapsed, setTimeElapsed] = useState<string>("00:00:00");

  useEffect(() => {
    const calculateElapsed = () => {
      const created = new Date(createdAt);
      const now = new Date();
      const diffInSeconds = Math.floor((now.getTime() - created.getTime()) / 1000);
      
      const hours = Math.floor(diffInSeconds / 3600);
      const minutes = Math.floor((diffInSeconds % 3600) / 60);
      const seconds = diffInSeconds % 60;
      
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    };

    // Initial calculation
    setTimeElapsed(calculateElapsed());

    // Update every second
    const interval = setInterval(() => {
      setTimeElapsed(calculateElapsed());
    }, 1000);

    return () => clearInterval(interval);
  }, [createdAt]);

  return (
    <span className="font-mono font-bold text-slate-800 dark:text-slate-100 tabular-nums leading-none">
      {timeElapsed}
    </span>
  );
};

// Calculate job progress with improved error handling
const calculateProgress = (job: Job): number => {
  if (job.status !== "RUNNING" || !job.created_at || !job.time_limit) {
    return 0;
  }
  
  try {
    const created = new Date(job.created_at);
    const now = new Date();
    const elapsedMs = now.getTime() - created.getTime();
    
    // Parse time limit (format: HH:MM:SS)
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

// Enhanced glassmorphism styling optimized for both light and dark mode
const getStatusGradient = (status: string) => {
  const baseClasses = "backdrop-blur-2xl border transition-all duration-700 hover:scale-[1.015] shadow-xl hover:shadow-2xl relative overflow-hidden";
  
  switch (status) {
    case "RUNNING":
      return `${baseClasses} bg-gradient-to-br from-emerald-50/95 via-white/90 to-emerald-50/80 dark:from-emerald-950/30 dark:via-slate-900/80 dark:to-emerald-950/20 border-emerald-200/60 dark:border-emerald-500/15 hover:border-emerald-300/80 dark:hover:border-emerald-400/25 shadow-emerald-500/10 dark:shadow-emerald-500/5 hover:shadow-emerald-500/20 dark:hover:shadow-emerald-400/8`;
    case "PENDING":
      return `${baseClasses} bg-gradient-to-br from-amber-50/95 via-white/90 to-amber-50/80 dark:from-amber-950/30 dark:via-slate-900/80 dark:to-amber-950/20 border-amber-200/60 dark:border-amber-500/15 hover:border-amber-300/80 dark:hover:border-amber-400/25 shadow-amber-500/10 dark:shadow-amber-500/5 hover:shadow-amber-500/20 dark:hover:shadow-amber-400/8`;
    case "CONFIGURING":
      return `${baseClasses} bg-gradient-to-br from-blue-50/95 via-white/90 to-blue-50/80 dark:from-blue-950/30 dark:via-slate-900/80 dark:to-blue-950/20 border-blue-200/60 dark:border-blue-500/15 hover:border-blue-300/80 dark:hover:border-blue-400/25 shadow-blue-500/10 dark:shadow-blue-500/5 hover:shadow-blue-500/20 dark:hover:shadow-blue-400/8`;
    case "COMPLETED":
      return `${baseClasses} bg-gradient-to-br from-slate-50/95 via-white/90 to-slate-50/80 dark:from-slate-950/30 dark:via-slate-900/80 dark:to-slate-950/20 border-slate-200/60 dark:border-slate-600/15 hover:border-slate-300/80 dark:hover:border-slate-500/25 shadow-slate-500/10 dark:shadow-slate-500/5 hover:shadow-slate-500/20 dark:hover:shadow-slate-400/8`;
    case "FAILED":
      return `${baseClasses} bg-gradient-to-br from-red-50/95 via-white/90 to-red-50/80 dark:from-red-950/30 dark:via-slate-900/80 dark:to-red-950/20 border-red-200/60 dark:border-red-500/15 hover:border-red-300/80 dark:hover:border-red-400/25 shadow-red-500/10 dark:shadow-red-500/5 hover:shadow-red-500/20 dark:hover:shadow-red-400/8`;
    default:
      return `${baseClasses} bg-gradient-to-br from-slate-50/95 via-white/90 to-slate-50/80 dark:from-slate-950/30 dark:via-slate-900/80 dark:to-slate-950/20 border-slate-200/60 dark:border-slate-600/15 hover:border-slate-300/80 dark:hover:border-slate-500/25 shadow-slate-500/10 dark:shadow-slate-500/5 hover:shadow-slate-500/20 dark:hover:shadow-slate-400/8`;
  }
};

// Enhanced status icons with refined animations
const getStatusIcon = (status: string) => {
  switch (status) {
    case "RUNNING":
      return (
        <div className="relative flex items-center justify-center">
          <div className="absolute h-8 w-8 rounded-full bg-emerald-400/20 dark:bg-emerald-400/10 animate-ping"></div>
          <div className="relative p-2.5 bg-emerald-100/80 dark:bg-emerald-900/30 rounded-full border border-emerald-200/50 dark:border-emerald-500/20 shadow-inner">
            <Activity className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          </div>
        </div>
      );
    case "PENDING":
      return (
        <div className="p-2.5 bg-amber-100/80 dark:bg-amber-900/30 rounded-full border border-amber-200/50 dark:border-amber-500/20 shadow-inner">
          <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        </div>
      );
    case "CONFIGURING":
      return (
        <div className="p-2.5 bg-blue-100/80 dark:bg-blue-900/30 rounded-full border border-blue-200/50 dark:border-blue-500/20 shadow-inner">
          <Loader2 className="h-4 w-4 animate-spin text-blue-600 dark:text-blue-400" />
        </div>
      );
    case "COMPLETED":
      return (
        <div className="p-2.5 bg-emerald-100/80 dark:bg-emerald-900/30 rounded-full border border-emerald-200/50 dark:border-emerald-500/20 shadow-inner">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
        </div>
      );
    case "FAILED":
      return (
        <div className="p-2.5 bg-red-100/80 dark:bg-red-900/30 rounded-full border border-red-200/50 dark:border-red-500/20 shadow-inner">
          <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
        </div>
      );
    case "CANCELLED":
      return (
        <div className="p-2.5 bg-slate-100/80 dark:bg-slate-900/30 rounded-full border border-slate-200/50 dark:border-slate-500/20 shadow-inner">
          <Pause className="h-4 w-4 text-slate-600 dark:text-slate-400" />
        </div>
      );
    default:
      return (
        <div className="p-2.5 bg-slate-100/80 dark:bg-slate-900/30 rounded-full border border-slate-200/50 dark:border-slate-500/20 shadow-inner">
          <AlertCircle className="h-4 w-4 text-slate-600 dark:text-slate-400" />
        </div>
      );
  }
};

// Status badge variant mapping
const getStatusBadgeVariant = (status: string): "default" | "secondary" | "destructive" | "outline" => {
  switch (status) {
    case "RUNNING":
      return "default";
    case "PENDING":
    case "CONFIGURING":
      return "outline";
    case "COMPLETED":
      return "secondary";
    case "FAILED":
      return "destructive";
    default:
      return "outline";
  }
};

// Format relative time
const getRelativeTimeString = (dateString: string): string => {
  try {
    if (!dateString) return "unknown";
    
    const date = new Date(dateString);
    const now = new Date();
    
    if (isNaN(date.getTime())) return "unknown";
    
    const diffMs = now.getTime() - date.getTime();
    
    if (diffMs < 0) return "future";
    
    const diffMins = Math.floor(diffMs / (1000 * 60));
    if (diffMins < 1) return "now";
    if (diffMins < 60) return `${diffMins}m ago`;
    
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return `${Math.floor(diffDays / 7)}w ago`;
  } catch (error) {
    console.error('Error formatting relative time:', error);
    return "unknown";
  }
};

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
}: ModernJobCardProps) => {
  
  const statusIcon = getStatusIcon(job.status);
  const statusVariant = getStatusBadgeVariant(job.status);
  const gradientClass = getStatusGradient(job.status);
  const jobStatusKey = `${job.id}-${job.status}`;
  
  const [progress, setProgress] = React.useState<number>(calculateProgress(job));
  
  // Auto-update progress every second for running jobs
  React.useEffect(() => {
    if (job.status !== "RUNNING") return;
    
    const intervalId = setInterval(() => {
      setProgress(calculateProgress(job));
    }, 1000);
    
    return () => clearInterval(intervalId);
  }, [job.status, job.created_at, job.time_limit]);

  const handleDeleteClick = () => {
    onDelete();
  };

  return (
    <motion.div
      key={jobStatusKey}
      layout
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -20, scale: 0.95, transition: { duration: 0.2 } }}
      transition={{ 
        type: "spring", 
        stiffness: 300, 
        damping: 30, 
        duration: 0.4 
      }}
      className="relative group"
    >
      <Card className={`${gradientClass} overflow-hidden relative`}>
        {/* Enhanced gradient overlay for professional depth */}
        <div className="absolute inset-0 bg-gradient-to-br from-white/[0.05] via-white/[0.02] to-transparent dark:from-white/[0.02] dark:via-white/[0.01] dark:to-transparent pointer-events-none" />
        
        {/* Subtle inner glow for premium feel */}
        <div className="absolute inset-0 bg-gradient-to-t from-transparent via-transparent to-white/[0.02] dark:to-white/[0.008] pointer-events-none" />
        
        {/* Container Creation Overlay */}
        <AnimatePresence mode="wait">
          {(job.status === "PENDING" || job.status === "CONFIGURING") && (
            <ContainerCreationOverlay 
              key={job.status}
              status={job.status}
              jobName={job.job_name}
              onDelete={handleDeleteClick}
            />
          )}
        </AnimatePresence>

        <CardHeader className="pb-4 relative z-10">
          <div className="flex items-start justify-between">
            <div className="flex items-center space-x-3">
              {statusIcon}
              <CardTitle className="text-lg font-bold bg-gradient-to-r from-slate-900 via-slate-800 to-slate-700 dark:from-white dark:via-slate-100 dark:to-slate-200 bg-clip-text text-transparent transition-all duration-300">
                {job.job_name}
              </CardTitle>
            </div>
            <Badge 
              variant={statusVariant} 
              className="flex items-center gap-2 px-3 py-1.5 font-semibold text-xs bg-white/95 dark:bg-slate-800/95 backdrop-blur-xl border border-white/60 dark:border-slate-700/60 shadow-md text-slate-700 dark:text-slate-200"
            >
              {job.status}
            </Badge>
          </div>
          
          {/* Enhanced info bar with premium styling */}
          <div className="flex items-center justify-between text-sm mt-3 gap-3">
            <div className="flex items-center space-x-2 bg-white/85 dark:bg-slate-800/85 px-3 py-2 rounded-full backdrop-blur-xl border border-white/60 dark:border-slate-700/60 shadow-sm">
              <Server className="h-3.5 w-3.5 text-slate-600 dark:text-slate-300" />
              <span className="font-bold text-slate-700 dark:text-slate-200 text-xs">ID: {job.id}</span>
            </div>
            <div className="flex items-center space-x-2 bg-white/85 dark:bg-slate-800/85 px-3 py-2 rounded-full backdrop-blur-xl border border-white/60 dark:border-slate-700/60 shadow-sm">
              <Monitor className="h-3.5 w-3.5 text-slate-600 dark:text-slate-300" />
              <span className="font-bold text-slate-700 dark:text-slate-200 truncate max-w-[100px] text-xs">{job.template_name}</span>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6 relative z-10">
          {/* Enhanced Resource Section with refined glassmorphism */}
          <div className="bg-white/[0.4] dark:bg-slate-900/[0.3] backdrop-blur-xl rounded-2xl p-4 border border-white/[0.3] dark:border-slate-700/[0.3] shadow-lg">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2 text-sm">
                <div className="p-1.5 bg-blue-500/[0.12] dark:bg-blue-400/[0.15] rounded-lg border border-blue-200/[0.5] dark:border-blue-400/[0.3]">
                  <Cpu className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                </div>
                Zasoby obliczeniowe
              </h4>
              
              {job.created_at && (
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 bg-white/[0.8] dark:bg-slate-800/[0.8] px-2.5 py-1 rounded-full border border-white/[0.5] dark:border-slate-700/[0.6] backdrop-blur-sm">
                  {getRelativeTimeString(job.created_at)}
                </span>
              )}
            </div>
            
            <div className="grid grid-cols-2 gap-2.5">
              <div className="bg-white/[0.85] dark:bg-slate-900/[0.45] backdrop-blur-sm p-3 rounded-lg border border-white/[0.5] dark:border-slate-700/[0.35] shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-1 bg-blue-500/[0.12] dark:bg-blue-400/[0.15] rounded-md">
                      <Cpu className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                    </div>
                    <span className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 font-bold">
                      CPU
                    </span>
                  </div>
                  <span className="text-sm font-bold text-slate-800 dark:text-slate-100">
                    {job.num_cpus} {job.num_cpus === 1 ? 'rdzeń' : 'rdzeni'}
                  </span>
                </div>
              </div>
              
              <div className="bg-white/[0.85] dark:bg-slate-900/[0.45] backdrop-blur-sm p-3 rounded-lg border border-white/[0.5] dark:border-slate-700/[0.35] shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-1 bg-amber-500/[0.12] dark:bg-amber-400/[0.15] rounded-md">
                      <HardDrive className="h-3 w-3 text-amber-600 dark:text-amber-400" />
                    </div>
                    <span className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 font-bold">
                      RAM
                    </span>
                  </div>
                  <span className="text-sm font-bold text-slate-800 dark:text-slate-100">
                    {job.memory_gb} GB
                  </span>
                </div>
              </div>
              
              <div className="bg-white/[0.85] dark:bg-slate-900/[0.45] backdrop-blur-sm p-3 rounded-lg border border-white/[0.5] dark:border-slate-700/[0.35] shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-1 bg-purple-500/[0.12] dark:bg-purple-400/[0.15] rounded-md">
                      <Zap className="h-3 w-3 text-purple-600 dark:text-purple-400" />
                    </div>
                    <span className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 font-bold">
                      GPU
                    </span>
                  </div>
                  <span className="text-sm font-bold text-slate-800 dark:text-slate-100">
                    {job.num_gpus || 0}
                  </span>
                </div>
              </div>
              
              {job.node && (
                <div className="bg-white/[0.85] dark:bg-slate-900/[0.45] backdrop-blur-sm p-3 rounded-lg border border-white/[0.5] dark:border-slate-700/[0.35] shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-1 bg-slate-500/[0.12] dark:bg-slate-400/[0.15] rounded-md">
                        <Server className="h-3 w-3 text-slate-600 dark:text-slate-400" />
                      </div>
                      <span className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 font-bold">
                        WĘZEŁ
                      </span>
                    </div>
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-100 font-mono truncate max-w-[60px]">
                      {job.node}
                    </span>
                  </div>
                </div>
              )}
            </div>
            {/* Network access section within resources */}
            {(job.port || tunnels.length > 0) && (
              <div className="mt-4 pt-4 border-t border-white/40 dark:border-slate-700/50">
                <div className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3 font-bold">
                  Dostęp sieciowy
                </div>
                
                {tunnels.length > 0 && (
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
                          <Badge variant={tunnel.status === 'ACTIVE' ? "default" : "secondary"} className="text-xs bg-white/95 dark:bg-slate-800/95 border border-white/50 dark:border-slate-600/50 ml-auto">
                            {tunnel.status}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Enhanced progress bar for running jobs with remaining time */}
            {job.status === "RUNNING" && (
              <div className="mt-4 pt-4 border-t border-white/40 dark:border-slate-700/50">
                <div className="flex items-center justify-between text-xs mb-3">
                  <span className="text-slate-600 dark:text-slate-300 font-semibold">Postęp wykonania</span>
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-200 bg-white/80 dark:bg-slate-700/80 px-3 py-1.5 rounded-full border border-white/50 dark:border-slate-600/50 backdrop-blur-sm">
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-3 w-3 text-slate-600 dark:text-slate-400" />
                      {activeJobData?.time_left ? (
                        <LiveTimer initialTime={activeJobData.time_left} />
                      ) : (
                        <AutoTimer createdAt={job.created_at} />
                      )}
                    </div>
                    <span className="text-slate-400 dark:text-slate-500">-</span>
                    <span className="tabular-nums">{Math.round(progress)}%</span>
                    <span className="text-slate-400 dark:text-slate-500">z</span>
                    <span className="font-mono tabular-nums">{job.time_limit || "24:00:00"}</span>
                  </div>
                </div>
                <div className="h-2 w-full bg-slate-200/80 dark:bg-slate-700/80 rounded-full overflow-hidden backdrop-blur-sm shadow-inner">
                  <motion.div 
                    className="h-full bg-gradient-to-r from-blue-500 via-purple-500 to-emerald-500 rounded-full relative"
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.8, ease: "easeInOut" }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent rounded-full" />
                  </motion.div>
                </div>
              </div>
            )}
          </div>

          {/* Enhanced Action buttons */}
          <div className="flex items-center justify-between pt-3 mt-2 border-t border-white/40 dark:border-slate-700/50">
            <div className="flex items-center gap-2">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={canUseCodeServer ? "default" : "outline"}
                      size="sm"
                      onClick={onOpenCodeServer}
                      disabled={!canUseCodeServer || isProcessing}
                      className={`flex items-center gap-2 transition-all duration-300 font-semibold text-xs ${
                        canUseCodeServer 
                          ? 'bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white shadow-md hover:shadow-lg border-0' 
                          : 'bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border border-white/60 dark:border-slate-700/60 shadow-sm hover:shadow-md'
                      }`}
                    >
                      <div className={`rounded-lg ${canUseCodeServer ? 'bg-white/25' : 'bg-blue-500/12 dark:bg-blue-400/15'} p-1`}>
                        {isProcessing ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Code2 className="h-3.5 w-3.5" />
                        )}
                      </div>
                      {canUseCodeServer ? "Otwórz IDE" : "Code Server"}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-[200px] text-center bg-white/95 dark:bg-slate-800/95 backdrop-blur-sm border border-white/60 dark:border-slate-700/60">
                    {!canUseCodeServer ? (
                      <p>Kontener musi być w stanie RUNNING, aby uruchomić Code Server</p>
                    ) : (
                      <p>Otwórz interfejs Code Server w nowej karcie</p>
                    )}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="flex items-center gap-2 bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border border-white/60 dark:border-slate-700/60 font-semibold text-xs shadow-sm hover:shadow-md transition-all duration-300"
                      onClick={onDetails}
                    >
                      <div className="bg-slate-500/12 dark:bg-slate-400/15 p-1 rounded-lg">
                        <ExternalLink className="h-3.5 w-3.5 text-slate-600 dark:text-slate-400" />
                      </div>
                      <span className="text-slate-700 dark:text-slate-200">Szczegóły</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="bg-white/95 dark:bg-slate-800/95 backdrop-blur-sm border border-white/60 dark:border-slate-700/60">
                    <p>Zobacz szczegółowe informacje o kontenerze</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={handleDeleteClick}
                    disabled={isProcessing}
                    className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border border-rose-200/70 dark:border-rose-700/50 text-rose-600 dark:text-rose-400 hover:bg-rose-50/90 dark:hover:bg-rose-900/40 hover:border-rose-300/90 dark:hover:border-rose-600/70 font-semibold text-xs shadow-sm hover:shadow-md transition-all duration-300"
                  >
                    {isProcessing ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <div className="flex items-center gap-2">
                        <div className="bg-rose-500/12 dark:bg-rose-400/15 p-1 rounded-lg">
                          <Trash2 className="h-3.5 w-3.5" />
                        </div>
                        <span>Usuń</span>
                      </div>
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="bg-white/95 dark:bg-slate-800/95 backdrop-blur-sm border border-white/60 dark:border-slate-700/60">
                  <p>Usuń kontener</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          {/* Enhanced footer for completed jobs */}
          {(job.status === "COMPLETED" || job.status === "FAILED") && activeJobData?.submit_time && (
            <div className="text-xs text-slate-500 dark:text-slate-400 border-t border-white/30 dark:border-slate-700/40 pt-4 flex items-center gap-3 bg-white/40 dark:bg-slate-800/40 backdrop-blur-sm p-3 rounded-lg">
              <Calendar className="h-4 w-4" />
              <span className="font-semibold">Zakończono: {formatDate(activeJobData.submit_time)}</span>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
});

ModernJobCard.displayName = "ModernJobCard";
