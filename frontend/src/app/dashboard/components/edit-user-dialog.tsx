"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { adminApi, jobsApi } from "@/lib/api-client";
import { User } from "@/lib/types";
import { handleApiError } from "@/lib/error-utils";

interface EditUserDialogProps {
  user: User | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUserUpdated?: () => void;
}

export function EditUserDialog({ user, open, onOpenChange, onUserUpdated }: EditUserDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [availableTemplates, setAvailableTemplates] = useState<string[]>([]);
  const [formData, setFormData] = useState({
    username: user?.username || "",
    email: user?.email || "",
    first_name: user?.first_name || "",
    last_name: user?.last_name || "",
    password: "",
    is_active: user?.is_active ?? true,
    max_containers: user?.max_containers || 0,
    is_superuser: user?.is_superuser || false,
    max_gpus: user?.max_gpus || 0,
    max_gpus_per_job: user?.max_gpus_per_job || 0,
    max_time_limit_hours: user?.max_time_limit_hours || 0,
    allowed_templates: user?.allowed_templates || [] as string[],
  });

  // Update form data when user changes
  useEffect(() => {
    if (user) {
      setFormData({
        username: user.username,
        email: user.email || "",
        first_name: user.first_name || "",
        last_name: user.last_name || "",
        password: "",
        is_active: user.is_active,
        max_containers: user.max_containers || 0,
        is_superuser: user.is_superuser,
        max_gpus: user.max_gpus || 0,
        max_gpus_per_job: user.max_gpus_per_job || 0,
        max_time_limit_hours: user.max_time_limit_hours || 0,
        allowed_templates: user.allowed_templates || [],
      });
    }
  }, [user]);

  // Load templates when dialog opens
  useEffect(() => {
    if (!open) return;
    const load = async () => {
      try {
        const res = await jobsApi.getTemplates();
        setAvailableTemplates(res.data);
      } catch (e) {
        console.error("Failed to load templates", e);
      }
    };
    load();
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user) return;

    if (!formData.username) {
      toast.error("Nazwa użytkownika jest wymagana");
      return;
    }

    setIsLoading(true);
    try {
      // Prepare update data, only include changed fields
      const updateData: any = {};
      
      if (formData.username !== user.username) updateData.username = formData.username;
      if (formData.email !== user.email) updateData.email = formData.email;
      if (formData.first_name !== user.first_name) updateData.first_name = formData.first_name;
      if (formData.last_name !== user.last_name) updateData.last_name = formData.last_name;
      if (formData.password) updateData.password = formData.password;
      if (formData.is_active !== user.is_active) updateData.is_active = formData.is_active;
      if (formData.max_containers !== user.max_containers) updateData.max_containers = formData.max_containers;
      if (formData.is_superuser !== user.is_superuser) updateData.is_superuser = formData.is_superuser;
      if (formData.max_gpus !== user.max_gpus) updateData.max_gpus = formData.max_gpus;
      if (formData.max_gpus_per_job !== user.max_gpus_per_job) updateData.max_gpus_per_job = formData.max_gpus_per_job;
      if (formData.max_time_limit_hours !== user.max_time_limit_hours) updateData.max_time_limit_hours = formData.max_time_limit_hours;
      if (JSON.stringify(formData.allowed_templates || []) !== JSON.stringify(user.allowed_templates || [])) {
        updateData.allowed_templates = formData.allowed_templates;
      }

      await adminApi.updateUser(user.id, updateData);
      toast.success("Użytkownik został zaktualizowany pomyślnie");
      onOpenChange(false);
      onUserUpdated?.();
    } catch (error: any) {
      const errorMessage = handleApiError(error, "Nie udało się zaktualizować użytkownika");
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Edytuj użytkownika</DialogTitle>
          <DialogDescription>
            Modyfikuj dane użytkownika {user.username}.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="username" className="text-right">
                Nazwa użytkownika *
              </Label>
              <Input
                id="username"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                className="col-span-3"
                required
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="email" className="text-right">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="first_name" className="text-right">
                Imię
              </Label>
              <Input
                id="first_name"
                value={formData.first_name}
                onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="last_name" className="text-right">
                Nazwisko
              </Label>
              <Input
                id="last_name"
                value={formData.last_name}
                onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="password" className="text-right">
                Nowe hasło
              </Label>
              <Input
                id="password"
                type="password" autoComplete="new-password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="col-span-3"
                placeholder="Pozostaw puste, aby nie zmieniać"
              />
            </div>
            {/* Resource limits */}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="max_containers" className="text-right">
                Maks. kontenerów
              </Label>
              <Input
                id="max_containers"
                type="number"
                value={formData.max_containers}
                onChange={(e) => setFormData({ ...formData, max_containers: Number(e.target.value) })}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="max_gpus" className="text-right">
                Maks. GPU łącznie
              </Label>
              <Input
                id="max_gpus"
                type="number"
                value={formData.max_gpus}
                onChange={(e) => setFormData({ ...formData, max_gpus: Number(e.target.value) })}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="max_gpus_per_job" className="text-right">
                Maks. GPU na kontener
              </Label>
              <Input
                id="max_gpus_per_job"
                type="number"
                value={formData.max_gpus_per_job}
                onChange={(e) => setFormData({ ...formData, max_gpus_per_job: Number(e.target.value) })}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="max_time_limit_hours" className="text-right">
                Maks. czas pracy [h]
              </Label>
              <Input
                id="max_time_limit_hours"
                type="number"
                value={formData.max_time_limit_hours}
                onChange={(e) => setFormData({ ...formData, max_time_limit_hours: Number(e.target.value) })}
                className="col-span-3"
              />
            </div>

            {/* Template permissions */}
            {availableTemplates.length > 0 && (
              <div className="grid grid-cols-4 gap-4">
                <Label className="text-right mt-1">Szablony</Label>
                <div className="col-span-3 space-y-2 max-h-32 overflow-y-auto border rounded-md p-2">
                  {availableTemplates.map((tpl) => (
                    <div key={tpl} className="flex items-center space-x-2">
                      <Checkbox
                        id={`tpl_${tpl}`}
                        checked={formData.allowed_templates.includes(tpl)}
                        onCheckedChange={(checked) => {
                          setFormData((prev) => {
                            const allowed = new Set(prev.allowed_templates);
                            if (checked) allowed.add(tpl);
                            else allowed.delete(tpl);
                            return { ...prev, allowed_templates: Array.from(allowed) };
                          });
                        }}
                      />
                      <Label htmlFor={`tpl_${tpl}`} className="text-sm">
                        {tpl}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">Opcje</Label>
              <div className="col-span-3 space-y-3">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="is_active"
                    checked={formData.is_active}
                    onCheckedChange={(checked) => 
                      setFormData({ ...formData, is_active: !!checked })
                    }
                  />
                  <Label htmlFor="is_active" className="text-sm">
                    Konto aktywne
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="is_superuser"
                    checked={formData.is_superuser}
                    onCheckedChange={(checked) => 
                      setFormData({ ...formData, is_superuser: !!checked })
                    }
                  />
                  <Label htmlFor="is_superuser" className="text-sm">
                    Administrator
                  </Label>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Anuluj
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Zapisz zmiany
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
