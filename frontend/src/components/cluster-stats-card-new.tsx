"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { 
  Monitor,
  Bug,
  Server,
  Cpu, 
  Zap,
  Moon
} from "lucide-react";
import PCSSDebugPopup from "./pcss-diagnostic-popup";

interface ClusterStatsCardProps {
  onRefresh?: () => void;
  isWebSocketActive?: boolean;
  lastUpdate?: Date | null;
  clusterStatus?: any; // WebSocket cluster status data
  loading?: boolean;
  error?: string | null;
}

export function ClusterStatsCard({ 
  onRefresh,
  isWebSocketActive = false,
  lastUpdate,
  clusterStatus: propClusterStatus,
  loading: propLoading = false,
  error: propError = null
}: ClusterStatsCardProps) {
  const [isDiagnosticsOpen, setIsDiagnosticsOpen] = useState(false);
  
  // Use props from ConnectionStatusContext instead of calling useClusterStatus directly
  const clusterStatus = propClusterStatus;
  const isLoading = propLoading;
  const error = propError;

  console.log('[ClusterStatsCard] Render with props:', {
    clusterStatus: clusterStatus ? 'has data' : 'no data',
    raw_gpus: clusterStatus?.raw_gpus,
    isLoading,
    error,
    isWebSocketActive,
    lastUpdate
  });

  if (isLoading && !clusterStatus) {
    return (
      <Card className="group relative overflow-hidden backdrop-blur-sm bg-gradient-to-br from-cyan-500/5 via-teal-600/3 to-cyan-700/5 dark:from-cyan-400/10 dark:via-teal-500/5 dark:to-cyan-600/10 border border-cyan-200/20 dark:border-cyan-700/20">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="h-4 w-24 bg-cyan-200/50 dark:bg-cyan-700/50 rounded animate-pulse"></div>
              <div className="h-8 w-16 bg-cyan-200/50 dark:bg-cyan-700/50 rounded animate-pulse"></div>
            </div>
            <div className="h-12 w-12 rounded-xl bg-cyan-200/30 dark:bg-cyan-700/30 animate-pulse"></div>
          </div>
          <div className="mt-3 h-3 w-20 bg-cyan-200/30 dark:bg-cyan-700/30 rounded animate-pulse"></div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="group relative overflow-hidden backdrop-blur-sm bg-gradient-to-br from-cyan-500/5 via-teal-600/3 to-cyan-700/5 dark:from-cyan-400/10 dark:via-teal-500/5 dark:to-cyan-600/10 border border-cyan-200/20 dark:border-cyan-700/20 hover:border-cyan-300/30 dark:hover:border-cyan-600/30 transition-all duration-300 hover:shadow-lg hover:shadow-cyan-500/5 dark:hover:shadow-cyan-400/5">
      <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/3 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      <CardContent className="p-6 relative">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-cyan-700 dark:text-cyan-300">Klaster PCSS</p>
              {/* Status indicator */}
              {isLoading ? (
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse"></div>
              ) : isWebSocketActive ? (
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              ) : error ? (
                <div className="w-2 h-2 bg-red-500 rounded-full"></div>
              ) : (
                <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
              )}
            </div>
            
            {/* Main content */}
            {clusterStatus ? (
              <div className="space-y-2">
                {/* Nodes section */}
                {clusterStatus.raw_nodes && (
                  <div className="text-xs text-cyan-600 dark:text-cyan-400">
                    <div className="font-medium mb-1">WĘZŁY KLASTRA</div>
                    <div className="flex items-center gap-3">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger>
                            <div className="flex items-center gap-1">
                              <div className="w-2 h-2 rounded-full bg-green-500"></div>
                              <span className="font-semibold">{clusterStatus.raw_nodes.free}</span>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>Wolne węzły</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger>
                            <div className="flex items-center gap-1">
                              <div className="w-2 h-2 rounded-full bg-red-500"></div>
                              <span className="font-semibold">{clusterStatus.raw_nodes.busy}</span>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>Zajęte węzły</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger>
                            <div className="flex items-center gap-1">
                              <Moon className="w-3 h-3 text-yellow-500" />
                              <span className="font-semibold">{clusterStatus.raw_nodes.sleeping}</span>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>Śpiące węzły</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger>
                            <div className="flex items-center gap-1">
                              <Server className="w-3 h-3 text-blue-500" />
                              <span className="font-semibold">{clusterStatus.raw_nodes.total}</span>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>Wszystkie węzły</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </div>
                )}
                
                {/* GPU section */}
                {clusterStatus.raw_gpus && (
                  <div className="text-xs text-cyan-600 dark:text-cyan-400 pt-2 border-t border-cyan-200/20 dark:border-cyan-700/20">
                    <div className="font-medium mb-1">KARTY GRAFICZNE</div>
                    <div className="flex items-center gap-3">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger>
                            <div className="flex items-center gap-1">
                              <div className="w-2 h-2 rounded-full bg-green-500"></div>
                              <span className="font-semibold">{clusterStatus.raw_gpus.free}</span>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>Wolne GPU</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger>
                            <div className="flex items-center gap-1">
                              <div className="w-2 h-2 rounded-full bg-red-500"></div>
                              <span className="font-semibold">{clusterStatus.raw_gpus.busy}</span>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>Zajęte GPU</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger>
                            <div className="flex items-center gap-1">
                              <Zap className="w-3 h-3 text-blue-500" />
                              <span className="font-semibold">{clusterStatus.raw_gpus.total}</span>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>Wszystkie GPU</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </div>
                )}
              </div>
            ) : error ? (
              <div className="text-xs text-red-600 dark:text-red-400">
                Błąd połączenia
              </div>
            ) : (
              <div className="text-xs text-gray-500 dark:text-gray-400">
                Łączenie...
              </div>
            )}
          </div>

          {/* Right side - Icon and Debug */}
          <div className="flex flex-col items-end gap-2">
            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-cyan-400/80 to-teal-600/80 flex items-center justify-center shadow-md group-hover:scale-110 transition-transform duration-300">
              <Monitor className="h-6 w-6 text-white" />
            </div>
            
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={() => setIsDiagnosticsOpen(true)}
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-cyan-600/60 hover:text-cyan-600 dark:text-cyan-400/60 dark:hover:text-cyan-400"
                  >
                    <Bug className="h-3 w-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Debug klastra</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
        
        {/* Bottom status */}
        <div className="mt-3 flex items-center text-xs text-cyan-600 dark:text-cyan-400">
          <div className="h-1.5 w-1.5 rounded-full bg-cyan-500 mr-2 animate-pulse" />
          {lastUpdate ? `Aktualizacja: ${lastUpdate.toLocaleTimeString()}` : 'Monitoring klastra'}
        </div>
      </CardContent>
      
      {/* PCSS Diagnostics Popup */}
      <PCSSDebugPopup 
        isOpen={isDiagnosticsOpen} 
        onClose={() => setIsDiagnosticsOpen(false)} 
      />
    </Card>
  );
}
