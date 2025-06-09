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
    <span className="font-mono text-sm font-bold text-slate-800 dark:text-slate-100 tabular-nums">
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
            <div className="flex items-center space-x-4">
              {statusIcon}
              <CardTitle className="text-lg font-bold bg-gradient-to-r from-slate-900 via-slate-800 to-slate-700 dark:from-white dark:via-slate-100 dark:to-slate-200 bg-clip-text text-transparent transition-all duration-300">
                {job.job_name}
              </CardTitle>
            </div>
            <Badge 
              variant={statusVariant} 
              className="flex items-center gap-2 px-4 py-2 font-semibold bg-white/90 dark:bg-slate-800/90 backdrop-blur-xl border border-white/40 dark:border-slate-700/50 shadow-lg text-slate-700 dark:text-slate-200"
            >
              {job.status}
            </Badge>
          </div>
          
          {/* Enhanced info bar with premium styling */}
          <div className="flex items-center justify-between text-sm mt-4 gap-4">
            <div className="flex items-center space-x-3 bg-white/80 dark:bg-slate-800/80 px-4 py-2.5 rounded-full backdrop-blur-xl border border-white/50 dark:border-slate-700/50 shadow-sm">
              <Server className="h-4 w-4 text-slate-600 dark:text-slate-300" />
              <span className="font-bold text-slate-700 dark:text-slate-200">ID: {job.id}</span>
            </div>
            <div className="flex items-center space-x-3 bg-white/80 dark:bg-slate-800/80 px-4 py-2.5 rounded-full backdrop-blur-xl border border-white/50 dark:border-slate-700/50 shadow-sm">
              <Monitor className="h-4 w-4 text-slate-600 dark:text-slate-300" />
              <span className="font-bold text-slate-700 dark:text-slate-200 truncate max-w-[120px]">{job.template_name}</span>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6 relative z-10">
          {/* Enhanced Resource Section with professional glassmorphism */}
          <div className="bg-white/[0.4] dark:bg-slate-900/[0.3] backdrop-blur-xl rounded-2xl p-6 border border-white/[0.25] dark:border-slate-700/[0.25] shadow-sm">
            <div className="flex items-center justify-between mb-5">
              <h4 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-3">
                <div className="p-2.5 bg-blue-500/[0.1] dark:bg-blue-400/[0.12] rounded-xl border border-blue-200/[0.4] dark:border-blue-400/[0.25]">
                  <Cpu className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                Zasoby obliczeniowe
              </h4>
              
              {job.created_at && (
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 bg-white/[0.7] dark:bg-slate-800/[0.7] px-4 py-2 rounded-full border border-white/[0.4] dark:border-slate-700/[0.5]">
                  {getRelativeTimeString(job.created_at)}
                </span>
              )}
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white/[0.8] dark:bg-slate-900/[0.4] backdrop-blur-sm p-4 rounded-xl border border-white/[0.4] dark:border-slate-700/[0.3] shadow-inner">
                <div className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3 font-bold">
                  CPU
                </div>
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-500/[0.1] dark:bg-blue-400/[0.12] rounded-lg">
                    <Cpu className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <span className="text-sm font-bold text-slate-800 dark:text-slate-100">
                    {job.num_cpus} {job.num_cpus === 1 ? 'rdzeń' : 'rdzeni'}
                  </span>
                </div>
              </div>
              
              <div className="bg-white/[0.8] dark:bg-slate-900/[0.4] backdrop-blur-sm p-4 rounded-xl border border-white/[0.4] dark:border-slate-700/[0.3] shadow-inner">
                <div className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3 font-bold">
                  RAM
                </div>
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-amber-500/[0.1] dark:bg-amber-400/[0.12] rounded-lg">
                    <HardDrive className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  </div>
                  <span className="text-sm font-bold text-slate-800 dark:text-slate-100">
                    {job.memory_gb} GB
                  </span>
                </div>
              </div>
              
              <div className="bg-white/[0.8] dark:bg-slate-900/[0.4] backdrop-blur-sm p-4 rounded-xl border border-white/[0.4] dark:border-slate-700/[0.3] shadow-inner">
                <div className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3 font-bold">
                  GPU
                </div>
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-purple-500/[0.1] dark:bg-purple-400/[0.12] rounded-lg">
                    <Zap className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                  </div>
                  <span className="text-sm font-bold text-slate-800 dark:text-slate-100">
                    {job.num_gpus || 0}
                  </span>
                </div>
              </div>
              
              {job.node && (
                <div className="bg-white/[0.8] dark:bg-slate-900/[0.4] backdrop-blur-sm p-4 rounded-xl border border-white/[0.4] dark:border-slate-700/[0.3] shadow-inner">
                  <div className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3 font-bold">
                    Węzeł
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-slate-500/[0.1] dark:bg-slate-400/[0.12] rounded-lg">
                      <Server className="h-4 w-4 text-slate-600 dark:text-slate-400" />
                    </div>
                    <span className="text-sm font-bold text-slate-800 dark:text-slate-100 font-mono truncate">
                      {job.node}
                    </span>
                  </div>
                </div>
              )}
            </div>
            
            {/* Enhanced progress bar for running jobs */}
            {job.status === "RUNNING" && (
              <div className="mt-5 pt-4 border-t border-white/30 dark:border-slate-700/40">
                <div className="flex items-center justify-between text-xs mb-3">
                  <span className="text-slate-600 dark:text-slate-300 font-semibold">Postęp wykonania</span>
                  <span className="font-bold text-slate-700 dark:text-slate-200 bg-white/70 dark:bg-slate-700/70 px-3 py-1.5 rounded-full">
                    {Math.round(progress)}%
                  </span>
                </div>
                <div className="h-2.5 w-full bg-slate-200/70 dark:bg-slate-700/70 rounded-full overflow-hidden backdrop-blur-sm">
                  <motion.div 
                    className="h-full bg-gradient-to-r from-blue-500 via-purple-500 to-emerald-500 rounded-full shadow-inner"
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.8, ease: "easeInOut" }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Enhanced Running Status Section */}
          {job.status === "RUNNING" && (
            <div className="bg-gradient-to-br from-emerald-50/90 to-green-50/70 dark:from-emerald-900/25 dark:to-green-900/15 backdrop-blur-xl rounded-2xl p-5 border border-emerald-200/60 dark:border-emerald-700/30 shadow-inner">
              <h4 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-3 mb-5">
                <div className="p-2.5 bg-emerald-500/10 dark:bg-emerald-400/12 rounded-lg">
                  <Clock className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                Status wykonania
              </h4>
              
              <div className="space-y-4">
                {/* Enhanced running indicator */}
                <div className="flex items-center gap-4 bg-white/70 dark:bg-slate-800/50 p-4 rounded-xl backdrop-blur-sm">
                  <div className="relative flex items-center justify-center">
                    <div className="absolute h-6 w-6 rounded-full bg-emerald-400/30 animate-ping"></div>
                    <div className="relative h-4 w-4 rounded-full bg-emerald-500 dark:bg-emerald-400 shadow-lg"></div>
                  </div>
                  <div className="text-sm font-bold text-emerald-700 dark:text-emerald-300">
                    Aktywnie wykonywane
                  </div>
                </div>
                
                {/* Enhanced time display */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white/80 dark:bg-slate-900/40 backdrop-blur-sm p-4 rounded-xl border border-white/40 dark:border-slate-700/40">
                    <div className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3 font-bold">
                      Pozostało
                    </div>
                    <div className="flex items-center gap-3">
                      <Activity className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                      {activeJobData?.time_left ? (
                        <LiveTimer initialTime={activeJobData.time_left} />
                      ) : (
                        <span className="text-sm font-mono font-bold text-slate-700 dark:text-slate-200 tabular-nums">
                          {job.time_limit || "24:00:00"}
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <div className="bg-white/80 dark:bg-slate-900/40 backdrop-blur-sm p-4 rounded-xl border border-white/40 dark:border-slate-700/40">
                    <div className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3 font-bold">
                      Wykorzystano
                    </div>
                    <div className="flex items-center gap-3">
                      <Clock className="h-4 w-4 text-slate-600 dark:text-slate-400" />
                      <AutoTimer createdAt={job.created_at} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Enhanced Network Section */}
          {(job.port || tunnels.length > 0) && (
            <div className="bg-gradient-to-br from-blue-50/90 to-indigo-50/70 dark:from-blue-900/25 dark:to-indigo-900/15 backdrop-blur-xl rounded-2xl p-5 border border-blue-200/60 dark:border-blue-700/30 shadow-inner">
              <h4 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-3 mb-5">
                <div className="p-2.5 bg-blue-500/10 dark:bg-blue-400/12 rounded-lg">
                  <Network className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                Dostęp sieciowy
              </h4>
              
              {job.port && (
                <div className="flex items-center justify-between bg-white/80 dark:bg-slate-900/40 backdrop-blur-sm p-4 rounded-xl border border-white/40 dark:border-slate-700/40 mb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-blue-500/10 dark:bg-blue-400/12 rounded-lg">
                      <Monitor className="h-4 w-4 text-blue-700 dark:text-blue-400" />
                    </div>
                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Port aplikacji</span>
                  </div>
                  <Badge variant="outline" className="font-mono bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm border-0 shadow-sm font-bold px-3 py-1">
                    {job.port}
                  </Badge>
                </div>
              )}

              {tunnels.length > 0 && (
                <div className="space-y-3">
                  {tunnels.map((tunnel) => (
                    <div key={tunnel.id} className="bg-white/80 dark:bg-slate-900/40 p-4 rounded-xl border border-white/40 dark:border-slate-700/40">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className={`h-3 w-3 rounded-full ${
                            tunnel.status === 'ACTIVE' ? 'bg-emerald-500 dark:bg-emerald-400' : 
                            tunnel.status === 'DEAD' ? 'bg-red-500 dark:bg-red-400' : 'bg-amber-500 dark:bg-amber-400'
                          }`} />
                          <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                            Tunel {tunnel.status === 'ACTIVE' ? 'aktywny' : tunnel.status === 'DEAD' ? 'nieaktywny' : 'w trakcie łączenia'}
                          </span>
                        </div>
                        
                        <Badge variant={tunnel.status === 'ACTIVE' ? "default" : "secondary"} className="text-xs bg-white/90 dark:bg-slate-800/90">
                          {tunnel.status}
                        </Badge>
                      </div>
                      
                      <div className="flex items-center justify-between bg-slate-50/80 dark:bg-slate-800/70 p-3 rounded-lg text-xs">
                        <div className="font-mono text-slate-600 dark:text-slate-400 flex items-center gap-2">
                          <span className="font-bold">{tunnel.local_port}</span>
                          <svg width="16" height="8" viewBox="0 0 16 8" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-blue-500 dark:text-blue-400">
                            <path d="M15.3536 4.35355C15.5488 4.15829 15.5488 3.84171 15.3536 3.64645L12.1716 0.464466C11.9763 0.269204 11.6597 0.269204 11.4645 0.464466C11.2692 0.659728 11.2692 0.976311 11.4645 1.17157L14.2929 4L11.4645 6.82843C11.2692 7.02369 11.2692 7.34027 11.4645 7.53553C11.6597 7.7308 11.9763 7.7308 12.1716 7.53553L15.3536 4.35355ZM0 4.5H15V3.5H0V4.5Z" fill="currentColor"/>
                          </svg>
                          <span className="truncate font-bold">{tunnel.remote_host}:{tunnel.remote_port}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Enhanced Action buttons */}
          <div className="flex items-center justify-between pt-4 mt-2 border-t border-white/30 dark:border-slate-700/40">
            <div className="flex items-center gap-3">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={canUseCodeServer ? "default" : "outline"}
                      size="sm"
                      onClick={onOpenCodeServer}
                      disabled={!canUseCodeServer || isProcessing}
                      className={`flex items-center gap-3 shadow-sm transition-all duration-300 font-semibold ${
                        canUseCodeServer 
                          ? 'bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white' 
                          : 'bg-white/70 dark:bg-slate-800/70 backdrop-blur-sm border-white/40 dark:border-slate-700/40'
                      }`}
                    >
                      <div className={`rounded-lg ${canUseCodeServer ? 'bg-white/20' : 'bg-blue-500/10 dark:bg-blue-400/12'} p-1.5`}>
                        {isProcessing ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Code2 className="h-4 w-4" />
                        )}
                      </div>
                      {canUseCodeServer ? "Otwórz IDE" : "Code Server"}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-[200px] text-center bg-white/95 dark:bg-slate-800/95 backdrop-blur-sm">
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
                      className="flex items-center gap-3 bg-white/70 dark:bg-slate-800/70 backdrop-blur-sm border-white/40 dark:border-slate-700/40 font-semibold"
                      onClick={onDetails}
                    >
                      <div className="bg-slate-500/10 dark:bg-slate-400/12 p-1.5 rounded-lg">
                        <ExternalLink className="h-4 w-4 text-slate-600 dark:text-slate-400" />
                      </div>
                      <span className="text-slate-700 dark:text-slate-200">Szczegóły</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="bg-white/95 dark:bg-slate-800/95 backdrop-blur-sm">
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
                    className="bg-white/70 dark:bg-slate-800/70 backdrop-blur-sm border-rose-200/60 dark:border-rose-700/40 text-rose-600 dark:text-rose-400 hover:bg-rose-50/80 dark:hover:bg-rose-900/30 hover:border-rose-300/80 dark:hover:border-rose-600/60 font-semibold"
                  >
                    {isProcessing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <div className="flex items-center gap-3">
                        <div className="bg-rose-500/10 dark:bg-rose-400/12 p-1.5 rounded-lg">
                          <Trash2 className="h-4 w-4" />
                        </div>
                        <span>Usuń</span>
                      </div>
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="bg-white/95 dark:bg-slate-800/95 backdrop-blur-sm">
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
