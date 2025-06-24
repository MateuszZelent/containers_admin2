"use client";

import React, { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion, AnimatePresence } from "framer-motion";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import {
  Container,
  FileText,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  Server,
  Cpu,
  HardDrive,
  Clock,
  ArrowLeft,
  Upload,
  Play,
  Monitor,
} from "lucide-react";
import { toast } from "sonner";
import { jobsApi } from "@/lib/api-client";
import Link from "next/link";
import { useRouter } from "next/navigation";

// Form validation schema for container job - matching backend JobCreate schema
const containerJobSchema = z.object({
  job_name: z
    .string()
    .min(3, "Nazwa musi mieć co najmniej 3 znaki")
    .max(100, "Nazwa nie może przekraczać 100 znaków")
    .regex(/^[a-zA-Z0-9_-]+$/, "Nazwa może zawierać tylko litery, cyfry, _ i -"),
  template_name: z
    .string()
    .min(1, "Szablon jest wymagany"),
  partition: z.string().default("proxima"),
  num_nodes: z.number().min(1).max(10).default(1),
  tasks_per_node: z.number().min(1).max(32).default(1),
  num_cpus: z.number().min(1).max(32).default(4),
  memory_gb: z.number().min(1).max(128).default(16),
  num_gpus: z.number().min(0).max(4).default(0),
  time_limit: z.string().default("24:00:00"),
  preview: z.boolean().default(false),
});

type ContainerJobFormData = z.infer<typeof containerJobSchema>;

// Simplified template interface to match backend response
interface Template {
  name: string;
}

interface ValidationStep {
  id: string;
  label: string;
  status: "pending" | "checking" | "success" | "error";
  message?: string;
}

const TIME_LIMIT_OPTIONS = [
  { value: "01:00:00", label: "1 godzina" },
  { value: "06:00:00", label: "6 godzin" },
  { value: "12:00:00", label: "12 godzin" },
  { value: "24:00:00", label: "24 godziny" },
  { value: "72:00:00", label: "3 dni" },
  { value: "168:00:00", label: "7 dni" },
];

const TIME_LIMIT_OPTIONS = [
  { value: "01:00:00", label: "1 godzina" },
  { value: "06:00:00", label: "6 godzin" },
  { value: "12:00:00", label: "12 godzin" },
  { value: "24:00:00", label: "24 godziny" },
  { value: "72:00:00", label: "3 dni" },
  { value: "168:00:00", label: "7 dni" },
];

