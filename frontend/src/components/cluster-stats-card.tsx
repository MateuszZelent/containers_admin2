"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { debugLog } from "@/lib/debug";
import { 
  Monitor,
  Bug,
  Server,
  Cpu, 
  Zap,
  Moon,
  Activity,
  Clock,
  Wifi,
  WifiOff
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
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  
  // Use props data instead of calling useClusterStatus again
  const clusterStatus = propClusterStatus;
  const isLoading = propLoading;
  const error = propError;

  debugLog.general('[ClusterStatsCard] Render with props:', {
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
        <div className="flex items-start justify-between">
          <div className="space-y-1 flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-cyan-700 dark:text-cyan-300 truncate">Klaster</p>
              {/* Status indicator */}
              {isLoading ? (
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse flex-shrink-0"></div>
              ) : isWebSocketActive ? (
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse flex-shrink-0"></div>
              ) : error ? (
                <div className="w-2 h-2 bg-red-500 rounded-full flex-shrink-0"></div>
              ) : (
                <div className="w-2 h-2 bg-gray-400 rounded-full flex-shrink-0"></div>
              )}
              {/* Timestamp */}
              {lastUpdate && (
                <span className="text-xs text-cyan-500/70 dark:text-cyan-400/70 truncate">
                  {(() => {
                    const now = new Date();
                    const isToday = lastUpdate.toDateString() === now.toDateString();
                    const yesterday = new Date(now);
                    yesterday.setDate(now.getDate() - 1);
                    const isYesterday = lastUpdate.toDateString() === yesterday.toDateString();
                    
                    if (isToday) {
                      return `Dziś ${lastUpdate.toLocaleTimeString()}`;
                    } else if (isYesterday) {
                      return `Wczoraj ${lastUpdate.toLocaleTimeString()}`;
                    } else {
                      return `${lastUpdate.toLocaleDateString()} ${lastUpdate.toLocaleTimeString()}`;
                    }
                  })()}
                </span>
              )}
            </div>
            
            {/* Main content */}
            {clusterStatus ? (
              <div className="space-y-2">
                {/* Nodes section */}
                {clusterStatus.raw_nodes && (
                  <div className="text-xs text-cyan-600 dark:text-cyan-400">
                    <div className="font-medium mb-1 text-[10px] uppercase tracking-wide">WĘZŁY</div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger>
                            <div className="flex items-center gap-1">
                              <div className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0"></div>
                              <span className="font-semibold text-xs">{clusterStatus.raw_nodes.free}</span>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>Wolne węzły</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger>
                            <div className="flex items-center gap-1">
                              <div className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0"></div>
                              <span className="font-semibold text-xs">{clusterStatus.raw_nodes.busy}</span>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>Zajęte węzły</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger>
                            <div className="flex items-center gap-1">
                              <Moon className="w-3 h-3 text-yellow-500 flex-shrink-0" />
                              <span className="font-semibold text-xs">{clusterStatus.raw_nodes.sleeping}</span>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>Śpiące węzły</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger>
                            <div className="flex items-center gap-1">
                              <Server className="w-3 h-3 text-blue-500 flex-shrink-0" />
                              <span className="font-semibold text-xs">{clusterStatus.raw_nodes.total}</span>
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
                    <div className="font-medium mb-1 text-[10px] uppercase tracking-wide">GPU</div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger>
                            <div className="flex items-center gap-1">
                              <div className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0"></div>
                              <span className="font-semibold text-xs">{clusterStatus.raw_gpus.free}</span>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>Wolne GPU</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger>
                            <div className="flex items-center gap-1">
                              <div className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0"></div>
                              <span className="font-semibold text-xs">{clusterStatus.raw_gpus.busy}</span>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>Zajęte GPU</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger>
                            <div className="flex items-center gap-1">
                              <Zap className="w-3 h-3 text-blue-500 flex-shrink-0" />
                              <span className="font-semibold text-xs">{clusterStatus.raw_gpus.total}</span>
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

          {/* Right side - Icon only */}
          <div className="flex-shrink-0 ml-3">
            <Button
              onClick={() => setIsDetailsOpen(true)}
              variant="ghost"
              size="sm"
              className="h-12 w-12 p-0 rounded-xl bg-gradient-to-br from-cyan-400/80 to-teal-600/80 hover:from-cyan-500/90 hover:to-teal-700/90 shadow-md hover:shadow-lg transition-all duration-300 group-hover:scale-110 flex-shrink-0"
            >
              <Monitor className="h-6 w-6 text-white" />
            </Button>
          </div>
        </div>
      </CardContent>
      
      {/* PCSS Diagnostics Popup */}
      <PCSSDebugPopup 
        isOpen={isDiagnosticsOpen} 
        onClose={() => setIsDiagnosticsOpen(false)} 
      />

      {/* Cluster Details Modal */}
      <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <DialogContent className="max-w-2xl bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Monitor className="h-5 w-5 text-cyan-600" />
              Szczegóły Klastra
              <div className="ml-auto">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        onClick={() => {
                          setIsDiagnosticsOpen(true);
                        }}
                        variant="outline"
                        size="sm"
                        className="h-8 w-8 p-0"
                      >
                        <Bug className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Debug klastra</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </DialogTitle>
            <DialogDescription>
              Pełne informacje o stanie klastra obliczeniowego
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6">
            {/* Status Connection */}
            <div className="flex items-center justify-between p-4 rounded-lg bg-gradient-to-r from-cyan-50 to-teal-50 dark:from-cyan-950/20 dark:to-teal-950/20 border border-cyan-200/50 dark:border-cyan-800/50">
              <div className="flex items-center gap-3">
                {isWebSocketActive ? (
                  <Wifi className="h-5 w-5 text-green-600" />
                ) : (
                  <WifiOff className="h-5 w-5 text-red-600" />
                )}
                <div>
                  <div className="font-medium text-sm">Status połączenia</div>
                  <div className="text-xs text-muted-foreground">
                    {isWebSocketActive ? 'Połączono (WebSocket LIVE)' : error ? 'Błąd połączenia' : 'Łączenie...'}
                  </div>
                </div>
              </div>
              <Badge variant={isWebSocketActive ? "default" : "destructive"}>
                {isWebSocketActive ? 'ONLINE' : 'OFFLINE'}
              </Badge>
            </div>

            {/* Timestamp */}
            {lastUpdate && (
              <div className="flex items-center gap-3 p-4 rounded-lg bg-slate-50 dark:bg-slate-900/20 border border-slate-200 dark:border-slate-800">
                <Clock className="h-5 w-5 text-slate-600 dark:text-slate-400" />
                <div>
                  <div className="font-medium text-sm">Ostatnia aktualizacja danych</div>
                  <div className="text-xs text-muted-foreground">
                    {(() => {
                      const now = new Date();
                      const isToday = lastUpdate.toDateString() === now.toDateString();
                      const yesterday = new Date(now);
                      yesterday.setDate(now.getDate() - 1);
                      const isYesterday = lastUpdate.toDateString() === yesterday.toDateString();
                      
                      if (isToday) {
                        return `Dziś o ${lastUpdate.toLocaleTimeString()}`;
                      } else if (isYesterday) {
                        return `Wczoraj o ${lastUpdate.toLocaleTimeString()}`;
                      } else {
                        return `${lastUpdate.toLocaleDateString()} o ${lastUpdate.toLocaleTimeString()}`;
                      }
                    })()}
                  </div>
                </div>
              </div>
            )}

            {clusterStatus && (
              <>
                {/* Nodes Section */}
                {clusterStatus.raw_nodes && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Server className="h-5 w-5 text-blue-600" />
                      <h3 className="font-semibold">Węzły obliczeniowe</h3>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="p-3 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800/50">
                        <div className="flex items-center gap-2 mb-1">
                          <div className="w-3 h-3 rounded-full bg-green-500"></div>
                          <span className="text-sm font-medium">Wolne</span>
                        </div>
                        <div className="text-2xl font-bold text-green-700 dark:text-green-400">
                          {clusterStatus.raw_nodes.free}
                        </div>
                        <div className="text-xs text-green-600 dark:text-green-500">
                          Gotowe do użycia
                        </div>
                      </div>
                      
                      <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800/50">
                        <div className="flex items-center gap-2 mb-1">
                          <div className="w-3 h-3 rounded-full bg-red-500"></div>
                          <span className="text-sm font-medium">Zajęte</span>
                        </div>
                        <div className="text-2xl font-bold text-red-700 dark:text-red-400">
                          {clusterStatus.raw_nodes.busy}
                        </div>
                        <div className="text-xs text-red-600 dark:text-red-500">
                          W użyciu
                        </div>
                      </div>
                      
                      <div className="p-3 rounded-lg bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800/50">
                        <div className="flex items-center gap-2 mb-1">
                          <Moon className="w-3 h-3 text-yellow-500" />
                          <span className="text-sm font-medium">Śpiące</span>
                        </div>
                        <div className="text-2xl font-bold text-yellow-700 dark:text-yellow-400">
                          {clusterStatus.raw_nodes.sleeping}
                        </div>
                        <div className="text-xs text-yellow-600 dark:text-yellow-500">
                          Oszczędzanie energii
                        </div>
                      </div>
                      
                      <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800/50">
                        <div className="flex items-center gap-2 mb-1">
                          <Server className="w-3 h-3 text-blue-500" />
                          <span className="text-sm font-medium">Razem</span>
                        </div>
                        <div className="text-2xl font-bold text-blue-700 dark:text-blue-400">
                          {clusterStatus.raw_nodes.total}
                        </div>
                        <div className="text-xs text-blue-600 dark:text-blue-500">
                          Wszystkie węzły
                        </div>
                      </div>
                    </div>
                    
                    {/* Node utilization bar */}
                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900/20">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-medium">Wykorzystanie węzłów</span>
                        <span className="text-sm text-muted-foreground">
                          {Math.round((clusterStatus.raw_nodes.busy / clusterStatus.raw_nodes.total) * 100)}%
                        </span>
                      </div>
                      <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                        <div 
                          className="bg-gradient-to-r from-green-500 to-blue-500 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${(clusterStatus.raw_nodes.busy / clusterStatus.raw_nodes.total) * 100}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>
                )}

                {/* GPU Section */}
                {clusterStatus.raw_gpus && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Zap className="h-5 w-5 text-orange-600" />
                      <h3 className="font-semibold">Karty graficzne (GPU)</h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="p-3 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800/50">
                        <div className="flex items-center gap-2 mb-1">
                          <div className="w-3 h-3 rounded-full bg-green-500"></div>
                          <span className="text-sm font-medium">Wolne</span>
                        </div>
                        <div className="text-2xl font-bold text-green-700 dark:text-green-400">
                          {clusterStatus.raw_gpus.free}
                        </div>
                        <div className="text-xs text-green-600 dark:text-green-500">
                          Dostępne do alokacji
                        </div>
                      </div>
                      
                      <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800/50">
                        <div className="flex items-center gap-2 mb-1">
                          <div className="w-3 h-3 rounded-full bg-red-500"></div>
                          <span className="text-sm font-medium">Zajęte</span>
                        </div>
                        <div className="text-2xl font-bold text-red-700 dark:text-red-400">
                          {clusterStatus.raw_gpus.busy}
                        </div>
                        <div className="text-xs text-red-600 dark:text-red-500">
                          Aktywnie używane
                        </div>
                      </div>
                      
                      <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800/50">
                        <div className="flex items-center gap-2 mb-1">
                          <Zap className="w-3 h-3 text-blue-500" />
                          <span className="text-sm font-medium">Razem</span>
                        </div>
                        <div className="text-2xl font-bold text-blue-700 dark:text-blue-400">
                          {clusterStatus.raw_gpus.total}
                        </div>
                        <div className="text-xs text-blue-600 dark:text-blue-500">
                          Wszystkie GPU
                        </div>
                      </div>
                    </div>
                    
                    {/* GPU utilization bar */}
                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900/20">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-medium">Wykorzystanie GPU</span>
                        <span className="text-sm text-muted-foreground">
                          {Math.round((clusterStatus.raw_gpus.busy / clusterStatus.raw_gpus.total) * 100)}%
                        </span>
                      </div>
                      <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                        <div 
                          className="bg-gradient-to-r from-orange-500 to-red-500 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${(clusterStatus.raw_gpus.busy / clusterStatus.raw_gpus.total) * 100}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Footer */}
            <div className="flex justify-between items-center pt-4 border-t border-slate-200 dark:border-slate-800">
              <div className="text-xs text-muted-foreground">
                Dane pobierane co 2 minuty ze skryptu check.sh
              </div>
              <Button 
                onClick={() => setIsDetailsOpen(false)}
                variant="outline"
                size="sm"
              >
                Zamknij
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
