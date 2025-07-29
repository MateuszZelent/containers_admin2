"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Monitor, Save, RefreshCcw, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { adminApi } from "@/lib/api-client";

interface ClusterMonitoringSettings {
  interval_minutes: number;
  current_status: 'active' | 'inactive';
  last_update: string | null;
  update_count: number;
}

export function ClusterMonitoringSettings() {
  const [settings, setSettings] = useState<ClusterMonitoringSettings | null>(null);
  const [selectedInterval, setSelectedInterval] = useState<string>("5");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setSaving] = useState(false);
  const [isRestarting, setIsRestarting] = useState(false);

  const intervalOptions = [
    { value: "1", label: "Co 1 minutę", description: "Bardzo częste monitorowanie (tylko do testów)" },
    { value: "2", label: "Co 2 minuty", description: "Częste monitorowanie" },
    { value: "5", label: "Co 5 minut", description: "Standardowe monitorowanie (zalecane)" },
    { value: "10", label: "Co 10 minut", description: "Rzadsze monitorowanie" },
    { value: "15", label: "Co 15 minut", description: "Rzadkie monitorowanie" },
    { value: "30", label: "Co 30 minut", description: "Bardzo rzadkie monitorowanie" },
  ];

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setIsLoading(true);
      const response = await adminApi.getClusterMonitoringSettings();
      setSettings(response.data);
      setSelectedInterval(response.data.interval_minutes.toString());
    } catch (error) {
      console.error("Failed to fetch cluster monitoring settings:", error);
      toast.error("Nie udało się pobrać ustawień monitoringu klastra");
    } finally {
      setIsLoading(false);
    }
  };

  const saveSettings = async () => {
    try {
      setSaving(true);
      const newInterval = parseInt(selectedInterval);
      
      await adminApi.updateClusterMonitoringInterval(newInterval);
      
      if (settings) {
        setSettings({
          ...settings,
          interval_minutes: newInterval
        });
      }
      
      toast.success(`Częstotliwość monitoringu klastra zmieniona na ${intervalOptions.find(opt => opt.value === selectedInterval)?.label.toLowerCase()}`);
    } catch (error) {
      console.error("Failed to save cluster monitoring settings:", error);
      toast.error("Nie udało się zapisać ustawień");
    } finally {
      setSaving(false);
    }
  };

  const restartMonitoring = async () => {
    try {
      setIsRestarting(true);
      
      await adminApi.restartClusterMonitoring();
      
      toast.success("Monitoring klastra został zrestartowany z nowymi ustawieniami");
      await fetchSettings();
    } catch (error) {
      console.error("Failed to restart cluster monitoring:", error);
      toast.error("Nie udało się zrestartować monitoringu klastra");
    } finally {
      setIsRestarting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <RefreshCcw className="h-5 w-5 animate-spin mr-2" />
        <span className="text-sm text-muted-foreground">Ładowanie ustawień klastra...</span>
      </div>
    );
  }

  if (!settings) {
    return (
      <Card className="bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
            <AlertCircle className="h-4 w-4" />
            <span className="text-sm">Nie udało się załadować ustawień monitoringu klastra</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  const hasChanges = selectedInterval !== settings.interval_minutes.toString();

  return (
    <div className="space-y-6">
      {/* Current Status */}
      <Card className="bg-slate-50 dark:bg-slate-900/50">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${
                settings.current_status === 'active' 
                  ? 'bg-green-500' 
                  : 'bg-red-500'
              }`} />
              <span className="font-medium">Status:</span>
              <span className={settings.current_status === 'active' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                {settings.current_status === 'active' ? 'Aktywny' : 'Nieaktywny'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Monitor className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">Obecna częstotliwość:</span>
              <span>co {settings.interval_minutes} min</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-medium">Aktualizacji:</span>
              <span>{settings.update_count}</span>
            </div>
          </div>
          {settings.last_update && (
            <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700 text-xs text-muted-foreground">
              Ostatnia aktualizacja: {new Date(settings.last_update).toLocaleString('pl-PL')}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Settings */}
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="cluster-interval-select" className="text-sm font-medium">
            Częstotliwość monitoringu klastra PCSS
          </Label>
          <Select value={selectedInterval} onValueChange={setSelectedInterval}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Wybierz częstotliwość..." />
            </SelectTrigger>
            <SelectContent>
              {intervalOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  <div className="flex flex-col">
                    <span>{option.label}</span>
                    <span className="text-xs text-muted-foreground">{option.description}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selectedInterval === "1" && (
          <Card className="bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800">
            <CardContent className="p-4">
              <div className="flex items-start gap-2 text-amber-700 dark:text-amber-400">
                <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <div className="text-sm">
                  <div className="font-medium">Uwaga!</div>
                  <div>Monitorowanie co minutę generuje częste połączenia SSH do klastra. Używaj tylko do testów.</div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="flex gap-3">
          <Button 
            onClick={saveSettings}
            disabled={!hasChanges || isSaving}
            className="flex-1"
          >
            <Save className="h-4 w-4 mr-2" />
            {isSaving ? "Zapisywanie..." : "Zapisz ustawienia"}
          </Button>
          
          <Button 
            variant="outline"
            onClick={restartMonitoring}
            disabled={isRestarting}
          >
            <RefreshCcw className={`h-4 w-4 mr-2 ${isRestarting ? 'animate-spin' : ''}`} />
            {isRestarting ? "Restartowanie..." : "Restartuj monitoring"}
          </Button>
        </div>

        {hasChanges && (
          <Card className="bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
            <CardContent className="p-3">
              <div className="text-sm text-blue-700 dark:text-blue-400">
                <div className="font-medium">Niezapisane zmiany</div>
                <div>Pamiętaj, aby zrestartować monitoring po zapisaniu, żeby nowe ustawienia zaczęły obowiązywać.</div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
