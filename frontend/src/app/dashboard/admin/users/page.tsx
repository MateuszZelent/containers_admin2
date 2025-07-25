"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Users, Plus, Search, Trash2, Edit3, ShieldCheck, User as UserIcon } from "lucide-react";
import { toast } from "sonner";
import { userApi, adminApi } from "@/lib/api-client";
import { User } from "@/lib/types";
import { CreateUserDialog } from "../../components/create-user-dialog";
import { EditUserDialog } from "../../components/edit-user-dialog";
import { handleApiError } from "@/lib/error-utils";

export default function AdminUsersPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  
  // Dialog states
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  const fetchUsers = useCallback(async () => {
    try {
      const [currentUserResponse, usersResponse] = await Promise.all([
        userApi.getCurrentUser(),
        adminApi.getAllUsers()
      ]);
      
      if (!currentUserResponse.data.is_superuser) {
        router.push("/dashboard");
        return;
      }
      
      setCurrentUser(currentUserResponse.data);
      setAllUsers(usersResponse.data);
      setFilteredUsers(usersResponse.data);
    } catch (error) {
      console.error("Error fetching users:", error);
      toast.error("Nie udało się pobrać danych użytkowników");
    } finally {
      setIsLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Filter users based on search term
  useEffect(() => {
    if (!searchTerm) {
      setFilteredUsers(allUsers);
    } else {
      const filtered = allUsers.filter(user =>
        user.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (user.email && user.email.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (user.first_name && user.first_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (user.last_name && user.last_name.toLowerCase().includes(searchTerm.toLowerCase()))
      );
      setFilteredUsers(filtered);
    }
  }, [searchTerm, allUsers]);

  const handleEditUser = (user: User) => {
    setEditingUser(user);
    setIsEditDialogOpen(true);
  };

  const handleDeleteUser = async (userId: number, username: string) => {
    if (userId === currentUser?.id) {
      toast.error("Nie możesz usunąć własnego konta");
      return;
    }

    if (!confirm(`Czy na pewno chcesz usunąć użytkownika "${username}"? Ta operacja jest nieodwracalna.`)) {
      return;
    }

    try {
      await adminApi.deleteUser(userId);
      toast.success(`Użytkownik "${username}" został usunięty pomyślnie`);
      fetchUsers(); // Refresh users list
    } catch (error: any) {
      const errorMessage = handleApiError(error, "Nie udało się usunąć użytkownika");
      toast.error(errorMessage);
    }
  };

  const handleUserCreatedOrUpdated = () => {
    fetchUsers(); // Refresh users list
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">Ładowanie użytkowników...</span>
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
          <Users className="h-8 w-8 text-blue-600" />
          Zarządzanie użytkownikami
        </h1>
        <p className="text-muted-foreground">
          Administracja kontami użytkowników w systemie
        </p>
      </div>

      {/* Statistics */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-white/60 backdrop-blur-sm dark:bg-slate-800/60">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Wszyscy użytkownicy</CardTitle>
            <UserIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{allUsers.length}</div>
          </CardContent>
        </Card>

        <Card className="bg-white/60 backdrop-blur-sm dark:bg-slate-800/60">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Aktywni</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {allUsers.filter(u => u.is_active).length}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white/60 backdrop-blur-sm dark:bg-slate-800/60">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Administratorzy</CardTitle>
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {allUsers.filter(u => u.is_superuser).length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Actions and Search */}
      <Card className="bg-white/60 backdrop-blur-sm dark:bg-slate-800/60">
        <CardHeader className="pb-4">
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Lista użytkowników</CardTitle>
              <CardDescription>
                Zarządzaj kontami użytkowników systemu
              </CardDescription>
            </div>
            <CreateUserDialog onUserCreated={handleUserCreatedOrUpdated} />
          </div>
        </CardHeader>
        <CardContent>
          {/* Search */}
          <div className="flex items-center space-x-2 mb-6">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Szukaj użytkowników..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-sm"
            />
          </div>

          {/* Users List */}
          <div className="space-y-4">
            {filteredUsers.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {searchTerm ? "Nie znaleziono użytkowników pasujących do wyszukiwania." : "Brak użytkowników w systemie."}
              </div>
            ) : (
              filteredUsers.map((user) => (
                <Card key={user.id} className="bg-white/40 dark:bg-slate-900/40">
                  <CardContent className="p-6">
                    <div className="flex justify-between items-start">
                      <div className="space-y-3 flex-1">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center text-white font-medium">
                            {user.username.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <h4 className="font-medium text-lg">{user.username}</h4>
                            <div className="flex items-center gap-2 mt-1">
                              {user.is_superuser && (
                                <Badge variant="destructive" className="text-xs">
                                  Administrator
                                </Badge>
                              )}
                              <Badge 
                                variant={user.is_active ? "default" : "secondary"} 
                                className="text-xs"
                              >
                                {user.is_active ? "Aktywny" : "Nieaktywny"}
                              </Badge>
                            </div>
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-muted-foreground">
                          <div>
                            <p><strong>Email:</strong> {user.email || "Brak"}</p>
                            <p><strong>Imię i nazwisko:</strong> {user.first_name || user.last_name ? `${user.first_name || ""} ${user.last_name || ""}`.trim() : "Brak"}</p>
                          </div>
                          <div>
                            <p><strong>ID:</strong> {user.id}</p>
                            <p><strong>Utworzony:</strong> {formatDate(user.created_at)}</p>
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex flex-col gap-2 ml-4">
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => handleEditUser(user)}
                          className="w-20"
                        >
                          <Edit3 className="h-4 w-4 mr-1" />
                          Edytuj
                        </Button>
                        {user.id !== currentUser?.id && (
                          <Button 
                            size="sm" 
                            variant="destructive"
                            onClick={() => handleDeleteUser(user.id, user.username)}
                            className="w-20"
                          >
                            <Trash2 className="h-4 w-4 mr-1" />
                            Usuń
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Edit User Dialog */}
      <EditUserDialog
        user={editingUser}
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        onUserUpdated={handleUserCreatedOrUpdated}
      />
    </div>
  );
}
