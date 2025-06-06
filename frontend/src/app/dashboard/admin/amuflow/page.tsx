"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { userApi } from "@/lib/api-client";
import { 
  GitBranch, 
  Play, 
  Cpu, 
  Zap, 
  Settings,
  FileText,
  ArrowRight,
  Workflow,
  Brain,
  Database
} from "lucide-react";
import { toast } from "sonner";

interface User {
  username: string;
  is_admin: boolean;
  is_superuser: boolean;
}

export default function AMUflowPage() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const response = await userApi.getCurrentUser();
        setCurrentUser(response.data);
        
        // Sprawdź czy użytkownik ma uprawnienia administratora
        if (!response.data.is_admin && !response.data.is_superuser) {
          toast.error("Brak uprawnień do tej sekcji");
          router.push("/dashboard");
          return;
        }
      } catch (error) {
        console.error("Error fetching user data:", error);
        toast.error("Błąd podczas pobierania danych użytkownika");
        router.push("/dashboard");
      } finally {
        setIsLoading(false);
      }
    };

    fetchUserData();
  }, [router]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Ładowanie AMUflow...</p>
        </div>
      </div>
    );
  }

  if (!currentUser?.is_admin && !currentUser?.is_superuser) {
    return (
      <div className="text-center py-8">
        <h1 className="text-2xl font-bold text-red-600 mb-4">Brak dostępu</h1>
        <p className="text-gray-600 dark:text-gray-400">Nie masz uprawnień do tej sekcji.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <GitBranch className="h-8 w-8 text-blue-600" />
          <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            AMUflow
          </h1>
          <Badge variant="secondary" className="bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
            v1.0.0
          </Badge>
        </div>
        <p className="text-lg text-muted-foreground">
          Platforma do automatyzacji zadań wsadowych Amumax i postprocessingu
        </p>
      </div>

      {/* Overview Cards */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-blue-200 dark:border-blue-800">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-blue-700 dark:text-blue-300">
              Flow Designer
            </CardTitle>
            <Workflow className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-900 dark:text-blue-100">0</div>
            <p className="text-xs text-muted-foreground">
              aktywnych przepływów
            </p>
          </CardContent>
        </Card>

        <Card className="border-green-200 dark:border-green-800">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-green-700 dark:text-green-300">
              Parsowane skrypty
            </CardTitle>
            <FileText className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-900 dark:text-green-100">0</div>
            <p className="text-xs text-muted-foreground">
              skryptów .mx3
            </p>
          </CardContent>
        </Card>

        <Card className="border-purple-200 dark:border-purple-800">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-purple-700 dark:text-purple-300">
              Postprocessing
            </CardTitle>
            <Brain className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-900 dark:text-purple-100">3</div>
            <p className="text-xs text-muted-foreground">
              dostępnych modułów
            </p>
          </CardContent>
        </Card>

        <Card className="border-orange-200 dark:border-orange-800">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-orange-700 dark:text-orange-300">
              Zadania w kolejce
            </CardTitle>
            <Cpu className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-900 dark:text-orange-100">0</div>
            <p className="text-xs text-muted-foreground">
              w systemie SLURM
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="overview">Przegląd</TabsTrigger>
          <TabsTrigger value="flows">Przepływy</TabsTrigger>
          <TabsTrigger value="modules">Moduły</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Quick Start */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-5 w-5 text-yellow-600" />
                  Szybki start
                </CardTitle>
                <CardDescription>
                  Rozpocznij pracę z AMUflow w kilku prostych krokach
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                        <span className="text-sm font-semibold text-blue-600 dark:text-blue-300">1</span>
                      </div>
                      <span className="text-sm font-medium">Utwórz nowy przepływ</span>
                    </div>
                    <Button 
                      size="sm" 
                      onClick={() => router.push("/dashboard/admin/amuflow/flow")}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                  
                  <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg opacity-60">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                        <span className="text-sm font-semibold text-gray-500">2</span>
                      </div>
                      <span className="text-sm font-medium text-gray-500">Załaduj skrypt .mx3</span>
                    </div>
                    <Button size="sm" disabled variant="outline">
                      Wkrótce
                    </Button>
                  </div>
                  
                  <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg opacity-60">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                        <span className="text-sm font-semibold text-gray-500">3</span>
                      </div>
                      <span className="text-sm font-medium text-gray-500">Konfiguruj postprocessing</span>
                    </div>
                    <Button size="sm" disabled variant="outline">
                      Wkrótce
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* System Status */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="h-5 w-5 text-green-600" />
                  Status systemu
                </CardTitle>
                <CardDescription>
                  Aktualny stan komponentów AMUflow
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Parser skryptów .mx3</span>
                    <Badge variant="default" className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
                      Gotowy
                    </Badge>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Flow Designer</span>
                    <Badge variant="default" className="bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                      Aktywny
                    </Badge>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Integracja SLURM</span>
                    <Badge variant="secondary" className="bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300">
                      W budowie
                    </Badge>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Moduły postprocessingu</span>
                    <Badge variant="default" className="bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300">
                      Dostępne
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="flows" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Przepływy pracy</CardTitle>
                  <CardDescription>
                    Zarządzaj przepływami automatyzacji Amumax
                  </CardDescription>
                </div>
                <Button 
                  onClick={() => router.push("/dashboard/admin/amuflow/flow")}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <Play className="h-4 w-4 mr-2" />
                  Nowy przepływ
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8">
                <Workflow className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  Brak przepływów
                </h3>
                <p className="text-gray-600 dark:text-gray-400 mb-4">
                  Rozpocznij tworzenie pierwszego przepływu automatyzacji.
                </p>
                <Button 
                  onClick={() => router.push("/dashboard/admin/amuflow/flow")}
                  variant="outline"
                >
                  Utwórz przepływ
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="modules" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {/* FFT Module */}
            <Card className="border-blue-200 dark:border-blue-800">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-blue-700 dark:text-blue-300">
                  <Zap className="h-5 w-5" />
                  FFT Analysis
                </CardTitle>
                <CardDescription>
                  Analiza spektralna sygnałów z symulacji
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    <strong>Wejścia:</strong> dane czasowe, częstotliwość próbkowania
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    <strong>Wyjścia:</strong> widmo częstotliwościowe, wykres
                  </div>
                  <div className="pt-2">
                    <Badge variant="default" className="bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                      Dostępny
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Spectrum Module */}
            <Card className="border-green-200 dark:border-green-800">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-green-700 dark:text-green-300">
                  <Brain className="h-5 w-5" />
                  Spectrum Analyzer
                </CardTitle>
                <CardDescription>
                  Analiza widma magnetycznego
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    <strong>Wejścia:</strong> pola magnetyczne, konfiguracja
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    <strong>Wyjścia:</strong> widmo, raporty, wizualizacje
                  </div>
                  <div className="pt-2">
                    <Badge variant="default" className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
                      Dostępny
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Custom Module */}
            <Card className="border-purple-200 dark:border-purple-800">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-purple-700 dark:text-purple-300">
                  <Settings className="h-5 w-5" />
                  Custom Processing
                </CardTitle>
                <CardDescription>
                  Moduły użytkownika do analizy danych
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    <strong>Wejścia:</strong> konfigurowalne
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    <strong>Wyjścia:</strong> konfigurowalne
                  </div>
                  <div className="pt-2">
                    <Badge variant="default" className="bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300">
                      Dostępny
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
