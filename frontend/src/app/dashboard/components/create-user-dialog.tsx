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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { adminApi, jobsApi } from "@/lib/api-client";
import { handleApiError } from "@/lib/error-utils";

interface CreateUserDialogProps {
  onUserCreated?: () => void;
}

export function CreateUserDialog({ onUserCreated }: CreateUserDialogProps) {
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [availableTemplates, setAvailableTemplates] = useState<string[]>([]);
  const [formData, setFormData] = useState({
    username: "",
    email: "",
    first_name: "",
    last_name: "",
    password: "",
    is_active: true,
    is_superuser: false,
    max_containers: 6,
    max_gpus: 24,
    max_gpus_per_job: 0,
    max_time_limit_hours: 0,
    allowed_templates: [] as string[],
  });

  // Load available templates when dialog opens
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
    
    if (!formData.username || !formData.password) {
      toast.error("Nazwa użytkownika i hasło są wymagane");
      return;
    }

    setIsLoading(true);
    try {
      await adminApi.createUser(formData);
      toast.success("Użytkownik został utworzony pomyślnie");
      setOpen(false);
      setFormData({
        username: "",
        email: "",
        first_name: "",
        last_name: "",
        password: "",
        is_active: true,
        is_superuser: false,
        max_containers: 6,
        max_gpus: 24,
        max_gpus_per_job: 0,
        max_time_limit_hours: 0,
        allowed_templates: [],
      });
      onUserCreated?.();
    } catch (error: any) {
      const errorMessage = handleApiError(error, "Nie udało się utworzyć użytkownika");
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Dodaj użytkownika
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Dodaj nowego użytkownika</DialogTitle>
          <DialogDescription>
            Wprowadź dane nowego użytkownika systemu.
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
                Hasło *
              </Label>
              <Input
                id="password"
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="col-span-3"
                required
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
                onChange={(e) =>
                  setFormData({ ...formData, max_containers: Number(e.target.value) })
                }
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
                onChange={(e) =>
                  setFormData({ ...formData, max_gpus: Number(e.target.value) })
                }
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
                onChange={(e) =>
                  setFormData({ ...formData, max_gpus_per_job: Number(e.target.value) })
                }
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
                onChange={(e) =>
                  setFormData({ ...formData, max_time_limit_hours: Number(e.target.value) })
                }
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
                            const allowed = new Set(prev.allowed_templates)
                            if (checked) allowed.add(tpl)
                            else allowed.delete(tpl)
                            return { ...prev, allowed_templates: Array.from(allowed) }
                          })
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
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Anuluj
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Utwórz użytkownika
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
