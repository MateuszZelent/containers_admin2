"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { jobsApi } from "@/lib/api-client";

const formSchema = z.object({
  job_name: z.string().min(3, "Nazwa musi mieć co najmniej 3 znaki").max(50, "Nazwa nie może przekraczać 50 znaków"),
  template_name: z.string().min(2, "Wybierz szablon"),
  num_cpus: z.coerce.number().int().min(10, "Minimum 1 CPU").max(128, "Maksimum 128 CPU"),
  memory_gb: z.coerce.number().int().min(24, "Minimum 1 GB").max(1024, "Maksimum 1024 GB"),
  num_gpus: z.coerce.number().int().min(0, "Minimum 0 GPU").max(16, "Maksimum 16 GPU"),
  time_limit: z.string().min(5, "Określ limit czasu (np. 24:00:00)"),
  preview: z.boolean().optional().default(false)
});

export default function SubmitJobPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [templates, setTemplates] = useState<string[]>([]);
  const [previewScript, setPreviewScript] = useState<string | null>(null);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      job_name: "",
      template_name: "",
      num_cpus: 10,
      memory_gb: 24,
      num_gpus: 0,
      time_limit: "24:00:00",
      preview: false
    },
  });

  // Pobierz dostępne szablony przy pierwszym renderowaniu
  useEffect(() => {
    async function fetchTemplates() {
      try {
        const response = await jobsApi.getTemplates();
        setTemplates(response.data);
      } catch (error) {
        toast.error("Nie udało się pobrać listy szablonów");
        console.error(error);
      }
    }
    fetchTemplates();
  }, []);

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsLoading(true);
    try {
      if (values.preview) {
        // Generuj podgląd bez wysyłania zadania
        const response = await jobsApi.createJob({ ...values, preview: true });
        setPreviewScript(response.data.script);
        toast.info("Wygenerowano podgląd skryptu");
      } else {
        // Wyślij zadanie
        const response = await jobsApi.createJob(values);
        toast.success(`Zadanie zostało utworzone! ID: ${response.data.job_id}`);
        router.push("/dashboard");
      }
    } catch (error: any) {
      const errorMessage = error.response?.data?.detail || "Błąd podczas wysyłania zadania";
      
      // Check for duplicate container name error (both English and potential Polish versions)
      const isDuplicateNameError = 
        errorMessage.includes("container with the name") && errorMessage.includes("already exists") ||
        errorMessage.includes("Container with name") && errorMessage.includes("already exists") ||
        errorMessage.includes("kontener o nazwie") && errorMessage.includes("już istnieje");
      
      // Check for resource limit errors
      const isResourceLimitError = 
        errorMessage.includes("Przekroczono limit") ||
        errorMessage.includes("limit") && (
          errorMessage.includes("kontenerów") ||
          errorMessage.includes("kart graficznych") ||
          errorMessage.includes("rdzeni CPU") ||
          errorMessage.includes("pamięci RAM") ||
          errorMessage.includes("węzłów")
        );
      
      if (isDuplicateNameError) {
        // Set form field error for better UX
        form.setError("job_name", {
          type: "manual",
          message: "Kontener o tej nazwie już istnieje. Wybierz inną nazwę."
        });
        
        // Show Polish toast message
        toast.error("Kontener o tej nazwie już istnieje. Wybierz inną nazwę.", {
          duration: 5000,
          closeButton: true
        });
      } else if (isResourceLimitError) {
        // Handle resource limit errors with better formatting
        const formattedMessage = errorMessage.replace(/\n/g, ' • ');
        
        toast.error(formattedMessage, {
          duration: 8000, // Longer duration for resource limit errors
          closeButton: true,
          style: {
            maxWidth: '500px',
            fontSize: '14px',
            lineHeight: '1.4'
          }
        });
        
        // Highlight relevant form fields based on error type
        if (errorMessage.includes("kart graficznych")) {
          form.setError("num_gpus", {
            type: "manual",
            message: "Przekroczono limit GPU dla Twojego konta"
          });
        } else if (errorMessage.includes("rdzeni CPU")) {
          form.setError("num_cpus", {
            type: "manual",
            message: "Przekroczono limit CPU dla Twojego konta"
          });
        } else if (errorMessage.includes("pamięci RAM")) {
          form.setError("memory_gb", {
            type: "manual",
            message: "Przekroczono limit pamięci RAM dla Twojego konta"
          });
        }
      } else {
        // Show original error message for other errors
        toast.error(errorMessage, {
          duration: 5000,
          closeButton: true
        });
      }
      
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Nowe zadanie</h1>
        <Button
          variant="outline"
          onClick={() => router.push("/dashboard")}
        >
          Powrót
        </Button>
      </div>

      <Card className="max-w-3xl mx-auto">
        <CardHeader>
          <CardTitle>Formularz tworzenia zadania</CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="job_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nazwa zadania</FormLabel>
                    <FormControl>
                      <Input placeholder="np. container_test" {...field} />
                    </FormControl>
                    <FormDescription>
                      Unikalna nazwa identyfikująca zadanie
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="template_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Szablon</FormLabel>
                    <FormControl>
                      <select
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        {...field}
                      >
                        <option value="">Wybierz szablon</option>
                        {templates.map((template) => (
                          <option key={template} value={template}>
                            {template}
                          </option>
                        ))}
                      </select>
                    </FormControl>
                    <FormDescription>
                      Wybierz szablon definiujący konfigurację kontenera
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="num_cpus"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Liczba CPU</FormLabel>
                      <FormControl>
                        <Input type="number" min={1} max={128} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="memory_gb"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Pamięć RAM (GB)</FormLabel>
                      <FormControl>
                        <Input type="number" min={1} max={1024} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="num_gpus"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Liczba GPU</FormLabel>
                      <FormControl>
                        <Input type="number" min={0} max={16} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="time_limit"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Limit czasu</FormLabel>
                      <FormControl>
                        <Input placeholder="24:00:00" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="flex space-x-2">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => {
                    form.setValue("preview", true);
                    form.handleSubmit(onSubmit)();
                    form.setValue("preview", false);
                  }}
                  disabled={isLoading}
                >
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Podgląd skryptu
                </Button>
                <Button type="submit" disabled={isLoading}>
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Wyślij zadanie
                </Button>
              </div>
            </form>
          </Form>
          
          {previewScript && (
            <div className="mt-6 border rounded-md p-4 bg-muted/50">
              <h3 className="font-medium mb-2">Podgląd skryptu:</h3>
              <pre className="whitespace-pre-wrap bg-muted p-2 rounded text-xs overflow-x-auto">
                {previewScript}
              </pre>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}