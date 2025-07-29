"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
// REMOVED: clusterApi, ClusterStats, useClusterStatus - WebSocket only via props
import { 
  Monitor,
  Bug
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
  
  // Use props data instead of calling useClusterStatus again
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
      <Card className="bg-white/60 backdrop-blur-sm border-cyan-200/60 dark:bg-slate-800/60 dark:border-cyan-700/40">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <p className="text-sm font-medium text-cyan-700 dark:text-cyan-300 mb-2">Klaster PCSS</p>
              <div className="space-y-1">
                <div className="h-3 w-20 bg-cyan-200/50 dark:bg-cyan-700/50 rounded animate-pulse"></div>
                <div className="h-3 w-16 bg-cyan-200/50 dark:bg-cyan-700/50 rounded animate-pulse"></div>
              </div>
            </div>
            <Monitor className="h-8 w-8 text-cyan-400/50 dark:text-cyan-500/50" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="group relative overflow-hidden backdrop-blur-sm bg-gradient-to-br from-cyan-500/5 via-blue-500/3 to-indigo-600/5 dark:from-cyan-400/10 dark:via-blue-500/5 dark:to-indigo-600/10 border border-cyan-200/20 dark:border-cyan-700/20 hover:border-cyan-300/30 dark:hover:border-cyan-600/30 transition-all duration-300 hover:shadow-lg hover:shadow-cyan-500/5 dark:hover:shadow-cyan-400/5">
      <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/3 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      <CardContent className="p-4 relative">
    <div className="flex items-start justify-between">
      {/* Lewa kolumna: tytuł + statystyki */}
      <div className="flex-1">
        <div className="mb-3">
          <div className="flex items-center gap-2 mb-1">
            <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-cyan-400/80 to-blue-600/80 flex items-center justify-center shadow-md group-hover:scale-110 transition-transform duration-300">
              <Monitor className="h-4 w-4 text-white" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-cyan-900 dark:text-cyan-100">Klaster PCSS</p>
              <div className="flex items-center gap-2">
              <Button
                onClick={() => setIsDiagnosticsOpen(true)}
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs flex items-center gap-1 border-amber-300/50 hover:border-amber-400/70 text-amber-600 hover:text-amber-700 dark:border-amber-600/50 dark:hover:border-amber-500/70 dark:text-amber-400 dark:hover:text-amber-300"
              >
                <Bug className="h-3 w-3" />
                Debug
              </Button>
            </div>
            </div>
          </div>
        </div>
        <div className="text-lg font-bold text-cyan-900 dark:text-cyan-100">
          {isLoading ? (
            <div className="space-y-1">
              <div className="h-3 w-20 bg-cyan-200/50 dark:bg-cyan-700/50 rounded animate-pulse"></div>
              <div className="h-3 w-16 bg-cyan-200/50 dark:bg-cyan-700/50 rounded animate-pulse"></div>
            </div>
          ) : clusterStatus ? (
            <div className="space-y-3">
              {/* Status węzłów z pięknym layoutem */}
              {clusterStatus.raw_nodes ? (
                <div className="bg-gradient-to-br from-slate-50/50 to-slate-100/30 dark:from-slate-800/50 dark:to-slate-900/30 rounded-lg p-3 border border-slate-200/20 dark:border-slate-700/20">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">WĘZŁY KLASTRA</span>
                    <div className="h-1 w-1 rounded-full bg-cyan-500"></div>
                  </div>
                  <div className="grid grid-cols-4 gap-3">
                    <div className="text-center">
                      <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{clusterStatus.raw_nodes.free}</div>
                      <div className="text-[10px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Wolne</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-bold text-red-500 dark:text-red-400">{clusterStatus.raw_nodes.busy}</div>
                      <div className="text-[10px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Zajęte</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-bold text-amber-500 dark:text-amber-400">{clusterStatus.raw_nodes.sleeping}</div>
                      <div className="text-[10px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Śpiące</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-bold text-slate-600 dark:text-slate-300">{clusterStatus.raw_nodes.total}</div>
                      <div className="text-[10px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Razem</div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-gradient-to-br from-slate-50/50 to-slate-100/30 dark:from-slate-800/50 dark:to-slate-900/30 rounded-lg p-3 border border-slate-200/20 dark:border-slate-700/20">
                  <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">WĘZŁY (SZACOWANE)</div>
                  <div className="text-sm text-slate-600 dark:text-slate-400">
                    {Math.ceil(clusterStatus.used_cpus / 32)}/{Math.ceil(clusterStatus.total_cpus / 32)} używane
                  </div>
                </div>
              )}
              
              {/* Status GPU z pięknym layoutem */}
              {clusterStatus.raw_gpus ? (
                <div className="bg-gradient-to-br from-violet-50/50 to-purple-100/30 dark:from-violet-900/20 dark:to-purple-900/30 rounded-lg p-3 border border-violet-200/20 dark:border-violet-700/20">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-violet-700 dark:text-violet-300">KARTY GRAFICZNE</span>
                    <div className="h-1 w-1 rounded-full bg-violet-500"></div>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center">
                      <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{clusterStatus.raw_gpus.free}</div>
                      <div className="text-[10px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Wolne</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-bold text-red-500 dark:text-red-400">{clusterStatus.raw_gpus.busy}</div>
                      <div className="text-[10px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Zajęte</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-bold text-violet-600 dark:text-violet-300">{clusterStatus.raw_gpus.total}</div>
                      <div className="text-[10px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Razem</div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-gradient-to-br from-violet-50/50 to-purple-100/30 dark:from-violet-900/20 dark:to-purple-900/30 rounded-lg p-3 border border-violet-200/20 dark:border-violet-700/20">
                  <div className="text-xs font-semibold text-violet-700 dark:text-violet-300 mb-1">CPU (SZACOWANE)</div>
                  <div className="text-sm text-slate-600 dark:text-slate-400">
                    {clusterStatus.used_cpus}/{clusterStatus.total_cpus} używane
                  </div>
                </div>
              )}
            </div>
          ) : error ? (
            <div className="space-y-1">
              <div className="text-xs text-red-600 dark:text-red-400">
                {error}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                Próba ponownego połączenia...
              </div>
            </div>
          ) : (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Łączenie z klastrem...
            </span>
          )}
        </div>
      </div>

      {/* Prawa kolumna: ikona + przyciski pod nią */}
      <div className="flex flex-col items-end gap-2">
        <Monitor
          className={`h-8 w-8 transition-colors duration-300 ${
            isLoading
              ? "text-cyan-400/50 dark:text-cyan-500/50"
              : "text-cyan-600 dark:text-cyan-400"
          }`}
        />
        <div className="flex flex-col gap-1">
          <Button
            onClick={() => setIsDiagnosticsOpen(true)}
            variant="outline"
            size="sm"
            className="h-6 px-2 text-xs flex items-center gap-1 border-amber-300/50 hover:border-amber-400/70 text-amber-600 hover:text-amber-700 dark:border-amber-600/50 dark:hover:border-amber-500/70 dark:text-amber-400 dark:hover:text-amber-300"
          >
            <Bug className="h-3 w-3" />
            Debug
          </Button>
        </div>
      </div>
    </div>
    
    {/* PCSS Diagnostics Popup */}
    <PCSSDebugPopup 
      isOpen={isDiagnosticsOpen} 
      onClose={() => setIsDiagnosticsOpen(false)} 
    />
  </CardContent>
</Card>
  );
}