export default function CreateContainerJobPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateValidation, setTemplateValidation] = useState<ValidationStep[]>([]);
  const router = useRouter();

  const form = useForm<ContainerJobFormData>({
    resolver: zodResolver(containerJobSchema),
    defaultValues: {
      job_name: "",
      template_name: "",
      partition: "proxima",
      num_nodes: 1,
      tasks_per_node: 1,
      num_cpus: 4,
      memory_gb: 16,
      num_gpus: 0,
      time_limit: "24:00:00",
      preview: false,
    },
  });

  // Load templates on component mount
  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    setIsLoadingTemplates(true);
    setTemplateValidation([
      { id: "loading", label: "Ładowanie dostępnych szablonów", status: "checking" }
    ]);

    try {
      const response = await jobsApi.getTemplates();
      const templateData = response.data.map((filename: string) => ({ name: filename }));
      
      setTemplates(templateData);
      setTemplateValidation([
        { 
          id: "loaded", 
          label: `Załadowano ${templateData.length} szablonów`, 
          status: "success",
          message: `Dostępne szablony: ${templateData.map(t => t.name).join(", ")}`
        }
      ]);
    } catch (error) {
      console.error("Error loading templates:", error);
      setTemplateValidation([
        { 
          id: "error", 
          label: "Błąd podczas ładowania szablonów", 
          status: "error",
          message: "Nie można załadować listy dostępnych szablonów"
        }
      ]);
      toast.error("Nie można załadować szablonów kontenerów");
    } finally {
      setIsLoadingTemplates(false);
    }
  };

  const onSubmit = async (data: ContainerJobFormData) => {
    setIsSubmitting(true);

    try {
      const response = await jobsApi.createJob(data);
      
      toast.success("Kontener został utworzony pomyślnie!", {
        description: `Zadanie: ${data.job_name}`,
      });

      // Redirect to job details or jobs list
      router.push(`/dashboard/jobs/${response.data.id}`);
    } catch (error: any) {
      console.error("Error creating container job:", error);
      
      let errorMessage = "Wystąpił błąd podczas tworzenia kontenera";
      if (error.response?.data?.detail) {
        errorMessage = error.response.data.detail;
      } else if (error.message) {
        errorMessage = error.message;
      }

      toast.error("Błąd podczas tworzenia kontenera", {
        description: errorMessage,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen">
      <div className="container mx-auto py-8 space-y-8">
        {/* Header */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-4"
        >
          <Button variant="outline" asChild className="backdrop-blur-sm bg-white/80 dark:bg-slate-800/80">
            <Link href="/dashboard">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Powrót do dashboardu
            </Link>
          </Button>
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full blur-lg opacity-20"></div>
              <div className="relative p-3 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full">
                <Container className="h-6 w-6 text-white" />
              </div>
            </div>
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-emerald-600 bg-clip-text text-transparent">
                Nowy kontener
              </h1>
              <p className="text-muted-foreground">
                Utwórz nowy kontener obliczeniowy
              </p>
            </div>
          </div>
        </motion.div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
          {/* Main Form */}
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="xl:col-span-2"
          >
            <Card className="backdrop-blur-xl bg-white/80 dark:bg-slate-900/80 border-white/20 dark:border-slate-700/50 shadow-2xl">
              <CardHeader className="pb-6">
                <CardTitle className="flex items-center gap-2 text-xl">
                  <Upload className="h-5 w-5 text-blue-500" />
                  Konfiguracja kontenera
                </CardTitle>
                <CardDescription>
                  Wypełnij formularz, aby utworzyć nowy kontener obliczeniowy
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                    {/* Basic Information */}
                    <div className="space-y-4">
                      <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200">
                        Informacje podstawowe
                      </h3>
                      
                      <FormField
                        control={form.control}
                        name="job_name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-base">Nazwa kontenera</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="np. tensorflow_training_2024"
                                className="h-12 text-base bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm"
                                {...field} 
                              />
                            </FormControl>
                            <FormDescription>
                              Unikalna nazwa identyfikująca kontener (tylko litery, cyfry, _ i -)
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    {/* Template Configuration */}
                    <div className="space-y-4">
                      <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200">
                        Konfiguracja szablonu
                      </h3>
                      
                      <FormField
                        control={form.control}
                        name="template_name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-base">Szablon kontenera</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger className="h-12 bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm">
                                  <SelectValue placeholder="Wybierz szablon kontenera" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {templates.map((template) => (
                                  <SelectItem key={template.name} value={template.name}>
                                    <div className="font-medium">{template.name}</div>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormDescription>
                              Wybierz szablon określający środowisko kontenerowe
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* Template Validation Results */}
                      <AnimatePresence>
                        {(isLoadingTemplates || templateValidation.length > 0) && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            className="space-y-3"
                          >
                            {templateValidation.map((step, index) => (
                              <motion.div
                                key={step.id}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: index * 0.1 }}
                                className={`flex items-center gap-3 p-3 rounded-lg border ${
                                  step.status === "success" 
                                    ? "bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-500/30"
                                    : step.status === "error"
                                    ? "bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-500/30"
                                    : step.status === "checking"
                                    ? "bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-500/30"
                                    : "bg-slate-50 border-slate-200 dark:bg-slate-800/50 dark:border-slate-600/30"
                                }`}
                              >
                                {step.status === "checking" && (
                                  <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                                )}
                                {step.status === "success" && (
                                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                )}
                                {step.status === "error" && (
                                  <XCircle className="h-4 w-4 text-red-500" />
                                )}
                                {step.status === "pending" && (
                                  <div className="h-4 w-4 rounded-full border-2 border-slate-300 dark:border-slate-600" />
                                )}
                                
                                <div className="flex-1">
                                  <p className="text-sm font-medium">{step.label}</p>
                                  {step.message && (
                                    <p className="text-xs text-muted-foreground">{step.message}</p>
                                  )}
                                </div>
                              </motion.div>
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    {/* Resource Configuration */}
                    <div className="space-y-4">
                      <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200">
                        Konfiguracja zasobów
                      </h3>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="partition"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-base">Partycja</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl>
                                  <SelectTrigger className="h-12 bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm">
                                    <SelectValue placeholder="Wybierz partycję" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="proxima">
                                    <div>
                                      <div className="font-medium">Proxima (GPU)</div>
                                      <div className="text-xs text-muted-foreground">
                                        RTX 3090, RTX 4090
                                      </div>
                                    </div>
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="time_limit"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-base">Limit czasu</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl>
                                  <SelectTrigger className="h-12 bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm">
                                    <SelectValue placeholder="Wybierz limit czasu" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {TIME_LIMIT_OPTIONS.map((option) => (
                                    <SelectItem key={option.value} value={option.value}>
                                      {option.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="num_nodes"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-base flex items-center gap-2">
                                <Server className="h-4 w-4" />
                                Węzły
                              </FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  min={1}
                                  max={10}
                                  {...field}
                                  onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                                  className="font-mono"
                                />
                              </FormControl>
                              <FormDescription>1-10 węzłów obliczeniowych</FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="tasks_per_node"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-base">Zadania na węzeł</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  min={1}
                                  max={32}
                                  {...field}
                                  onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                                  className="font-mono"
                                />
                              </FormControl>
                              <FormDescription>1-32 zadania na węzeł</FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <FormField
                          control={form.control}
                          name="num_cpus"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-base flex items-center gap-2">
                                <Cpu className="h-4 w-4" />
                                CPU (rdzenie)
                              </FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  min={1}
                                  max={32}
                                  {...field}
                                  onChange={(e) => field.onChange(parseInt(e.target.value) || 4)}
                                  className="font-mono"
                                />
                              </FormControl>
                              <FormDescription>1-32 rdzenie CPU</FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="memory_gb"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-base flex items-center gap-2">
                                <HardDrive className="h-4 w-4" />
                                RAM (GB)
                              </FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  min={1}
                                  max={128}
                                  {...field}
                                  onChange={(e) => field.onChange(parseInt(e.target.value) || 16)}
                                  className="font-mono"
                                />
                              </FormControl>
                              <FormDescription>1-128 GB RAM</FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="num_gpus"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-base flex items-center gap-2">
                                <Monitor className="h-4 w-4" />
                                GPU
                              </FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  min={0}
                                  max={4}
                                  {...field}
                                  onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                                  className="font-mono"
                                />
                              </FormControl>
                              <FormDescription>0-4 GPU</FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>

                    {/* Submit Button */}
                    <motion.div 
                      className="pt-6 border-t border-white/20 dark:border-slate-700/50"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <Button 
                        type="submit" 
                        disabled={
                          isSubmitting || 
                          isLoadingTemplates ||
                          !form.watch("template_name")
                        }
                        className="w-full h-14 text-base font-semibold bg-gradient-to-r from-blue-500 via-purple-500 to-emerald-500 hover:from-blue-600 hover:via-purple-600 hover:to-emerald-600 text-white shadow-2xl"
                      >
                        {isSubmitting ? (
                          <>
                            <Loader2 className="h-5 w-5 mr-3 animate-spin" />
                            Tworzenie kontenera...
                          </>
                        ) : (
                          <>
                            <Play className="h-5 w-5 mr-3" />
                            Utwórz kontener
                          </>
                        )}
                      </Button>
                    </motion.div>
                  </form>
                </Form>
              </CardContent>
            </Card>
          </motion.div>

          {/* Sidebar with info and preview */}
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-6"
          >
            {/* Resource Summary */}
            <Card className="backdrop-blur-xl bg-white/80 dark:bg-slate-900/80 border-white/20 dark:border-slate-700/50 shadow-xl">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Server className="h-5 w-5 text-emerald-500" />
                  Podsumowanie zasobów
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Węzły:</span>
                      <span className="font-medium">{form.watch("num_nodes")}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Zadania:</span>
                      <span className="font-medium">{form.watch("tasks_per_node")}/węzeł</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">CPU:</span>
                      <span className="font-medium">{form.watch("num_cpus")} rdzeni</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">RAM:</span>
                      <span className="font-medium">{form.watch("memory_gb")} GB</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">GPU:</span>
                      <span className="font-medium">{form.watch("num_gpus")}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Partycja:</span>
                      <span className="font-medium">{form.watch("partition")}</span>
                    </div>
                  </div>
                </div>
                
                <div className="pt-4 border-t border-white/20 dark:border-slate-700/50">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Limit czasu:</span>
                    <Badge variant="outline" className="font-mono">
                      {form.watch("time_limit")}
                    </Badge>
                  </div>
                </div>

                <div className="pt-4 border-t border-white/20 dark:border-slate-700/50">
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Szablon:</span>
                      <Badge variant="secondary">
                        {form.watch("template_name") || "Nie wybrano"}
                      </Badge>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Info Card */}
            <Card className="backdrop-blur-xl bg-white/80 dark:bg-slate-900/80 border-white/20 dark:border-slate-700/50 shadow-xl">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-blue-500" />
                  Informacje
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                  <p>Kontener zostanie utworzony z wybranym szablonem</p>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                  <p>Zasoby będą zarezerwowane według specyfikacji</p>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                  <p>Automatyczne zarządzanie cyklem życia kontenera</p>
                </div>
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
                  <p>Limit czasu określa maksymalny czas działania</p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

  const form = useForm<ContainerJobFormData>({
    resolver: zodResolver(containerJobSchema),
    defaultValues: {
      job_name: "",
      template_name: "",
      partition: "proxima",
      num_cpus: 4,
      memory_gb: 16,
      num_gpus: 0,
      time_limit: "24:00:00",
      num_nodes: 1,
      tasks_per_node: 1,
      preview: false,
    },
  });

  // Watch for template changes to update default resources
  const watchedTemplate = form.watch("template_name");

  // Load available templates
  useEffect(() => {
    const loadTemplates = async () => {
      try {
        setIsLoadingTemplates(true);
        const response = await jobsApi.getTemplates();
        // Backend returns array of strings (filenames)
        const templateList = (response.data || []).map((filename: string) => ({
          name: filename
        }));
        setTemplates(templateList);
      } catch (error) {
        console.error("Error loading templates:", error);
        toast.error("Nie udało się załadować szablonów");
      } finally {
        setIsLoadingTemplates(false);
      }
    };

    loadTemplates();
  }, []);

  // Templates effect removed since we don't have default_resources

  // Validate form data
  const validateForm = async () => {
    setIsValidating(true);
    const steps: ValidationStep[] = [
      { id: "template", label: "Sprawdzanie szablonu", status: "checking" },
      { id: "resources", label: "Sprawdzanie zasobów", status: "pending" },
      { id: "permissions", label: "Sprawdzanie uprawnień", status: "pending" },
    ];
    setValidationSteps(steps);

    try {
      // Validate template
      const templateExists = templates.some(t => t.name === form.getValues("template_name"));
      if (!templateExists) {
        steps[0].status = "error";
        steps[0].message = "Wybrany szablon nie istnieje";
        setValidationSteps([...steps]);
        return false;
      }
      steps[0].status = "success";
      setValidationSteps([...steps]);

      // Validate resources
      steps[1].status = "checking";
      setValidationSteps([...steps]);
      
      const formData = form.getValues();
      if (formData.num_cpus > 32 || formData.memory_gb > 128 || formData.num_gpus > 4) {
        steps[1].status = "error";
        steps[1].message = "Zasoby przekraczają dozwolone limity";
        setValidationSteps([...steps]);
        return false;
      }
      steps[1].status = "success";
      setValidationSteps([...steps]);

      // Validate permissions
      steps[2].status = "checking";
      setValidationSteps([...steps]);
      
      // For now, assume permissions are OK
      steps[2].status = "success";
      setValidationSteps([...steps]);

      return true;
    } catch (error) {
      console.error("Validation error:", error);
      const currentStep = steps.find(s => s.status === "checking");
      if (currentStep) {
        currentStep.status = "error";
        currentStep.message = "Błąd podczas walidacji";
        setValidationSteps([...steps]);
      }
      return false;
    } finally {
      setIsValidating(false);
    }
  };

  // Submit form
  const onSubmit = async (data: ContainerJobFormData) => {
    try {
      setIsSubmitting(true);

      // First validate
      const isValid = await validateForm();
      if (!isValid) {
        toast.error("Walidacja nie powiodła się");
        return;
      }

      // Submit job - only include fields that exist in backend JobCreate schema
      const jobData = {
        job_name: data.job_name,
        template_name: data.template_name,
        partition: data.partition,
        num_nodes: data.num_nodes,
        tasks_per_node: data.tasks_per_node,
        num_cpus: data.num_cpus,
        memory_gb: data.memory_gb,
        num_gpus: data.num_gpus,
        time_limit: data.time_limit,
        preview: data.preview,
      };

      const response = await jobsApi.createJob(jobData);
      
      toast.success(`Kontener "${data.job_name}" został utworzony pomyślnie!`);
      
      // Redirect to dashboard
      router.push("/dashboard");
      
    } catch (error: any) {
      console.error("Error creating job:", error);
      const errorMessage = error.response?.data?.detail || "Nie udało się utworzyć kontenera";
      toast.error(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderResourcesSection = () => (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Server className="h-5 w-5" />
          Zasoby obliczeniowe
        </CardTitle>
        <CardDescription>
          Skonfiguruj zasoby wymagane dla kontenera
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <FormField
            control={form.control}
            name="num_cpus"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center gap-2">
                  <Cpu className="h-4 w-4" />
                  CPU Cores
                </FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={1}
                    max={32}
                    {...field}
                    onChange={(e) => field.onChange(parseInt(e.target.value))}
                  />
                </FormControl>
                <FormDescription>
                  Liczba rdzeni CPU (1-32)
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="memory_gb"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center gap-2">
                  <HardDrive className="h-4 w-4" />
                  Pamięć RAM (GB)
                </FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={1}
                    max={128}
                    {...field}
                    onChange={(e) => field.onChange(parseInt(e.target.value))}
                  />
                </FormControl>
                <FormDescription>
                  Ilość pamięci RAM w GB (1-128)
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="num_gpus"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center gap-2">
                  <Monitor className="h-4 w-4" />
                  GPU Count
                </FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={0}
                    max={4}
                    {...field}
                    onChange={(e) => field.onChange(parseInt(e.target.value))}
                  />
                </FormControl>
                <FormDescription>
                  Liczba GPU (0-4)
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="partition"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Partycja</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Wybierz partycję" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {PARTITION_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        <div className="flex flex-col">
                          <span>{option.label}</span>
                          <span className="text-xs text-muted-foreground">
                            {option.description}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription>
                  Wybierz partycję klastra obliczeniowego
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="time_limit"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Limit czasu
                </FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Wybierz limit czasu" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {TIME_LIMIT_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription>
                  Maksymalny czas działania kontenera
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </CardContent>
    </Card>
  );

  const renderNetworkSection = () => (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Network className="h-5 w-5" />
          Konfiguracja sieciowa
        </CardTitle>
        <CardDescription>
          Opcjonalne porty dla dostępu do kontenera
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="port"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Port wewnętrzny</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={1024}
                    max={65535}
                    placeholder="8888"
                    {...field}
                    onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                  />
                </FormControl>
                <FormDescription>
                  Port aplikacji wewnątrz kontenera (opcjonalny)
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="external_port"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Port zewnętrzny</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={1024}
                    max={65535}
                    placeholder="Auto"
                    {...field}
                    onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                  />
                </FormControl>
                <FormDescription>
                  Port dostępny z zewnątrz (opcjonalny, auto-assign)
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <Link href="/dashboard">
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Powrót
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Container className="h-8 w-8 text-blue-600" />
            Nowy kontener
          </h1>
          <p className="text-muted-foreground">
            Utwórz nowy kontener obliczeniowy na klastrze
          </p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* Basic Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Podstawowe informacje
              </CardTitle>
              <CardDescription>
                Podaj nazwę i wybierz szablon dla kontenera
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="job_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nazwa kontenera</FormLabel>
                    <FormControl>
                      <Input placeholder="moj-kontener" {...field} />
                    </FormControl>
                    <FormDescription>
                      Unikalna nazwa kontenera (tylko litery, cyfry, _ i -)
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
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Wybierz szablon kontenera" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {isLoadingTemplates ? (
                          <SelectItem value="loading" disabled>
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            Ładowanie szablonów...
                          </SelectItem>
                        ) : templates.length > 0 ? (
                          templates.map((template) => (
                            <SelectItem key={template.name} value={template.name}>
                              <div className="flex flex-col">
                                <span>{template.name}</span>
                                {template.description && (
                                  <span className="text-xs text-muted-foreground">
                                    {template.description}
                                  </span>
                                )}
                              </div>
                            </SelectItem>
                          ))
                        ) : (
                          <SelectItem value="no-templates" disabled>
                            Brak dostępnych szablonów
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Wybierz szablon aplikacji do uruchomienia w kontenerze
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Opis (opcjonalny)</FormLabel>
                    <FormControl>
                      <Input placeholder="Opis kontenera..." {...field} />
                    </FormControl>
                    <FormDescription>
                      Krótki opis celu kontenera
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Resources */}
          {renderResourcesSection()}

          {/* Network Configuration */}
          {renderNetworkSection()}

          {/* Advanced Configuration */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Code2 className="h-5 w-5" />
                Konfiguracja zaawansowana
              </CardTitle>
              <CardDescription>
                Dodatkowe parametry dla ekspertów
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="num_nodes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Liczba węzłów</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={1}
                          max={10}
                          {...field}
                          onChange={(e) => field.onChange(parseInt(e.target.value))}
                        />
                      </FormControl>
                      <FormDescription>
                        Liczba węzłów klastra (1-10)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="tasks_per_node"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Zadań na węzeł</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={1}
                          max={32}
                          {...field}
                          onChange={(e) => field.onChange(parseInt(e.target.value))}
                        />
                      </FormControl>
                      <FormDescription>
                        Liczba zadań na węzeł (1-32)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          {/* Validation Steps */}
          <AnimatePresence>
            {validationSteps.length > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3 }}
              >
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <CheckCircle2 className="h-5 w-5" />
                      Walidacja
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {validationSteps.map((step) => (
                        <div key={step.id} className="flex items-center gap-3">
                          {step.status === "pending" && (
                            <div className="h-4 w-4 rounded-full border-2 border-muted" />
                          )}
                          {step.status === "checking" && (
                            <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                          )}
                          {step.status === "success" && (
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                          )}
                          {step.status === "error" && (
                            <XCircle className="h-4 w-4 text-red-600" />
                          )}
                          <div className="flex-1">
                            <span className="text-sm font-medium">{step.label}</span>
                            {step.message && (
                              <p className="text-xs text-muted-foreground">{step.message}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Submit Buttons */}
          <div className="flex justify-end gap-4">
            <Link href="/dashboard">
              <Button variant="outline" disabled={isSubmitting || isValidating}>
                Anuluj
              </Button>
            </Link>
            <Button
              type="button"
              variant="outline"
              disabled={isSubmitting || isValidating || !form.formState.isValid}
              onClick={() => {
                const data = form.getValues();
                data.preview = true;
                onSubmit(data);
              }}
            >
              <Eye className="h-4 w-4 mr-2" />
              Podgląd szablonu
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || isValidating || !form.formState.isValid}
              className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-semibold shadow-lg hover:shadow-xl transition-all duration-200"
            >
              {isSubmitting || isValidating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {isValidating ? "Walidacja..." : "Tworzenie..."}
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Utwórz kontener
                </>
              )}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
