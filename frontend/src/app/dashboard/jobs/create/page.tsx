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
  Package,
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
  num_nodes: z.number().default(1),
  tasks_per_node: z.number().default(1),
  num_cpus: z.number().min(4).max(48).default(4),
  memory_gb: z.number().min(8).max(512).default(16),
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

const CPU_OPTIONS = [
  { value: 4, label: "4 rdzenie" },
  { value: 8, label: "8 rdzeni" },
  { value: 12, label: "12 rdzeni" },
  { value: 16, label: "16 rdzeni" },
  { value: 20, label: "20 rdzeni" },
  { value: 24, label: "24 rdzenie" },
  { value: 28, label: "28 rdzeni" },
  { value: 32, label: "32 rdzenie" },
  { value: 36, label: "36 rdzeni" },
  { value: 40, label: "40 rdzeni" },
  { value: 44, label: "44 rdzenie" },
  { value: 48, label: "48 rdzeni" },
];

const MEMORY_OPTIONS = [
  { value: 8, label: "8 GB" },
  { value: 16, label: "16 GB" },
  { value: 32, label: "32 GB" },
  { value: 64, label: "64 GB" },
  { value: 128, label: "128 GB" },
  { value: 256, label: "256 GB" },
  { value: 512, label: "512 GB" },
];

