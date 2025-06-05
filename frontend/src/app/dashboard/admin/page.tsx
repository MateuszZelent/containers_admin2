"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Loader2, 
  Users, 
  Server, 
  Activity, 
  ShieldCheck,
  ArrowRight
} from "lucide-react";
import { toast } from "sonner";
import { userApi, adminApi } from "@/lib/api-client";
import { User, Job } from "@/lib/types";
import Link from "next/link";

export default function AdminDashboard() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [stats, setStats] = useState({
    totalUsers: 0,
    activeUsers: 0,
    totalJobs: 0,
    runningJobs: 0,
    pendingJobs: 0,
    completedJobs: 0,
  });
  const [recentJobs, setRecentJobs] = useState<Job[]>([]);
  const [recentUsers, setRecentUsers] = useState<User[]>([]);
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
        
        // Fetch statistics
        const [usersResponse, jobsResponse] = await Promise.all([
          adminApi.getAllUsers(),
          adminApi.getAllJobs()
        ]);
        
        const users = usersResponse.data;
        const jobs = jobsResponse.data;
        
        setStats({
          totalUsers: users.length,
          activeUsers: users.filter((u: User) => u.is_active).length,
          totalJobs: jobs.length,
          runningJobs: jobs.filter((j: Job) => j.status === "RUNNING").length,
          pendingJobs: jobs.filter((j: Job) => j.status === "PENDING").length,
          completedJobs: jobs.filter((j: Job) => ["COMPLETED", "FAILED", "CANCELLED"].includes(j.status || "")).length,
        });
        
        // Get recent jobs and users
        setRecentJobs(jobs.slice(0, 5));
        setRecentUsers(users.slice(-5).reverse());
        
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
          <ShieldCheck className="h-8 w-8 text-blue-600" />
          Panel Administracyjny
        </h1>
        <p className="text-muted-foreground">
          Zarządzanie systemem kontenerów i użytkowników
        </p>
      </div>

      {/* Statistics Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-white/60 backdrop-blur-sm dark:bg-slate-800/60">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Użytkownicy</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalUsers}</div>
            <div className="text-xs text-muted-foreground">
              <span className="text-green-600">{stats.activeUsers} aktywnych</span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white/60 backdrop-blur-sm dark:bg-slate-800/60">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Zadania</CardTitle>
            <Server className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalJobs}</div>
            <div className="text-xs text-muted-foreground">
              <span className="text-green-600">{stats.runningJobs} uruchomionych</span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white/60 backdrop-blur-sm dark:bg-slate-800/60">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Status klastra</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">Online</div>
            <p className="text-xs text-muted-foreground">
              Wszystkie systemy działają
            </p>
          </CardContent>
        </Card>

        <Card className="bg-white/60 backdrop-blur-sm dark:bg-slate-800/60">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Uprawnienia</CardTitle>
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">Admin</div>
            <p className="text-xs text-muted-foreground">
              Pełny dostęp do systemu
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card className="bg-white/60 backdrop-blur-sm dark:bg-slate-800/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Zarządzanie użytkownikami
            </CardTitle>
            <CardDescription>
              Dodawaj, edytuj i zarządzaj kontami użytkowników
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground">
                <p>• Tworzenie nowych kont użytkowników</p>
                <p>• Edycja uprawnień i statusu kont</p>
                <p>• Monitorowanie aktywności użytkowników</p>
              </div>
              <Link href="/dashboard/admin/users">
                <Button className="w-full">
                  Zarządzaj użytkownikami
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white/60 backdrop-blur-sm dark:bg-slate-800/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="h-5 w-5" />
              Zarządzanie zadaniami
            </CardTitle>
            <CardDescription>
              Monitoruj i zarządzaj wszystkimi zadaniami w systemie
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground">
                <p>• Przegląd wszystkich zadań użytkowników</p>
                <p>• Monitorowanie wykorzystania zasobów</p>
                <p>• Zarządzanie priorytetami zadań</p>
              </div>
              <Link href="/dashboard/admin/jobs">
                <Button className="w-full">
                  Zarządzaj zadaniami
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
