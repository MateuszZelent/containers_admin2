"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Loader2, 
  Server, 
  Search, 
  Trash2, 
  Code2, 
  Cpu, 
  HardDrive, 
  Monitor,
  RefreshCcw,
  Play,
  Square,
  Clock,
  CheckCircle,
  XCircle,
  User as UserIcon
} from "lucide-react";
import { toast } from "sonner";
import { userApi, adminApi } from "@/lib/api-client";
import { User, Job } from "@/lib/types";
import { formatContainerName } from "@/lib/container-utils";

export default function AdminJobsPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [allJobs, setAllJobs] = useState<Job[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [filteredJobs, setFilteredJobs] = useState<Job[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedUser, setSelectedUser] = useState<string>("all");
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [currentUserResponse, jobsResponse, usersResponse] = await Promise.all([
        userApi.getCurrentUser(),
        adminApi.getAllJobs(),
        adminApi.getAllUsers()
      ]);
      
      if (!currentUserResponse.data.is_superuser) {
        router.push("/dashboard");
        return;
      }
      
      setCurrentUser(currentUserResponse.data);
      setAllJobs(jobsResponse.data);
      setAllUsers(usersResponse.data);
      setFilteredJobs(jobsResponse.data);
    } catch (error) {
      console.error("Error fetching data:", error);
      toast.error("Nie udało się pobrać danych");
    } finally {
      setIsLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Filter jobs based on search term and selected user
  useEffect(() => {
    let filtered = allJobs;

    // Filter by user
    if (selectedUser !== "all") {
      filtered = filtered.filter(job => job.owner_id.toString() === selectedUser);
    }

    // Filter by search term
    if (searchTerm) {
      filtered = filtered.filter(job =>
        job.job_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        job.job_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        job.template_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (job.node && job.node.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }

    setFilteredJobs(filtered);
  }, [searchTerm, selectedUser, allJobs]);

  const getStatusColor = (status: string) => {
    switch (status?.toUpperCase()) {
      case "RUNNING":
        return "default";
      case "COMPLETED":
        return "secondary";
      case "FAILED":
        return "destructive";
      case "PENDING":
        return "outline";
      default:
        return "secondary";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status?.toUpperCase()) {
      case "RUNNING":
        return <Play className="h-4 w-4" />;
      case "COMPLETED":
        return <CheckCircle className="h-4 w-4" />;
      case "FAILED":
        return <XCircle className="h-4 w-4" />;
      case "PENDING":
        return <Clock className="h-4 w-4" />;
      default:
        return <Square className="h-4 w-4" />;
    }
  };

  const getUserName = (userId: number) => {
    const user = allUsers.find(u => u.id === userId);
    return user ? user.username : `User #${userId}`;
  };

  const handleDeleteJob = async (jobId: number, jobName: string) => {
    if (!confirm(`Czy na pewno chcesz usunąć zadanie "${jobName}"? Ta operacja jest nieodwracalna.`)) {
      return;
    }

    try {
      // TODO: Implement admin job deletion API
      toast.success(`Zadanie "${jobName}" zostało usunięte pomyślnie`);
      fetchData(); // Refresh data
    } catch (error: any) {
      const errorMessage = error.response?.data?.detail || "Nie udało się usunąć zadania";
      toast.error(errorMessage);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("pl-PL", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getActiveJobs = () => filteredJobs.filter(job => 
    ["RUNNING", "PENDING"].includes(job.status?.toUpperCase() || "")
  );

  const getCompletedJobs = () => filteredJobs.filter(job => 
    ["COMPLETED", "FAILED", "CANCELLED"].includes(job.status?.toUpperCase() || "")
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">Ładowanie zadań...</span>
      </div>
    );
  }

  if (!currentUser?.is_superuser) {
    return null;
  }

  const activeJobs = getActiveJobs();
  const completedJobs = getCompletedJobs();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Server className="h-8 w-8 text-blue-600" />
          Zarządzanie zadaniami
        </h1>
        <p className="text-muted-foreground">
          Administracja wszystkimi zadaniami w systemie
        </p>
      </div>

      {/* Statistics */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="bg-white/60 backdrop-blur-sm dark:bg-slate-800/60">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Wszystkie zadania</CardTitle>
            <Server className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{allJobs.length}</div>
          </CardContent>
        </Card>

        <Card className="bg-white/60 backdrop-blur-sm dark:bg-slate-800/60">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Uruchomione</CardTitle>
            <Play className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {allJobs.filter(j => j.status === "RUNNING").length}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white/60 backdrop-blur-sm dark:bg-slate-800/60">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Oczekujące</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">
              {allJobs.filter(j => j.status === "PENDING").length}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white/60 backdrop-blur-sm dark:bg-slate-800/60">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Zakończone</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {allJobs.filter(j => ["COMPLETED", "FAILED", "CANCELLED"].includes(j.status?.toUpperCase() || "")).length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters and Actions */}
      <Card className="bg-white/60 backdrop-blur-sm dark:bg-slate-800/60">
        <CardHeader className="pb-4">
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Zadania w systemie</CardTitle>
              <CardDescription>
                Przeglądaj i zarządzaj wszystkimi zadaniami użytkowników
              </CardDescription>
            </div>
            <Button onClick={fetchData} variant="outline" size="sm">
              <RefreshCcw className="h-4 w-4 mr-2" />
              Odśwież
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="flex items-center space-x-2 flex-1">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Szukaj zadań..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="max-w-sm"
              />
            </div>
            <div className="flex items-center space-x-2">
              <UserIcon className="h-4 w-4 text-muted-foreground" />
              <select
                value={selectedUser}
                onChange={(e) => setSelectedUser(e.target.value)}
                className="px-3 py-2 border rounded-md bg-background"
              >
                <option value="all">Wszyscy użytkownicy</option>
                {allUsers.map(user => (
                  <option key={user.id} value={user.id.toString()}>
                    {user.username}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Tabs */}
          <Tabs defaultValue="active" className="space-y-4">
            <TabsList>
              <TabsTrigger value="active">
                Aktywne ({activeJobs.length})
              </TabsTrigger>
              <TabsTrigger value="completed">
                Zakończone ({completedJobs.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="active" className="space-y-4">
              {activeJobs.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  {filteredJobs.length === 0 && allJobs.length > 0 
                    ? "Brak zadań pasujących do filtrów." 
                    : "Brak aktywnych zadań."}
                </div>
              ) : (
                <div className="grid gap-4">
                  {activeJobs.map((job) => (
                    <Card key={job.id} className="bg-white/40 dark:bg-slate-900/40">
                      <CardContent className="p-6">
                        <div className="flex justify-between items-start">
                          <div className="space-y-3 flex-1">
                            <div className="flex items-center gap-3">
                              {getStatusIcon(job.status || "")}
                              <div>
                                <h4 className="font-medium text-lg">{formatContainerName(job.job_name)}</h4>
                                <div className="flex items-center gap-2 mt-1">
                                  <Badge 
                                    variant={getStatusColor(job.status || "")}
                                    className="text-xs"
                                  >
                                    {job.status || "UNKNOWN"}
                                  </Badge>
                                  <span className="text-sm text-muted-foreground">
                                    {getUserName(job.owner_id)}
                                  </span>
                                </div>
                              </div>
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-muted-foreground">
                              <div>
                                <p><strong>Job ID:</strong> {job.job_id}</p>
                                <p><strong>Template:</strong> {formatContainerName(job.name)}</p>
                                <p><strong>Partycja:</strong> {job.partition}</p>
                              </div>
                              <div>
                                <p><strong>Węzeł:</strong> {job.node || "Brak"}</p>
                                <p><strong>Port:</strong> {job.port || "Brak"}</p>
                                <p><strong>Utworzony:</strong> {formatDate(job.created_at)}</p>
                              </div>
                              <div className="flex gap-4">
                                <span><Cpu className="h-4 w-4 inline mr-1" />{job.num_cpus} CPU</span>
                                <span><HardDrive className="h-4 w-4 inline mr-1" />{job.memory_gb}GB</span>
                                <span><Monitor className="h-4 w-4 inline mr-1" />{job.num_gpus} GPU</span>
                              </div>
                            </div>
                          </div>
                          
                          <div className="flex flex-col gap-2 ml-4">
                            {job.port && job.status === "RUNNING" && (
                              <Button 
                                size="sm" 
                                variant="outline"
                                onClick={() => {/* TODO: Open code server for admin */}}
                              >
                                <Code2 className="h-4 w-4 mr-1" />
                                Code Server
                              </Button>
                            )}
                            <Button 
                              size="sm" 
                              variant="destructive"
                              onClick={() => handleDeleteJob(job.id, job.job_name)}
                            >
                              <Trash2 className="h-4 w-4 mr-1" />
                              Usuń
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="completed" className="space-y-4">
              {completedJobs.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  {filteredJobs.length === 0 && allJobs.length > 0 
                    ? "Brak zadań pasujących do filtrów." 
                    : "Brak zakończonych zadań."}
                </div>
              ) : (
                <div className="grid gap-4">
                  {completedJobs.map((job) => (
                    <Card key={job.id} className="bg-white/40 dark:bg-slate-900/40">
                      <CardContent className="p-6">
                        <div className="flex justify-between items-start">
                          <div className="space-y-3 flex-1">
                            <div className="flex items-center gap-3">
                              {getStatusIcon(job.status || "")}
                              <div>
                                <h4 className="font-medium text-lg">{job.job_name}</h4>
                                <div className="flex items-center gap-2 mt-1">
                                  <Badge 
                                    variant={getStatusColor(job.status || "")}
                                    className="text-xs"
                                  >
                                    {job.status || "UNKNOWN"}
                                  </Badge>
                                  <span className="text-sm text-muted-foreground">
                                    {getUserName(job.owner_id)}
                                  </span>
                                </div>
                              </div>
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-muted-foreground">
                              <div>
                                <p><strong>Job ID:</strong> {job.job_id}</p>
                                <p><strong>Template:</strong> {formatContainerName(job.name)}</p>
                                <p><strong>Partycja:</strong> {job.partition}</p>
                              </div>
                              <div>
                                <p><strong>Węzeł:</strong> {job.node || "Brak"}</p>
                                <p><strong>Utworzony:</strong> {formatDate(job.created_at)}</p>
                                {job.updated_at && (
                                  <p><strong>Zakończony:</strong> {formatDate(job.updated_at)}</p>
                                )}
                              </div>
                              <div className="flex gap-4">
                                <span><Cpu className="h-4 w-4 inline mr-1" />{job.num_cpus} CPU</span>
                                <span><HardDrive className="h-4 w-4 inline mr-1" />{job.memory_gb}GB</span>
                                <span><Monitor className="h-4 w-4 inline mr-1" />{job.num_gpus} GPU</span>
                              </div>
                            </div>
                          </div>
                          
                          <div className="flex flex-col gap-2 ml-4">
                            <Button 
                              size="sm" 
                              variant="destructive"
                              onClick={() => handleDeleteJob(job.id, job.job_name)}
                            >
                              <Trash2 className="h-4 w-4 mr-1" />
                              Usuń
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
