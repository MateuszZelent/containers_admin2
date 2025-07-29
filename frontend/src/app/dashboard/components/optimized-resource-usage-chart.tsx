"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { clusterApi } from "@/lib/api-client";
import { 
  TrendingUp, 
  Activity, 
  Users, 
  Server, 
  Cpu, 
  HardDrive, 
  Zap,
  Clock,
  BarChart3,
  Loader2,
  Settings2
} from "lucide-react";
import { toast } from "sonner";
import { debugLog, perfLog } from "@/lib/debug";

interface OptimizedDataPoint {
  timestamp: string;
  logged_in_users: number;
  active_containers: number;
  used_gpus: number;
  reserved_ram_gb: number;
  used_cpu_threads: number;
  sample_count: number;
  aggregated: boolean;
  aggregation_level: string;
}

interface OptimizedDataResponse {
  data: OptimizedDataPoint[];
  metadata: {
    time_range: string;
    aggregation_level: string;
    max_points: number;
    actual_points: number;
    optimized: boolean;
  };
}

interface TimeRangeOption {
  value: string;
  label: string;
  description: string;
  points: string;
}

interface VisibilityState {
  logged_in_users: boolean;
  active_containers: boolean;
  used_gpus: boolean;
  reserved_ram_gb: boolean;
  used_cpu_threads: boolean;
}

