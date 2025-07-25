"use client";

import { useEffect, useState } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { clusterApi } from "@/lib/api-client";
import { ResourceUsage } from "@/lib/types";
import { TrendingUp, Activity, Users, Server, Cpu, HardDrive, Zap } from "lucide-react";

interface VisibilityState {
  logged_in_users: boolean;
  active_containers: boolean;
  used_gpus: boolean;
  reserved_ram_gb: boolean;
  used_cpu_threads: boolean;
}

export function ResourceUsageChart() {
  const [data, setData] = useState<ResourceUsage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [visibleMetrics, setVisibleMetrics] = useState<VisibilityState>({
    logged_in_users: true,
    active_containers: true,
    used_gpus: false,  // Domyślnie wyłączone
    reserved_ram_gb: true,
    used_cpu_threads: false,  // Domyślnie wyłączone
  });

  useEffect(() => {
    clusterApi.getUsageHistory()
      .then((res) => {
        // Sortuj dane chronologicznie (najstarsze po lewej, najnowsze po prawej)
        const sortedData = res.data.sort((a: ResourceUsage, b: ResourceUsage) => 
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );
        setData(sortedData);
      })
      .catch((error) => {
        console.error("Failed to fetch resource usage data:", error);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  const toggleMetric = (metricKey: keyof VisibilityState) => {
    setVisibleMetrics(prev => ({
      ...prev,
      [metricKey]: !prev[metricKey]
    }));
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('pl-PL', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const date = new Date(label);
      return (
        <div className="bg-white/95 backdrop-blur-sm dark:bg-slate-800/95 border border-slate-200/50 dark:border-slate-700/50 rounded-lg p-4 shadow-lg min-w-[280px]">
          <div className="flex flex-col gap-3">
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100 border-b border-slate-200 dark:border-slate-700 pb-2">
              {date.toLocaleDateString('pl-PL')} • {date.toLocaleTimeString('pl-PL')}
            </p>
            <div className="grid grid-cols-1 gap-2">
              {payload.map((entry: any, index: number) => (
                <div key={index} className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-3 h-3 rounded-full" 
                      style={{ backgroundColor: entry.color }}
                    ></div>
                    <span className="text-sm text-slate-600 dark:text-slate-400">
                      {entry.name}:
                    </span>
                  </div>
                  <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {entry.value}
                    {entry.dataKey === 'reserved_ram_gb' ? ' GB' : 
                     entry.dataKey === 'used_cpu_threads' ? ' wątków' : ''}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  const CustomLegend = () => {
    const legendItems = [
      { key: 'logged_in_users', name: 'Aktywne sesje', icon: Users, color: '#3b82f6', yAxis: 'left' },
      { key: 'active_containers', name: 'Aktywne kontenery', icon: Server, color: '#10b981', yAxis: 'left' },
      { key: 'used_gpus', name: 'Używane GPU', icon: Zap, color: '#f59e0b', yAxis: 'left' },
      { key: 'reserved_ram_gb', name: 'RAM (GB)', icon: HardDrive, color: '#8b5cf6', yAxis: 'right' },
      { key: 'used_cpu_threads', name: 'Wątki CPU', icon: Cpu, color: '#ef4444', yAxis: 'right' },
    ];

    return (
      <div className="flex flex-wrap justify-center gap-4 mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
        {legendItems.map((item) => {
          const Icon = item.icon;
          const visible = visibleMetrics[item.key as keyof VisibilityState];
          return (
            <button
              key={item.key}
              onClick={() => toggleMetric(item.key as keyof VisibilityState)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                visible
                  ? 'bg-white dark:bg-slate-800 shadow-sm border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                  : 'bg-slate-100 dark:bg-slate-800/50 text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-700'
              } hover:shadow-md hover:scale-105`}
              style={{ 
                borderLeftColor: visible ? item.color : 'transparent',
                borderLeftWidth: '4px'
              }}
            >
              <Icon className="w-4 h-4" style={{ color: visible ? item.color : 'currentColor' }} />
              <span>{item.name}</span>
              {item.yAxis === 'right' && (
                <span className="text-xs text-slate-500 dark:text-slate-400 ml-1">(prawa oś)</span>
              )}
            </button>
          );
        })}
      </div>
    );
  };

  if (isLoading) {
    return (
      <Card className="bg-white/60 backdrop-blur-sm dark:bg-slate-800/60 border-slate-200/60 dark:border-slate-700/40 mb-8">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div>
            <CardTitle className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Wykorzystanie zasobów klastra
            </CardTitle>
            <CardDescription className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Monitoring aktywnych sesji, kontenerów, GPU, RAM i CPU
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 px-3 py-1 bg-emerald-50 dark:bg-emerald-950/30 rounded-full">
            <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <span className="text-sm text-emerald-700 dark:text-emerald-300">Monitoring</span>
          </div>
        </CardHeader>
        <CardContent className="pb-6">
          <div className="h-[350px] flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-emerald-500 border-t-transparent"></div>
              <span className="text-sm text-slate-500 dark:text-slate-400">Ładowanie danych monitoringu...</span>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const hasData = data.length > 0;
  const maxValues = hasData ? {
    users: Math.max(...data.map(d => d.logged_in_users)),
    containers: Math.max(...data.map(d => d.active_containers)),
    gpus: Math.max(...data.map(d => d.used_gpus)),
    ram: Math.max(...data.map(d => d.reserved_ram_gb)),
    cpu: Math.max(...data.map(d => d.used_cpu_threads)),
  } : null;

  return (
    <Card className="bg-white/60 backdrop-blur-sm dark:bg-slate-800/60 border-slate-200/60 dark:border-slate-700/40 hover:bg-white/70 hover:border-slate-300/70 dark:hover:bg-slate-800/70 dark:hover:border-slate-600/50 transition-all duration-300 mb-8">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div>
          <CardTitle className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Wykorzystanie zasobów klastra
          </CardTitle>
          <CardDescription className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Monitoring aktywnych sesji, kontenerów, GPU, RAM i CPU • {data.length} pomiarów
          </CardDescription>
        </div>
        <div className="flex items-center gap-2 px-3 py-1 bg-emerald-50 dark:bg-emerald-950/30 rounded-full">
          <Activity className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          <span className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
            {hasData ? 'Aktywny' : 'Brak danych'}
          </span>
        </div>
      </CardHeader>
      <CardContent className="pb-6">
        <CustomLegend />
        {hasData ? (
          <div className="h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={data}
                margin={{ top: 20, right: 60, left: 20, bottom: 60 }}
              >
                <defs>
                  <linearGradient id="usersGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.1} />
                  </linearGradient>
                  <linearGradient id="containersGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.1} />
                  </linearGradient>
                  <linearGradient id="gpusGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.1} />
                  </linearGradient>
                  <linearGradient id="ramGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.1} />
                  </linearGradient>
                  <linearGradient id="cpuGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0.1} />
                  </linearGradient>
                </defs>
                <CartesianGrid 
                  strokeDasharray="3 3" 
                  stroke="currentColor" 
                  className="opacity-20 dark:opacity-10"
                  vertical={false}
                />
                <XAxis
                  dataKey="timestamp"
                  tickFormatter={formatTimestamp}
                  axisLine={false}
                  tickLine={false}
                  tick={{ 
                    fontSize: 12, 
                    fill: 'currentColor',
                    className: 'text-slate-500 dark:text-slate-400'
                  }}
                  tickMargin={8}
                />
                {/* Lewa oś Y - dla wszystkich metryk oprócz RAM */}
                <YAxis
                  yAxisId="left"
                  axisLine={false}
                  tickLine={false}
                  tick={{ 
                    fontSize: 12, 
                    fill: 'currentColor',
                    className: 'text-slate-500 dark:text-slate-400'
                  }}
                  tickMargin={8}
                  label={{ 
                    value: 'Liczba', 
                    angle: -90, 
                    position: 'insideLeft',
                    style: { textAnchor: 'middle' },
                    className: 'text-slate-600 dark:text-slate-400'
                  }}
                />
                {/* Prawa oś Y - dla RAM i CPU */}
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  axisLine={false}
                  tickLine={false}
                  tick={{ 
                    fontSize: 12, 
                    fill: '#8b5cf6',
                    className: 'text-purple-500 dark:text-purple-400'
                  }}
                  tickMargin={8}
                  label={{ 
                    value: 'RAM (GB) / CPU', 
                    angle: 90, 
                    position: 'insideRight',
                    style: { textAnchor: 'middle', fill: '#8b5cf6' },
                    className: 'text-purple-500 dark:text-purple-400'
                  }}
                />
                <Tooltip content={<CustomTooltip />} />
                
                {/* Wykres obszarowy dla użytkowników */}
                {visibleMetrics.logged_in_users && (
                  <Area
                    yAxisId="left"
                    type="monotone"
                    dataKey="logged_in_users"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    fill="url(#usersGradient)"
                    name="Aktywne sesje"
                    connectNulls={false}
                  />
                )}
                
                {/* Wykres obszarowy dla kontenerów */}
                {visibleMetrics.active_containers && (
                  <Area
                    yAxisId="left"
                    type="monotone"
                    dataKey="active_containers"
                    stroke="#10b981"
                    strokeWidth={2}
                    fill="url(#containersGradient)"
                    name="Aktywne kontenery"
                    connectNulls={false}
                  />
                )}
                
                {/* Wykres liniowy dla GPU */}
                {visibleMetrics.used_gpus && (
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="used_gpus"
                    stroke="#f59e0b"
                    strokeWidth={3}
                    dot={{ fill: '#f59e0b', strokeWidth: 2, r: 4 }}
                    name="Używane GPU"
                    connectNulls={false}
                  />
                )}
                
                {/* Wykres obszarowy dla RAM - PRAWA OŚ */}
                {visibleMetrics.reserved_ram_gb && (
                  <Area
                    yAxisId="right"
                    type="monotone"
                    dataKey="reserved_ram_gb"
                    stroke="#8b5cf6"
                    strokeWidth={2}
                    fill="url(#ramGradient)"
                    name="RAM (GB)"
                    connectNulls={false}
                  />
                )}
                
                {/* Wykres liniowy dla CPU - PRAWA OŚ */}
                {visibleMetrics.used_cpu_threads && (
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="used_cpu_threads"
                    stroke="#ef4444"
                    strokeWidth={3}
                    dot={{ fill: '#ef4444', strokeWidth: 2, r: 4 }}
                    name="Wątki CPU"
                    connectNulls={false}
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-[350px] flex items-center justify-center">
            <div className="text-center">
              <Activity className="h-12 w-12 text-slate-400 dark:text-slate-600 mx-auto mb-3" />
              <p className="text-sm text-slate-500 dark:text-slate-400">Brak danych monitoringu do wyświetlenia</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
