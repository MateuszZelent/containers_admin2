import React, { useEffect } from "react";
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

// Status icon mapping with subtle colors
const getStatusIcon = (status: string) => {
  switch (status) {
    case "RUNNING":
      return <Activity className="h-4 w-4 animate-pulse text-emerald-600 dark:text-emerald-400" />;
    case "PENDING":
      return <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />;
    case "CONFIGURING":
      return <Loader2 className="h-4 w-4 animate-spin text-blue-600 dark:text-blue-400" />;
    case "COMPLETED":
      return <CheckCircle2 className="h-4 w-4 text-emerald-700 dark:text-emerald-300" />;
    case "FAILED":
      return <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />;
    case "CANCELLED":
      return <Pause className="h-4 w-4 text-slate-600 dark:text-slate-400" />;
    default:
      return <AlertCircle className="h-4 w-4 text-slate-500 dark:text-slate-400" />;
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

// Subtle "glass" card styling for each status
const getStatusGradient = (status: string) => {
  switch (status) {
    case "RUNNING":
      return "bg-white/70 backdrop-blur-sm border-emerald-200/60 hover:bg-white/80 hover:border-emerald-300/70 hover:shadow-emerald-100/50 dark:bg-slate-800/70 dark:border-emerald-700/40 dark:hover:bg-slate-800/80 dark:hover:border-emerald-600/50 dark:hover:shadow-emerald-900/20";
    case "PENDING":
      return "bg-white/70 backdrop-blur-sm border-amber-200/60 hover:bg-white/80 hover:border-amber-300/70 hover:shadow-amber-100/50 dark:bg-slate-800/70 dark:border-amber-700/40 dark:hover:bg-slate-800/80 dark:hover:border-amber-600/50 dark:hover:shadow-amber-900/20";
    case "CONFIGURING":
      return "bg-white/70 backdrop-blur-sm border-blue-200/60 hover:bg-white/80 hover:border-blue-300/70 hover:shadow-blue-100/50 dark:bg-slate-800/70 dark:border-blue-700/40 dark:hover:bg-slate-800/80 dark:hover:border-blue-600/50 dark:hover:shadow-blue-900/20";
    case "COMPLETED":
      return "bg-white/70 backdrop-blur-sm border-slate-200/60 hover:bg-white/80 hover:border-slate-300/70 hover:shadow-slate-100/50 dark:bg-slate-800/70 dark:border-slate-600/40 dark:hover:bg-slate-800/80 dark:hover:border-slate-500/50 dark:hover:shadow-slate-900/20";
    case "FAILED":
      return "bg-white/70 backdrop-blur-sm border-red-200/60 hover:bg-white/80 hover:border-red-300/70 hover:shadow-red-100/50 dark:bg-slate-800/70 dark:border-red-700/40 dark:hover:bg-slate-800/80 dark:hover:border-red-600/50 dark:hover:shadow-red-900/20";
    case "CANCELLED":
      return "bg-white/70 backdrop-blur-sm border-orange-200/60 hover:bg-white/80 hover:border-orange-300/70 hover:shadow-orange-100/50 dark:bg-slate-800/70 dark:border-orange-700/40 dark:hover:bg-slate-800/80 dark:hover:border-orange-600/50 dark:hover:shadow-orange-900/20";
    default:
      return "bg-white/70 backdrop-blur-sm border-slate-200/60 hover:bg-white/80 hover:border-slate-300/70 hover:shadow-slate-100/50 dark:bg-slate-800/70 dark:border-slate-600/40 dark:hover:bg-slate-800/80 dark:hover:border-slate-500/50 dark:hover:shadow-slate-900/20";
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
  
  // Generate a unique key for the job combining ID and status for proper animation tracking
  const jobStatusKey = `${job.id}-${job.status}`;
  
  return (
    <motion.div
      key={jobStatusKey}
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10, transition: { duration: 0.2 } }}
      transition={{ 
        type: "spring", 
        stiffness: 400, 
        damping: 25, 
        duration: 0.3 
      }}
      className="relative"
    >
      <Card className={`group hover:shadow-lg transition-all duration-300 ${gradientClass} hover:scale-[1.01] relative`}>
      
      {/* Container Creation Overlay for PENDING and CONFIGURING states */}
      <AnimatePresence>
        {(job.status === "PENDING" || job.status === "CONFIGURING") && (
          <ContainerCreationOverlay 
            status={job.status}
            jobName={job.job_name}
          />
        )}
      </AnimatePresence>

      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-2">
            {statusIcon}
            <CardTitle className="text-lg font-semibold text-slate-900 group-hover:text-slate-700 transition-colors dark:text-slate-100 dark:group-hover:text-slate-200">
              {job.job_name}
            </CardTitle>
          </div>
          <Badge variant={statusVariant} className="flex items-center gap-1">
            {job.status}
          </Badge>
        </div>
        
        {/* Quick info bar */}
        <div className="flex items-center justify-between text-sm text-slate-600 dark:text-slate-400">
          <div className="flex items-center space-x-1">
            <Server className="h-3 w-3" />
            <span>ID: {job.id}</span>
          </div>
          <div className="flex items-center space-x-1">
            <Monitor className="h-3 w-3" />
            <span>{job.template_name}</span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Resource allocation section */}
        <div className="bg-white/40 backdrop-blur-sm rounded-lg p-3 space-y-2 border border-slate-200/50 dark:bg-slate-900/40 dark:border-slate-700/50">
          <h4 className="font-medium text-slate-800 flex items-center gap-2 dark:text-slate-200">
            <Cpu className="h-4 w-4" />
            Zasoby
          </h4>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600 dark:text-slate-400">CPU:</span>
              <Badge variant="outline" className="text-xs">
                {job.num_cpus} rdzeni
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600 dark:text-slate-400">RAM:</span>
              <Badge variant="outline" className="text-xs">
                {job.memory_gb}GB
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600 dark:text-slate-400">GPU:</span>
              <Badge variant="outline" className="text-xs">
                {job.num_gpus || 0}
              </Badge>
            </div>
            {job.node && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600 dark:text-slate-400">Węzeł:</span>
                <Badge variant="outline" className="text-xs">
                  {job.node}
                </Badge>
              </div>
            )}
          </div>
        </div>

        {/* Timing information for running jobs */}
        {job.status === "RUNNING" && activeJobData && (
          <div className="bg-white/40 backdrop-blur-sm rounded-lg p-3 space-y-2 border border-slate-200/50 dark:bg-slate-900/40 dark:border-slate-700/50">
            <h4 className="font-medium text-slate-800 flex items-center gap-2 dark:text-slate-200">
              <Clock className="h-4 w-4" />
              Czas wykonania
            </h4>
            <div className="space-y-2">
              {activeJobData.time_left && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600 dark:text-slate-400">Pozostało:</span>
                  <div className="flex items-center gap-1">
                    <Activity className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                    <LiveTimer initialTime={activeJobData.time_left} />
                  </div>
                </div>
              )}
              
              {activeJobData.time_used && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600 dark:text-slate-400">Wykorzystano:</span>
                  <span className="text-sm font-mono">{activeJobData.time_used}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Network & Access section */}
        {(job.port || tunnels.length > 0) && (
          <div className="bg-white/40 backdrop-blur-sm rounded-lg p-3 space-y-2 border border-slate-200/50 dark:bg-slate-900/40 dark:border-slate-700/50">
            <h4 className="font-medium text-slate-800 flex items-center gap-2 dark:text-slate-200">
              <Network className="h-4 w-4" />
              Dostęp sieciowy
            </h4>
            
            {job.port && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600 dark:text-slate-400">Port aplikacji:</span>
                <Badge variant="outline" className="font-mono">
                  {job.port}
                </Badge>
              </div>
            )}

            {tunnels.length > 0 && (
              <div className="space-y-2">
                {tunnels.map((tunnel) => (
                  <div key={tunnel.id} className="border-l-2 border-blue-300/60 dark:border-blue-600/60 pl-3 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-600 dark:text-slate-400">Status tunelu:</span>
                      <div className="flex items-center gap-1">
                        <div className={`h-2 w-2 rounded-full ${
                          tunnel.status === 'ACTIVE' ? 'bg-emerald-500 dark:bg-emerald-400' : 
                          tunnel.status === 'DEAD' ? 'bg-red-500 dark:bg-red-400' : 'bg-amber-500 dark:bg-amber-400'
                        }`} />
                        <span className="text-xs">{
                          tunnel.status === 'ACTIVE' ? 'Aktywny' : 
                          tunnel.status === 'DEAD' ? 'Nieaktywny' : 'Łączenie...'
                        }</span>
                      </div>
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      Port {tunnel.local_port} → {tunnel.remote_host}:{tunnel.remote_port}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
          <div className="flex items-center gap-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={canUseCodeServer ? "default" : "outline"}
                    size="sm"
                    onClick={onOpenCodeServer}
                    disabled={!canUseCodeServer || isProcessing}
                    className="flex items-center gap-2"
                  >
                    {isProcessing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Code2 className="h-4 w-4" />
                    )}
                    {canUseCodeServer ? "Otwórz" : "Code Server"}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {!canUseCodeServer ? (
                    <p>Kontener musi być w stanie RUNNING, aby uruchomić Code Server</p>
                  ) : (
                    <p>Otwórz interfejs Code Server w nowej karcie</p>
                  )}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {/* Quick details link */}
            <Button 
              variant="ghost" 
              size="sm" 
              className="flex items-center gap-1"
              onClick={onDetails}
            >
              <ExternalLink className="h-3 w-3" />
              Szczegóły
            </Button>
          </div>

          <Button 
            variant="ghost" 
            size="sm"
            onClick={onDelete}
            disabled={isProcessing}
            className="text-red-600 hover:text-red-700 hover:bg-red-50/50 dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-red-900/20"
          >
            {isProcessing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* Optional timing footer for completed jobs */}
        {(job.status === "COMPLETED" || job.status === "FAILED") && activeJobData?.submit_time && (
          <div className="text-xs text-slate-500 dark:text-slate-400 border-t border-slate-200/60 dark:border-slate-700/60 pt-2 flex items-center gap-2">
            <Calendar className="h-3 w-3" />
            <span>Zakończono: {formatDate(activeJobData.submit_time)}</span>
          </div>
        )}
      </CardContent>
    </Card>
    </motion.div>
  );
});

ModernJobCard.displayName = "ModernJobCard";