export function OptimizedResourceUsageChart() {
  const [data, setData] = useState<OptimizedDataPoint[]>([]);
  const [metadata, setMetadata] = useState<OptimizedDataResponse['metadata'] | null>(null);
  const [timeRanges, setTimeRanges] = useState<TimeRangeOption[]>([]);
  const [selectedTimeRange, setSelectedTimeRange] = useState<string>("24h");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [visibleMetrics, setVisibleMetrics] = useState<VisibilityState>({
    logged_in_users: true,
    active_containers: true,
    used_gpus: false,
    reserved_ram_gb: true,
    used_cpu_threads: false,
  });

  // Fetch available time ranges on component mount
  useEffect(() => {
    const fetchTimeRanges = async () => {
      try {
        perfLog.start('fetchTimeRanges');
        debugLog.api('Fetching available time ranges...');
        const response = await clusterApi.getTimeRanges();
        debugLog.api('Time ranges response:', response.data);
        
        if (response.data && response.data.time_ranges) {
          setTimeRanges(response.data.time_ranges);
          setSelectedTimeRange(response.data.default || "24h");
        } else {
          debugLog.warn('Invalid time ranges response, using fallback');
          // Fallback to default ranges
          setTimeRanges([
            { value: "1h", label: "Ostatnia godzina", description: "Dane co 1 minutę", points: "~60 punktów" },
            { value: "6h", label: "Ostatnie 6 godzin", description: "Średnie 5-minutowe", points: "~72 punkty" },
            { value: "12h", label: "Ostatnie 12 godzin", description: "Średnie 15-minutowe", points: "~48 punktów" },
            { value: "24h", label: "Ostatnie 24 godziny", description: "Średnie 15-minutowe", points: "~96 punktów" },
            { value: "3d", label: "Ostatnie 3 dni", description: "Średnie godzinowe", points: "~72 punkty" },
            { value: "7d", label: "Ostatni tydzień", description: "Średnie godzinowe", points: "~168 punktów" },
            { value: "14d", label: "Ostatnie 2 tygodnie", description: "Średnie godzinowe", points: "~336 punktów" }
          ]);
          setSelectedTimeRange("24h");
        }
        perfLog.end('fetchTimeRanges');
      } catch (error) {
        debugLog.error("Failed to fetch time ranges:", error);
        // Fallback to default ranges
        setTimeRanges([
          { value: "1h", label: "Ostatnia godzina", description: "Dane co 1 minutę", points: "~60 punktów" },
          { value: "6h", label: "Ostatnie 6 godzin", description: "Średnie 5-minutowe", points: "~72 punkty" },
          { value: "12h", label: "Ostatnie 12 godzin", description: "Średnie 15-minutowe", points: "~48 punktów" },
          { value: "24h", label: "Ostatnie 24 godziny", description: "Średnie 15-minutowe", points: "~96 punktów" },
          { value: "3d", label: "Ostatnie 3 dni", description: "Średnie godzinowe", points: "~72 punkty" },
          { value: "7d", label: "Ostatni tydzień", description: "Średnie godzinowe", points: "~168 punktów" },
          { value: "14d", label: "Ostatnie 2 tygodnie", description: "Średnie godzinowe", points: "~336 punktów" }
        ]);
        setSelectedTimeRange("24h");
      }
    };

    fetchTimeRanges();
  }, []);

  // Fetch optimized data based on selected time range
  const fetchData = useCallback(async (timeRange: string, isRefresh = false) => {
    try {
      if (isRefresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      perfLog.start(`fetchData-${timeRange}`);
      debugLog.chart(`Fetching optimized data for time range: ${timeRange}`);
      const response = await clusterApi.getOptimizedUsageData(timeRange);
      debugLog.chart('Optimized data response structure:', {
        hasData: !!response.data,
        hasDataArray: !!response.data?.data,
        dataLength: response.data?.data?.length || 0,
        hasMetadata: !!response.data?.metadata
      });
      
      // Handle the response structure
      const responseData = response.data;
      
      if (responseData && responseData.data) {
        setData(responseData.data);
        setMetadata(responseData.metadata);
        debugLog.chart(`Loaded ${responseData.data.length} data points for ${timeRange}`);
      } else {
        debugLog.error('Invalid response structure:', responseData);
        setData([]);
        setMetadata(null);
      }
      
      if (isRefresh) {
        toast.success(`Wykres zaktualizowany (${responseData.metadata?.actual_points || 0} punktów)`);
      }
      perfLog.end(`fetchData-${timeRange}`);
    } catch (error) {
      debugLog.error("Failed to fetch optimized usage data:", error);
      toast.error("Nie udało się pobrać danych monitoringu");
      
      // Fallback to empty data
      setData([]);
      setMetadata(null);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  // Load data when time range changes
  useEffect(() => {
    if (selectedTimeRange) {
      fetchData(selectedTimeRange);
    }
  }, [selectedTimeRange, fetchData]);

  const toggleMetric = useCallback((metricKey: keyof VisibilityState) => {
    setVisibleMetrics(prev => ({
      ...prev,
      [metricKey]: !prev[metricKey]
    }));
  }, []);

  // Memoized data processing for better performance
  const processedData = useMemo(() => {
    if (!data.length) return [];
    
    return data.map(item => ({
      ...item,
      // Format timestamp for display
      displayTime: new Date(item.timestamp).toLocaleTimeString('pl-PL', { 
        hour: '2-digit', 
        minute: '2-digit',
        day: selectedTimeRange.includes('d') ? '2-digit' : undefined,
        month: selectedTimeRange.includes('d') ? 'short' : undefined,
      })
    }));
  }, [data, selectedTimeRange]);

  // Intelligent axis formatting
  const getTimeFormat = useCallback((timestamp: string) => {
    const date = new Date(timestamp);
    
    if (selectedTimeRange === "1h" || selectedTimeRange === "6h") {
      return date.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
    } else if (selectedTimeRange === "12h" || selectedTimeRange === "24h") {
      return date.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
    } else {
      // For multi-day ranges, show day and hour
      return `${date.getDate()}/${date.getMonth() + 1} ${date.getHours()}:00`;
    }
  }, [selectedTimeRange]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const date = new Date(label);
      const isAggregated = payload[0]?.payload?.aggregated || false;
      
      return (
        <div className="bg-white/95 backdrop-blur-sm dark:bg-slate-800/95 border border-slate-200/50 dark:border-slate-700/50 rounded-lg p-4 shadow-lg min-w-[300px]">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-2">
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                {date.toLocaleDateString('pl-PL')} • {date.toLocaleTimeString('pl-PL')}
              </p>
              {isAggregated && (
                <Badge variant="secondary" className="text-xs">
                  Średnia z {payload[0]?.payload?.sample_count || 1} pomiarów
                </Badge>
              )}
            </div>
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
                    {isAggregated && entry.dataKey !== 'logged_in_users' && entry.dataKey !== 'active_containers' && entry.dataKey !== 'used_gpus'
                      ? parseFloat(entry.value).toFixed(1)
                      : Math.round(entry.value)
                    }
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
      <div className="flex flex-wrap justify-center gap-3 mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
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
              Inteligentny monitoring z optymalizacją wydajności
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 px-3 py-1 bg-blue-50 dark:bg-blue-950/30 rounded-full">
            <Loader2 className="h-4 w-4 text-blue-600 dark:text-blue-400 animate-spin" />
            <span className="text-sm text-blue-700 dark:text-blue-300">Ładowanie...</span>
          </div>
        </CardHeader>
        <CardContent className="pb-6">
          <div className="h-[400px] flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent"></div>
              <span className="text-sm text-slate-500 dark:text-slate-400">Optymalizacja danych wykresu...</span>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const hasData = data.length > 0;

  return (
    <Card className="bg-white/60 backdrop-blur-sm dark:bg-slate-800/60 border-slate-200/60 dark:border-slate-700/40 hover:bg-white/70 hover:border-slate-300/70 dark:hover:bg-slate-800/70 dark:hover:border-slate-600/50 transition-all duration-300 mb-8">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div className="flex-1">
          <CardTitle className="text-lg font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Wykorzystanie zasobów klastra
          </CardTitle>
          <CardDescription className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            {metadata && (
              <>
                {metadata.aggregation_level !== 'raw' ? 'Dane zagregowane' : 'Surowe dane'} • 
                {metadata.actual_points} punktów • 
                {timeRanges.find(r => r.value === selectedTimeRange)?.description || selectedTimeRange}
              </>
            )}
          </CardDescription>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Time Range Selector */}
          <Select value={selectedTimeRange} onValueChange={setSelectedTimeRange}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Wybierz zakres" />
            </SelectTrigger>
            <SelectContent>
              {timeRanges.map((range) => (
                <SelectItem key={range.value} value={range.value}>
                  <div className="flex flex-col">
                    <span className="font-medium">{range.label}</span>
                    <span className="text-xs text-slate-500">{range.points}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Refresh Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchData(selectedTimeRange, true)}
            disabled={isRefreshing}
            className="shrink-0"
          >
            {isRefreshing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Activity className="h-4 w-4" />
            )}
          </Button>

          {/* Status Badge */}
          <div className="flex items-center gap-2 px-3 py-1 bg-emerald-50 dark:bg-emerald-950/30 rounded-full">
            <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <span className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
              {metadata?.optimized ? 'Zoptymalizowany' : 'Standardowy'}
            </span>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="pb-6">
        <CustomLegend />
        {hasData ? (
          <div className="h-[400px] mt-6">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={processedData}
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
                  tickFormatter={getTimeFormat}
                  axisLine={false}
                  tickLine={false}
                  tick={{ 
                    fontSize: 12, 
                    fill: 'currentColor',
                    className: 'text-slate-500 dark:text-slate-400'
                  }}
                  tickMargin={8}
                  interval="preserveStartEnd"
                />
                
                {/* Left Y-axis for counts */}
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
                
                {/* Right Y-axis for RAM and CPU */}
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
                
                {/* Chart Areas and Lines */}
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
          <div className="h-[400px] flex items-center justify-center mt-6">
            <div className="text-center">
              <Activity className="h-12 w-12 text-slate-400 dark:text-slate-600 mx-auto mb-3" />
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Brak danych monitoringu dla wybranego zakresu czasowego
              </p>
            </div>
          </div>
        )}
        
        {/* Metadata Footer */}
        {metadata && (
          <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  <span>Zakres: {metadata.time_range}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Settings2 className="h-3 w-3" />
                  <span>Agregacja: {metadata.aggregation_level}</span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <BarChart3 className="h-3 w-3" />
                <span>{metadata.actual_points}/{metadata.max_points} punktów</span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