const GPU_OPTIONS = [
  { value: 0, label: "0 GPU" },
  { value: 1, label: "1 GPU" },
  { value: 2, label: "2 GPU" },
  { value: 3, label: "3 GPU" },
  { value: 4, label: "4 GPU" },
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
          message: `Dostępne szablony: ${templateData.map((t: Template) => t.name).join(", ")}`
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

      // Redirect to main dashboard
      router.push("/dashboard");
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
      <div className="container mx-auto px-4 py-6 max-w-7xl">
        {/* Header */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex items-center justify-between mb-6">
            <Button 
              variant="ghost" 
              asChild 
              className="text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-white/60 dark:hover:bg-slate-800/60"
            >
              <Link href="/dashboard">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Powrót do dashboardu
              </Link>
            </Button>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-2xl blur-xl opacity-25"></div>
              <div className="relative p-4 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-2xl shadow-lg">
                <Container className="h-7 w-7 text-white" />
              </div>
            </div>
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-300 bg-clip-text text-transparent mb-2">
                Konfiguracja kontenera
              </h1>
              <p className="text-slate-600 dark:text-slate-400 text-lg">
                Wypełnij formularz, aby utworzyć nowy kontener obliczeniowy
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
            <Card className="border-0 shadow-2xl bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl overflow-hidden">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-purple-500/5 to-emerald-500/5"></div>
                <CardHeader className="relative pb-8 border-b border-slate-200/60 dark:border-slate-700/60">
                  <div className="flex items-center gap-4">
                    <div className="relative">
                      <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl blur-lg opacity-20"></div>
                      <div className="relative p-3 bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl shadow-lg">
                        <Upload className="h-6 w-6 text-white" />
                      </div>
                    </div>
                    <div>
                      <CardTitle className="text-2xl font-bold bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-300 bg-clip-text text-transparent">
                        Konfiguracja kontenera
                      </CardTitle>
                      <CardDescription className="text-base text-slate-600 dark:text-slate-400 mt-1">
                        Wypełnij formularz, aby utworzyć nowy kontener obliczeniowy
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="relative pt-8">
                  <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                      {/* Basic Information */}
                      <div className="space-y-6 p-6 bg-gradient-to-br from-slate-50/80 to-blue-50/40 dark:from-slate-800/40 dark:to-slate-700/20 rounded-2xl border border-slate-200/50 dark:border-slate-700/30">
                        <div className="flex items-center gap-3 mb-4">
                          <div className="p-2 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-lg shadow-sm">
                            <FileText className="h-4 w-4 text-white" />
                          </div>
                          <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                            Informacje podstawowe
                          </h3>
                        </div>
                        
                        <FormField
                          control={form.control}
                          name="job_name"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-base font-medium text-slate-700 dark:text-slate-300">Nazwa kontenera</FormLabel>
                              <FormControl>
                                <Input 
                                  placeholder="np. tensorflow_training_2024"
                                  className="h-12 text-base bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm border-slate-200 dark:border-slate-600 focus:border-blue-500 dark:focus:border-blue-400 transition-colors"
                                  {...field} 
                                />
                              </FormControl>
                              <FormDescription className="text-slate-600 dark:text-slate-400">
                                Unikalna nazwa identyfikująca kontener (tylko litery, cyfry, _ i -)
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      
                      {/* Template Configuration */}
                      <div className="space-y-6 p-6 bg-gradient-to-br from-purple-50/80 to-pink-50/40 dark:from-purple-900/20 dark:to-pink-900/10 rounded-2xl border border-purple-200/50 dark:border-purple-700/30">
                        <div className="flex items-center gap-3 mb-4">
                          <div className="p-2 bg-gradient-to-r from-purple-500 to-pink-600 rounded-lg shadow-sm">
                            <Package className="h-4 w-4 text-white" />
                          </div>
                          <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                            Konfiguracja szablonu
                          </h3>
                        </div>
                        
                        <FormField
                          control={form.control}
                          name="template_name"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-base font-medium text-slate-700 dark:text-slate-300">Szablon kontenera</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl>
                                  <SelectTrigger className="h-12 bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm border-slate-200 dark:border-slate-600 focus:border-purple-500 dark:focus:border-purple-400 transition-colors">
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
                              <FormDescription className="text-slate-600 dark:text-slate-400">
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

                      {/* Resource Configuration - Enhanced */}
                      <div className="space-y-8 p-8 bg-gradient-to-br from-slate-50/80 via-white/50 to-blue-50/30 dark:from-slate-800/60 dark:via-slate-800/40 dark:to-slate-900/20 rounded-3xl border border-slate-200/60 dark:border-slate-700/40 shadow-lg backdrop-blur-sm">
                        <div className="flex items-center gap-4 mb-6">
                          <div className="relative">
                            <div className="absolute inset-0 bg-gradient-to-r from-emerald-500 to-teal-600 rounded-xl blur-md opacity-30"></div>
                            <div className="relative p-3 bg-gradient-to-r from-emerald-500 to-teal-600 rounded-xl shadow-lg">
                              <Cpu className="h-6 w-6 text-white" />
                            </div>
                          </div>
                          <div>
                            <h3 className="text-2xl font-bold bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-300 bg-clip-text text-transparent">
                              Konfiguracja zasobów
                            </h3>
                            <p className="text-slate-600 dark:text-slate-400 mt-1">
                              Określ wymagania sprzętowe dla kontenera
                            </p>
                          </div>
                        </div>

                        {/* Partition and Time Limit */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                          <FormField
                            control={form.control}
                            name="partition"
                            render={({ field }) => (
                              <FormItem className="space-y-3">
                                <FormLabel className="text-lg font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-3">
                                  <div className="p-2 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-lg shadow-sm">
                                    <Server className="h-4 w-4 text-white" />
                                  </div>
                                  Partycja
                                </FormLabel>
                                <Select onValueChange={field.onChange} value={field.value}>
                                  <FormControl>
                                    <SelectTrigger className="h-14 text-base bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm border-2 border-slate-200 dark:border-slate-600 focus:border-blue-500 dark:focus:border-blue-400 transition-all duration-200 rounded-xl shadow-sm hover:shadow-md">
                                      <SelectValue placeholder="Wybierz partycję obliczeniową" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent className="rounded-xl border-2 shadow-xl">
                                    <SelectItem value="proxima" className="py-4 px-4 focus:bg-blue-50 dark:focus:bg-slate-700">
                                      <div className="flex items-center gap-3">
                                        <div className="p-2 bg-gradient-to-r from-green-500 to-emerald-600 rounded-lg">
                                          <Monitor className="h-4 w-4 text-white" />
                                        </div>
                                        <div>
                                          <div className="font-semibold text-slate-900 dark:text-slate-100">Proxima (GPU)</div>
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
                              <FormItem className="space-y-3">
                                <FormLabel className="text-lg font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-3">
                                  <div className="p-2 bg-gradient-to-r from-amber-500 to-orange-600 rounded-lg shadow-sm">
                                    <Clock className="h-4 w-4 text-white" />
                                  </div>
                                  Limit czasu
                                </FormLabel>
                                <Select onValueChange={field.onChange} value={field.value}>
                                  <FormControl>
                                    <SelectTrigger className="h-14 text-base bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm border-2 border-slate-200 dark:border-slate-600 focus:border-amber-500 dark:focus:border-amber-400 transition-all duration-200 rounded-xl shadow-sm hover:shadow-md">
                                      <SelectValue placeholder="Wybierz maksymalny czas działania" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent className="rounded-xl border-2 shadow-xl">
                                    {TIME_LIMIT_OPTIONS.map((option) => (
                                      <SelectItem key={option.value} value={option.value} className="py-3 px-4 focus:bg-amber-50 dark:focus:bg-slate-700">
                                        <div className="flex items-center gap-2">
                                          <Clock className="h-4 w-4 text-amber-600" />
                                          <span className="font-medium">{option.label}</span>
                                        </div>
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>

                        {/* Hardware Resources */}
                        <div className="space-y-6">
                          <div className="border-t border-slate-200/60 dark:border-slate-700/60 pt-6">
                            <h4 className="text-lg font-semibold text-slate-800 dark:text-slate-200 mb-6 flex items-center gap-2">
                              <div className="p-1.5 bg-gradient-to-r from-purple-500 to-pink-600 rounded-lg">
                                <HardDrive className="h-4 w-4 text-white" />
                              </div>
                              Zasoby sprzętowe
                            </h4>
                          </div>
                          
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                            <FormField
                              control={form.control}
                              name="num_cpus"
                              render={({ field }) => (
                                <FormItem className="space-y-4">
                                  <FormLabel className="text-base font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                                    <div className="p-1.5 bg-gradient-to-r from-blue-500 to-cyan-600 rounded-lg">
                                      <Cpu className="h-4 w-4 text-white" />
                                    </div>
                                    CPU (rdzenie)
                                  </FormLabel>
                                  <Select onValueChange={(value) => field.onChange(parseInt(value))} value={field.value.toString()}>
                                    <FormControl>
                                      <SelectTrigger className="h-12 text-base bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm border-2 border-slate-200 dark:border-slate-600 focus:border-blue-500 dark:focus:border-blue-400 transition-all duration-200 rounded-xl shadow-sm hover:shadow-md">
                                        <SelectValue placeholder="Wybierz CPU" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent className="rounded-xl border-2 shadow-xl">
                                      {CPU_OPTIONS.map((option) => (
                                        <SelectItem key={option.value} value={option.value.toString()} className="py-3 px-4 focus:bg-blue-50 dark:focus:bg-slate-700">
                                          <div className="flex items-center gap-2">
                                            <Cpu className="h-4 w-4 text-blue-600" />
                                            <span className="font-medium">{option.label}</span>
                                          </div>
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <FormDescription className="text-sm text-slate-600 dark:text-slate-400 flex items-center gap-2">
                                    <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                                    4-48 rdzeni procesora
                                  </FormDescription>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={form.control}
                              name="memory_gb"
                              render={({ field }) => (
                                <FormItem className="space-y-4">
                                  <FormLabel className="text-base font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                                    <div className="p-1.5 bg-gradient-to-r from-green-500 to-emerald-600 rounded-lg">
                                      <HardDrive className="h-4 w-4 text-white" />
                                    </div>
                                    RAM (GB)
                                  </FormLabel>
                                  <Select onValueChange={(value) => field.onChange(parseInt(value))} value={field.value.toString()}>
                                    <FormControl>
                                      <SelectTrigger className="h-12 text-base bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm border-2 border-slate-200 dark:border-slate-600 focus:border-green-500 dark:focus:border-green-400 transition-all duration-200 rounded-xl shadow-sm hover:shadow-md">
                                        <SelectValue placeholder="Wybierz RAM" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent className="rounded-xl border-2 shadow-xl">
                                      {MEMORY_OPTIONS.map((option) => (
                                        <SelectItem key={option.value} value={option.value.toString()} className="py-3 px-4 focus:bg-green-50 dark:focus:bg-slate-700">
                                          <div className="flex items-center gap-2">
                                            <HardDrive className="h-4 w-4 text-green-600" />
                                            <span className="font-medium">{option.label}</span>
                                          </div>
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <FormDescription className="text-sm text-slate-600 dark:text-slate-400 flex items-center gap-2">
                                    <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                                    8-512 GB pamięci RAM
                                  </FormDescription>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={form.control}
                              name="num_gpus"
                              render={({ field }) => (
                                <FormItem className="space-y-4">
                                  <FormLabel className="text-base font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                                    <div className="p-1.5 bg-gradient-to-r from-purple-500 to-violet-600 rounded-lg">
                                      <Monitor className="h-4 w-4 text-white" />
                                    </div>
                                    GPU
                                  </FormLabel>
                                  <Select onValueChange={(value) => field.onChange(parseInt(value))} value={field.value.toString()}>
                                    <FormControl>
                                      <SelectTrigger className="h-12 text-base bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm border-2 border-slate-200 dark:border-slate-600 focus:border-purple-500 dark:focus:border-purple-400 transition-all duration-200 rounded-xl shadow-sm hover:shadow-md">
                                        <SelectValue placeholder="Wybierz GPU" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent className="rounded-xl border-2 shadow-xl">
                                      {GPU_OPTIONS.map((option) => (
                                        <SelectItem key={option.value} value={option.value.toString()} className="py-3 px-4 focus:bg-purple-50 dark:focus:bg-slate-700">
                                          <div className="flex items-center gap-2">
                                            <Monitor className="h-4 w-4 text-purple-600" />
                                            <span className="font-medium">{option.label}</span>
                                          </div>
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <FormDescription className="text-sm text-slate-600 dark:text-slate-400 flex items-center gap-2">
                                    <span className="w-2 h-2 bg-purple-500 rounded-full"></span>
                                    0-4 karty graficzne
                                  </FormDescription>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Submit Button */}
                      <motion.div 
                        className="pt-8 border-t border-slate-200/60 dark:border-slate-700/60"
                        whileHover={{ scale: 1.01 }}
                        whileTap={{ scale: 0.99 }}
                      >
                        <Button 
                          type="submit" 
                          disabled={
                            isSubmitting || 
                            isLoadingTemplates ||
                            !form.watch("template_name")
                          }
                          className="w-full h-14 text-base font-semibold bg-gradient-to-r from-blue-600 via-purple-600 to-emerald-600 hover:from-blue-700 hover:via-purple-700 hover:to-emerald-700 text-white shadow-xl hover:shadow-2xl transition-all duration-300 disabled:opacity-50 rounded-xl"
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
              </div>
            </Card>
          </motion.div>

          {/* Sidebar with info and preview */}
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="space-y-6"
          >
            {/* Resource Summary - Enhanced */}
            <Card className="border-0 shadow-xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl overflow-hidden">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-purple-500/5 to-emerald-500/5"></div>
                <CardHeader className="relative border-b border-slate-200/60 dark:border-slate-700/60 pb-6">
                  <div className="flex items-center gap-4">
                    <div className="relative">
                      <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl blur-md opacity-30"></div>
                      <div className="relative p-3 bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl shadow-lg">
                        <Server className="h-5 w-5 text-white" />
                      </div>
                    </div>
                    <div>
                      <CardTitle className="text-xl font-bold bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-300 bg-clip-text text-transparent">
                        Podsumowanie konfiguracji
                      </CardTitle>
                      <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                        Przegląd wybranych parametrów
                      </p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="relative pt-6 space-y-4">
                  <div className="space-y-3">
                    {/* Partition Info */}
                    <div className="p-4 bg-gradient-to-r from-blue-50/80 to-indigo-50/80 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-xl border border-blue-200/40 dark:border-blue-700/40 shadow-sm">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-lg shadow-sm">
                            <Server className="h-4 w-4 text-white" />
                          </div>
                          <span className="font-semibold text-slate-800 dark:text-slate-200">Partycja</span>
                        </div>
                        <Badge variant="secondary" className="bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-200 px-3 py-1 text-sm font-medium">
                          {form.watch("partition") === "proxima" ? "Proxima (GPU)" : form.watch("partition")}
                        </Badge>
                      </div>
                      <div className="text-xs text-slate-600 dark:text-slate-400 ml-11">
                        Nvidia Tesla H100 98 GB RAM • Obliczenia GPU
                      </div>
                    </div>

                    {/* Hardware Resources */}
                    <div className="space-y-3">
                      <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2 mb-2">
                        <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
                        Zasoby sprzętowe
                      </h4>
                      
                      <div className="grid grid-cols-2 gap-3">
                        {/* CPU */}
                        <div className="p-3 bg-gradient-to-r from-emerald-50/80 to-green-50/80 dark:from-emerald-900/20 dark:to-green-900/20 rounded-xl border border-emerald-200/40 dark:border-emerald-700/40">
                          <div className="flex items-center gap-2 mb-2">
                            <div className="p-1 bg-emerald-500 rounded-md">
                              <Cpu className="h-3 w-3 text-white" />
                            </div>
                            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">CPU</span>
                          </div>
                          <div className="text-lg font-bold text-emerald-700 dark:text-emerald-400">
                            {form.watch("num_cpus")}
                          </div>
                          <div className="text-xs text-slate-600 dark:text-slate-400">
                            {form.watch("num_cpus") === 1 ? 'rdzeń' : form.watch("num_cpus") < 5 ? 'rdzenie' : 'rdzeni'}
                          </div>
                        </div>

                        {/* RAM */}
                        <div className="p-3 bg-gradient-to-r from-blue-50/80 to-cyan-50/80 dark:from-blue-900/20 dark:to-cyan-900/20 rounded-xl border border-blue-200/40 dark:border-blue-700/40">
                          <div className="flex items-center gap-2 mb-2">
                            <div className="p-1 bg-blue-500 rounded-md">
                              <HardDrive className="h-3 w-3 text-white" />
                            </div>
                            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">RAM</span>
                          </div>
                          <div className="text-lg font-bold text-blue-700 dark:text-blue-400">
                            {form.watch("memory_gb")}
                          </div>
                          <div className="text-xs text-slate-600 dark:text-slate-400">
                            GB pamięci
                          </div>
                        </div>

                        {/* GPU */}
                        <div className="p-3 bg-gradient-to-r from-purple-50/80 to-violet-50/80 dark:from-purple-900/20 dark:to-violet-900/20 rounded-xl border border-purple-200/40 dark:border-purple-700/40">
                          <div className="flex items-center gap-2 mb-2">
                            <div className="p-1 bg-purple-500 rounded-md">
                              <Monitor className="h-3 w-3 text-white" />
                            </div>
                            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">GPU</span>
                          </div>
                          <div className="text-lg font-bold text-purple-700 dark:text-purple-400">
                            {form.watch("num_gpus")}
                          </div>
                          <div className="text-xs text-slate-600 dark:text-slate-400">
                            {form.watch("num_gpus") === 0 ? 'brak GPU' : form.watch("num_gpus") === 1 ? 'karta GPU' : 'karty GPU'}
                          </div>
                        </div>

                        {/* Time Limit */}
                        <div className="p-3 bg-gradient-to-r from-amber-50/80 to-orange-50/80 dark:from-amber-900/20 dark:to-orange-900/20 rounded-xl border border-amber-200/40 dark:border-amber-700/40">
                          <div className="flex items-center gap-2 mb-2">
                            <div className="p-1 bg-amber-500 rounded-md">
                              <Clock className="h-3 w-3 text-white" />
                            </div>
                            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Czas</span>
                          </div>
                          <div className="text-sm font-bold text-amber-700 dark:text-amber-400">
                            {TIME_LIMIT_OPTIONS.find(opt => opt.value === form.watch("time_limit"))?.label || 'Nie wybrano'}
                          </div>
                          <div className="text-xs text-slate-600 dark:text-slate-400">
                            maksymalny
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Template Info */}
                    <div className="p-4 bg-gradient-to-r from-slate-50/80 to-gray-50/80 dark:from-slate-800/60 dark:to-gray-800/60 rounded-xl border border-slate-200/40 dark:border-slate-700/40 shadow-sm">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-gradient-to-r from-slate-600 to-gray-700 rounded-lg shadow-sm">
                          <Container className="h-4 w-4 text-white" />
                        </div>
                        <span className="font-semibold text-slate-800 dark:text-slate-200">Szablon kontenera</span>
                      </div>
                      <div className="ml-11">
                        <div className="text-sm font-medium text-slate-700 dark:text-slate-300">
                          {form.watch("template_name") || "Nie wybrano szablonu"}
                        </div>
                        <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                          {form.watch("template_name") ? "Środowisko kontenerowe" : "Wybierz szablon aby kontynuować"}
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </div>
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
