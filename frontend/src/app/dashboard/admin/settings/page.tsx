"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Settings, Monitor, Database, Shield } from "lucide-react";
import { userApi } from "@/lib/api-client";
import { User } from "@/lib/types";
import { ResourceMonitoringSettings } from "@/app/dashboard/components/resource-monitoring-settings";

export default function AdminSettings() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkAdminAccess = async () => {
      try {
        const userResponse = await userApi.getCurrentUser();
        const user = userResponse.data;
        
        if (!user.is_superuser) {
          router.push("/dashboard");
          return;
        }
        
        setCurrentUser(user);
      } catch (error) {
        console.error("Error checking admin access:", error);
        router.push("/dashboard");
      } finally {
        setIsLoading(false);
      }
    };

    checkAdminAccess();
  }, [router]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">Sprawdzanie uprawnień...</span>
      </div>
    );
  }

  if (!currentUser?.is_superuser) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Settings className="h-8 w-8 text-blue-600" />
          Ustawienia główne
        </h1>
        <p className="text-muted-foreground">
          Konfiguracja systemu i zaawansowane ustawienia administracyjne
        </p>
      </div>

      {/* Settings Sections */}
      <div className="space-y-6">
        {/* Resource Monitoring Settings */}
        <Card className="bg-white/60 backdrop-blur-sm dark:bg-slate-800/60">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-100 dark:bg-emerald-900/50 rounded-lg">
                <Monitor className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <CardTitle className="text-xl">Ustawienia monitoringu zasobów</CardTitle>
                <CardDescription className="mt-1">
                  Konfiguracja częstotliwości monitorowania wykorzystania zasobów systemu
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <ResourceMonitoringSettings />
          </CardContent>
        </Card>

        {/* Future Settings Placeholders */}
        <Card className="bg-white/60 backdrop-blur-sm dark:bg-slate-800/60">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/50 rounded-lg">
                <Database className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <CardTitle className="text-xl">Ustawienia bazy danych</CardTitle>
                <CardDescription className="mt-1">
                  Konfiguracja połączeń z bazą danych i optymalizacja wydajności
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center h-32 text-muted-foreground">
              <div className="text-center">
                <Database className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Dostępne wkrótce</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white/60 backdrop-blur-sm dark:bg-slate-800/60">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 dark:bg-purple-900/50 rounded-lg">
                <Shield className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <CardTitle className="text-xl">Ustawienia bezpieczeństwa</CardTitle>
                <CardDescription className="mt-1">
                  Konfiguracja zabezpieczeń, autentykacji i uprawnień systemowych
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center h-32 text-muted-foreground">
              <div className="text-center">
                <Shield className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Dostępne wkrótce</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
