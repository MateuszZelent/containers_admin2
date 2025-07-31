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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Checkbox } from "@/components/ui/checkbox";
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
  Loader2
} from "lucide-react";

// Base interfaces
export interface BaseCardData {
  id: number;
  name?: string;
  job_name?: string;
  status: string;
  created_at: string;
  simulation_file?: string;
  num_cpus?: number;
  memory_gb?: number;
  num_gpus?: number;
  node?: string;
  progress?: number;
  error_message?: string;
}

export interface CardAction {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
  variant?: "default" | "outline" | "destructive" | "secondary";
  disabled?: boolean;
  loading?: boolean;
  tooltip?: string;
  className?: string;
}

export interface ResourceInfo {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  unit?: string;
}

export interface StatusBadge {
  label: string;
  variant: "default" | "secondary" | "destructive" | "outline";
  icon?: React.ComponentType<{ className?: string }>;
  className?: string;
}

export interface ModernCardLayoutProps {
  data: BaseCardData;
  title: string;
  subtitle?: string;
  typeIcon: React.ComponentType<{ className?: string }>;
  typeBadge?: StatusBadge;
  statusBadge: StatusBadge;
  resources: ResourceInfo[];
  actions: CardAction[];
  showProgressBar?: boolean;
  progressValue?: number;
  showElapsedTime?: boolean;
  additionalSections?: React.ReactNode[];
  overlay?: React.ReactNode;
  formatDate?: (date: string) => string;
  className?: string;
  isSelected?: boolean;
  onSelectionToggle?: () => void;
}

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

// Auto-updating timer component for real-time display
const AutoTimer: React.FC<{ createdAt: string }> = ({ createdAt }) => {
  const [timeElapsed, setTimeElapsed] = useState<string>("00:00:00");

  useEffect(() => {
    const calculateElapsed = () => {
      try {
        const created = new Date(createdAt);
        const now = new Date();
        
        if (isNaN(created.getTime()) || isNaN(now.getTime())) {
          console.warn("AutoTimer: Invalid date detected", { createdAt, created, now });
          return "00:00:00";
        }
        
        const diffInSeconds = Math.floor((now.getTime() - created.getTime()) / 1000);
        
        if (diffInSeconds < 0) {
          console.warn("AutoTimer: Negative time difference", diffInSeconds);
          return "00:00:00";
        }
        
        const hours = Math.floor(diffInSeconds / 3600);
        const minutes = Math.floor((diffInSeconds % 3600) / 60);
        const seconds = diffInSeconds % 60;
        
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
      } catch (error) {
        console.error("AutoTimer: Error calculating elapsed time", error);
        return "00:00:00";
      }
    };

    setTimeElapsed(calculateElapsed());
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

export const ModernCardLayout = React.memo<ModernCardLayoutProps>(({
  data,
  title,
  subtitle,
  typeIcon: TypeIcon,
  typeBadge,
  statusBadge,
  resources,
  actions,
  showProgressBar = false,
  progressValue = 0,
  showElapsedTime = false,
  additionalSections = [],
  overlay,
  formatDate = (date: string) => new Date(date).toLocaleString(),
  className = "",
  isSelected = false,
  onSelectionToggle
}) => {
  const gradientClass = getStatusGradient(data.status);
  const itemStatusKey = `${data.id}-${data.status}`;

  return (
    <motion.div
      key={itemStatusKey}
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
      className={`relative group w-full min-w-[450px] max-w-[600px] flex-1 ${className}`}
    >
      <Card className={`${gradientClass} overflow-hidden relative`}>
        {/* Enhanced gradient overlay for professional depth */}
        <div className="absolute inset-0 bg-gradient-to-br from-white/[0.05] via-white/[0.02] to-transparent dark:from-white/[0.02] dark:via-white/[0.01] dark:to-transparent pointer-events-none" />
        
        {/* Subtle inner glow for premium feel */}
        <div className="absolute inset-0 bg-gradient-to-t from-transparent via-transparent to-white/[0.02] dark:to-white/[0.008] pointer-events-none" />
        
        {/* Overlay (e.g., Container Creation Overlay) */}
        {overlay && (
          <div className="absolute inset-0 z-50">
            {overlay}
          </div>
        )}

        <CardHeader className="pb-4 relative z-10">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 lg:gap-0">
            <div className="flex items-center space-x-3 min-w-0 flex-1">
              {onSelectionToggle && (
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={onSelectionToggle}
                  className="mr-1"
                />
              )}
              <TypeIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              <div className="flex flex-col min-w-0 flex-1">
                <CardTitle className="text-base lg:text-lg font-bold bg-gradient-to-r from-slate-900 via-slate-800 to-slate-700 dark:from-white dark:via-slate-100 dark:to-slate-200 bg-clip-text text-transparent transition-all duration-300 truncate">
                  {title}
                </CardTitle>
                {subtitle && (
                  <span className="text-xs text-slate-600 dark:text-slate-400 truncate">
                    {subtitle}
                  </span>
                )}
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              {typeBadge && (
                <Badge 
                  variant={typeBadge.variant}
                  className={`text-xs ${typeBadge.className || ''}`}
                >
                  {typeBadge.icon && <typeBadge.icon className="h-3 w-3 mr-1" />}
                  {typeBadge.label}
                </Badge>
              )}
              <Badge 
                variant={statusBadge.variant} 
                className={`flex items-center gap-2 px-3 py-1.5 font-semibold text-xs bg-white/95 dark:bg-slate-800/95 backdrop-blur-xl border border-white/60 dark:border-slate-700/60 shadow-md text-slate-700 dark:text-slate-200 ${statusBadge.className || ''}`}
              >
                {statusBadge.icon && <statusBadge.icon className="h-3 w-3" />}
                {statusBadge.label}
              </Badge>
            </div>
          </div>
          
          {/* Enhanced info bar with responsive layout */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between text-sm mt-3 gap-2 sm:gap-3">
            <div className="flex items-center space-x-2 bg-white/85 dark:bg-slate-800/85 px-3 py-2 rounded-full backdrop-blur-xl border border-white/60 dark:border-slate-700/60 shadow-sm w-full sm:w-auto">
              <Server className="h-3.5 w-3.5 text-slate-600 dark:text-slate-300 flex-shrink-0" />
              <span className="font-bold text-slate-700 dark:text-slate-200 text-xs">ID: {data.id}</span>
            </div>
            {data.node && (
              <div className="flex items-center space-x-2 bg-white/85 dark:bg-slate-800/85 px-3 py-2 rounded-full backdrop-blur-xl border border-white/60 dark:border-slate-700/60 shadow-sm w-full sm:w-auto">
                <Monitor className="h-3.5 w-3.5 text-slate-600 dark:text-slate-300 flex-shrink-0" />
                <span className="font-bold text-slate-700 dark:text-slate-200 truncate text-xs">{data.node}</span>
              </div>
            )}
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
              
              {data.created_at && (
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 bg-white/[0.8] dark:bg-slate-800/[0.8] px-2.5 py-1 rounded-full border border-white/[0.5] dark:border-slate-700/[0.6] backdrop-blur-sm">
                  {getRelativeTimeString(data.created_at)}
                </span>
              )}
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {resources.map((resource, index) => (
                <div key={index} className="bg-white/[0.85] dark:bg-slate-900/[0.45] backdrop-blur-sm p-3 rounded-lg border border-white/[0.5] dark:border-slate-700/[0.35] shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-1 bg-blue-500/[0.12] dark:bg-blue-400/[0.15] rounded-md">
                        <resource.icon className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                      </div>
                      <span className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 font-bold">
                        {resource.label}
                      </span>
                    </div>
                    <span className="text-sm font-bold text-slate-800 dark:text-slate-100">
                      {resource.value}{resource.unit ? ` ${resource.unit}` : ''}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Enhanced progress bar for running items */}
            {showProgressBar && data.status === "RUNNING" && (
              <div className="mt-4 pt-4 border-t border-white/40 dark:border-slate-700/50">
                <div className="flex items-center justify-between text-xs mb-3">
                  <span className="text-slate-600 dark:text-slate-300 font-semibold">Postęp wykonania</span>
                  {showElapsedTime && (
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-200 bg-white/80 dark:bg-slate-700/80 px-3 py-1.5 rounded-full border border-white/50 dark:border-slate-600/50 backdrop-blur-sm">
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-3 w-3 text-slate-600 dark:text-slate-400" />
                        <AutoTimer createdAt={data.created_at} />
                      </div>
                    </div>
                  )}
                </div>
                <div className="h-2 w-full bg-slate-200/80 dark:bg-slate-700/80 rounded-full overflow-hidden backdrop-blur-sm shadow-inner">
                  <motion.div 
                    className="h-full bg-gradient-to-r from-blue-500 via-purple-500 to-emerald-500 rounded-full relative"
                    initial={{ width: 0 }}
                    animate={{ width: `${progressValue}%` }}
                    transition={{ duration: 0.8, ease: "easeInOut" }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent rounded-full" />
                  </motion.div>
                </div>
              </div>
            )}

            {/* Error message */}
            {data.error_message && (
              <div className="mt-4 pt-4 border-t border-white/40 dark:border-slate-700/50">
                <div className="p-2 bg-red-50 border border-red-200 rounded text-xs">
                  <p className="text-red-600 truncate" title={data.error_message}>
                    {data.error_message}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Additional sections */}
          {additionalSections.map((section, index) => (
            <div key={index}>{section}</div>
          ))}

          {/* Enhanced Action buttons */}
          <div className="flex items-center justify-between pt-4 mt-2 border-t border-white/30 dark:border-slate-700/40">
            <div className="flex items-center gap-3">
              {actions.slice(0, -1).map((action, index) => (
                <TooltipProvider key={index}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button 
                        variant={action.variant || "default"}
                        size="sm"
                        onClick={action.onClick}
                        disabled={action.disabled || action.loading}
                        className={`flex items-center gap-2 transition-all duration-300 font-semibold text-sm px-4 py-2 hover:scale-105 ${action.className || ''}`}
                      >
                        <div className="rounded-lg bg-white/25 p-1.5">
                          {action.loading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <action.icon className="h-4 w-4" />
                          )}
                        </div>
                        {action.label}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-[200px] text-center bg-white/95 dark:bg-slate-800/95 backdrop-blur-sm">
                      <p>{action.tooltip || action.label}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ))}
            </div>

            {/* Delete button (always last) */}
            {actions.length > 0 && (() => {
              const lastAction = actions[actions.length - 1];
              const LastActionIcon = lastAction.icon;
              return (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button 
                        variant={lastAction.variant || "outline"}
                        size="sm"
                        onClick={lastAction.onClick}
                        disabled={lastAction.disabled || lastAction.loading}
                        className={`bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm border border-rose-200/90 dark:border-rose-700/70 text-rose-600 dark:text-rose-400 hover:bg-rose-50/95 dark:hover:bg-rose-900/50 hover:border-rose-300/95 dark:hover:border-rose-600/90 shadow-md hover:shadow-lg font-semibold text-sm px-4 py-2 hover:scale-105 transition-all duration-300 ${lastAction.className || ''}`}
                      >
                        {lastAction.loading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <div className="flex items-center gap-2">
                            <div className="bg-rose-500/12 dark:bg-rose-400/15 p-1.5 rounded-lg">
                              <LastActionIcon className="h-4 w-4" />
                            </div>
                            <span>{lastAction.label}</span>
                          </div>
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent className="bg-white/95 dark:bg-slate-800/95 backdrop-blur-sm">
                      <p>{lastAction.tooltip || lastAction.label}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              );
            })()}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
});

ModernCardLayout.displayName = "ModernCardLayout";
