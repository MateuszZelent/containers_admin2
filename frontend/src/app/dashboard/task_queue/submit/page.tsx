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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import {
  Zap,
  FileText,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  Code2,
  Server,
  Cpu,
  HardDrive,
  Clock,
  Eye,
  ArrowLeft,
  Sparkles,
  Upload,
  Play,
  Monitor,
} from "lucide-react";
import { toast } from "sonner";
import { tasksApi } from "@/lib/api-client";
import Link from "next/link";

// Form validation schema
const amumaxTaskSchema = z.object({
  name: z
    .string()
    .min(3, "Nazwa musi mieć co najmniej 3 znaki")
    .max(100, "Nazwa nie może przekraczać 100 znaków")
    .regex(/^[a-zA-Z0-9_-]+$/, "Nazwa może zawierać tylko litery, cyfry, _ i -"),
  mx3_file_path: z
    .string()
    .min(1, "Ścieżka do pliku .mx3 jest wymagana")
    .regex(/\.mx3$/, "Plik musi mieć rozszerzenie .mx3"),
  description: z.string().max(500, "Opis nie może przekraczać 500 znaków").optional(),
  partition: z.string().default("proxima"),
  num_cpus: z.number().min(1).max(32).default(4),
  memory_gb: z.number().min(1).max(128).default(16),
  num_gpus: z.number().min(0).max(4).default(1),
  time_limit: z.string().default("12:00:00"),
  priority: z.number().min(1).max(10).default(5),
});

type AmumaxTaskFormData = z.infer<typeof amumaxTaskSchema>;

interface FileValidation {
  is_valid: boolean;
  file_exists: boolean;
  file_size?: number;
  message: string;
  file_content?: string;
  file_type?: string;
  file_path?: string;
  host_path?: string;
}

interface ValidationStep {
  id: string;
  label: string;
  status: "pending" | "checking" | "success" | "error";
  message?: string;
}

const PARTITION_OPTIONS = [
  { value: "proxima", label: "Proxima (GPU)", description: "RTX 3090, RTX 4090" },
  { value: "orion", label: "Orion (CPU)", description: "Intel Xeon" },
  { value: "gpu", label: "GPU Cluster", description: "A100, V100" },
];

const TIME_LIMIT_OPTIONS = [
  { value: "01:00:00", label: "1 godzina" },
  { value: "06:00:00", label: "6 godzin" },
  { value: "12:00:00", label: "12 godzin" },
  { value: "24:00:00", label: "24 godziny" },
  { value: "72:00:00", label: "3 dni" },
  { value: "168:00:00", label: "7 dni" },
];

export default function SubmitAmumaxTaskPage() {
  const [isValidating, setIsValidating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fileValidation, setFileValidation] = useState<FileValidation | null>(null);
  const [validationSteps, setValidationSteps] = useState<ValidationStep[]>([]);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);

  const form = useForm<AmumaxTaskFormData>({
    resolver: zodResolver(amumaxTaskSchema),
    defaultValues: {
      name: "",
      mx3_file_path: "",
      description: "",
      partition: "proxima",
      num_cpus: 4,
      memory_gb: 16,
      num_gpus: 1,
      time_limit: "12:00:00",
      priority: 5,
    },
  });

  // Watch for file path changes to trigger validation
  const watchedFilePath = form.watch("mx3_file_path");

  // Validate file when path changes
  useEffect(() => {
    if (watchedFilePath && watchedFilePath.trim().length > 0) {
      validateFile(watchedFilePath.trim());
    } else {
      setFileValidation(null);
      setValidationSteps([]);
      setFilePreview(null);
    }
  }, [watchedFilePath]);

  // File validation with detailed steps
  const validateFile = async (filePath: string) => {
    setIsValidating(true);
    setFileValidation(null);
    
    const steps: ValidationStep[] = [
      { id: "exists", label: "Sprawdzanie istnienia pliku", status: "pending" },
      { id: "readable", label: "Sprawdzanie uprawnień", status: "pending" },
      { id: "content", label: "Walidacja zawartości .mx3", status: "pending" },
      { id: "preview", label: "Generowanie podglądu", status: "pending" },
    ];
    
    setValidationSteps([...steps]);

    try {
      // Call the validation endpoint (it checks everything in one call)
      setValidationSteps(prev => prev.map(step => 
        step.id === "exists" ? { ...step, status: "checking" } : step
      ));

      const fileCheckResponse = await tasksApi.validateMx3File(filePath);
      const validation = fileCheckResponse.data;

      // Step 1: Check if file exists
      if (!validation.file_exists) {
        setValidationSteps(prev => prev.map(step => 
          step.id === "exists" 
            ? { ...step, status: "error", message: "Plik nie istnieje" }
            : { ...step, status: "pending" }
        ));
        setFileValidation(validation);
        return;
      }

      setValidationSteps(prev => prev.map(step => 
        step.id === "exists" ? { ...step, status: "success" } : step
      ));

      // Step 2: Check readability (if file exists, it's readable)
      setValidationSteps(prev => prev.map(step => 
        step.id === "readable" ? { ...step, status: "checking" } : step
      ));

      setValidationSteps(prev => prev.map(step => 
        step.id === "readable" ? { ...step, status: "success" } : step
      ));

      // Step 3: Validate MX3 content
      setValidationSteps(prev => prev.map(step => 
        step.id === "content" ? { ...step, status: "checking" } : step
      ));

      if (!validation.is_valid) {
        setValidationSteps(prev => prev.map(step => 
          step.id === "content" 
            ? { ...step, status: "error", message: validation.message || "Nieprawidłowy format .mx3" }
            : step.id === "preview" ? { ...step, status: "pending" } : step
        ));
        setFileValidation(validation);
        return;
      }

      setValidationSteps(prev => prev.map(step => 
        step.id === "content" ? { ...step, status: "success" } : step
      ));

      // Step 4: Set file preview from content
      setValidationSteps(prev => prev.map(step => 
        step.id === "preview" ? { ...step, status: "checking" } : step
      ));

      if (validation.file_content) {
        setFilePreview(validation.file_content);
        setValidationSteps(prev => prev.map(step => 
          step.id === "preview" ? { ...step, status: "success" } : step
        ));
      } else {
        // Try to get full file content
        try {
          const previewResponse = await tasksApi.getFileContent(filePath, { lines: 50 });
          setFilePreview(previewResponse.data.content);
          setValidationSteps(prev => prev.map(step => 
            step.id === "preview" ? { ...step, status: "success" } : step
          ));
        } catch (error) {
          setValidationSteps(prev => prev.map(step => 
            step.id === "preview" 
              ? { ...step, status: "error", message: "Nie udało się pobrać podglądu" }
              : step
          ));
        }
      }

      setFileValidation(validation);

    } catch (error: any) {
      const errorMessage = error.response?.data?.detail || "Błąd podczas walidacji pliku";
      setValidationSteps(prev => prev.map(step => 
        step.status === "checking" 
          ? { ...step, status: "error", message: errorMessage }
          : step
      ));
      setFileValidation({
        is_valid: false,
        file_exists: false,
        message: errorMessage,
      });
    } finally {
      setIsValidating(false);
    }
  };

  // Submit form
  const onSubmit = async (data: AmumaxTaskFormData) => {
    if (!fileValidation?.file_exists || !fileValidation?.is_valid) {
      toast.error("Proszę najpierw poprawić błędy walidacji pliku");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await tasksApi.createAmumaxTask(data);
      toast.success(`Zadanie "${data.name}" zostało utworzone! ID: ${response.data.id}`);
      form.reset();
      setFileValidation(null);
      setValidationSteps([]);
      setFilePreview(null);
    } catch (error: any) {
      const errorMessage = error.response?.data?.detail || "Błąd podczas tworzenia zadania";
      toast.error(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Format file size
  const formatFileSize = (bytes?: number) => {
    if (!bytes) return "";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  // Calculate estimated resources
  const estimatedCost = form.watch("num_cpus") * form.watch("memory_gb") * form.watch("num_gpus");

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-800">
      <div className="container mx-auto py-8 space-y-8">
        {/* Header */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-4"
        >
          <Button variant="outline" asChild className="backdrop-blur-sm bg-white/80 dark:bg-slate-800/80">
            <Link href="/dashboard/task_queue">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Powrót do kolejki
            </Link>
          </Button>
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full blur-lg opacity-20"></div>
              <div className="relative p-3 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full">
                <Zap className="h-6 w-6 text-white" />
              </div>
            </div>
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-600 via-blue-600 to-emerald-600 bg-clip-text text-transparent">
                Nowe zadanie Amumax
              </h1>
              <p className="text-muted-foreground">
                Utwórz zadanie symulacji mikromagnetycznej
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
                  Konfiguracja zadania
                </CardTitle>
                <CardDescription>
                  Wypełnij formularz, aby utworzyć nowe zadanie symulacji Amumax
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
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-base">Nazwa zadania</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="np. magnetization_dynamics_2024"
                                className="h-12 text-base bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm"
                                {...field} 
                              />
                            </FormControl>
                            <FormDescription>
                              Unikalna nazwa identyfikująca zadanie (tylko litery, cyfry, _ i -)
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
                            <FormLabel className="text-base">Opis (opcjonalny)</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="Dodatkowe informacje o symulacji..."
                                className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    {/* File Configuration */}
                    <div className="space-y-4">
                      <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200">
                        Konfiguracja pliku
                      </h3>
                      
                      <FormField
                        control={form.control}
                        name="mx3_file_path"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-base">Ścieżka do pliku .mx3</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="/mnt/local/username/simulation.mx3"
                                className="h-12 text-base font-mono bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm"
                                {...field} 
                              />
                            </FormControl>
                            <FormDescription>
                              Pełna ścieżka do pliku skryptu Amumax (.mx3)
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* File Validation Results */}
                      <AnimatePresence>
                        {(isValidating || validationSteps.length > 0) && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            className="space-y-3"
                          >
                            {validationSteps.map((step, index) => (
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
                            
                            {fileValidation && fileValidation.file_exists && fileValidation.is_valid && (
                              <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm rounded-lg border border-white/30 dark:border-slate-600/30 p-4">
                                <div className="flex items-center justify-between mb-3">
                                  <h4 className="text-sm font-semibold">Informacje o pliku</h4>
                                  {filePreview && (
                                    <Dialog open={previewModalOpen} onOpenChange={setPreviewModalOpen}>
                                      <DialogTrigger asChild>
                                        <Button
                                          type="button"
                                          variant="outline"
                                          size="sm"
                                        >
                                          <Eye className="h-4 w-4 mr-2" />
                                          Podgląd kodu
                                        </Button>
                                      </DialogTrigger>
                                      <DialogContent className="max-w-4xl w-[75vw] max-h-[80vh]">
                                        <DialogHeader>
                                          <DialogTitle>Podgląd pliku .mx3</DialogTitle>
                                          <DialogDescription>
                                            Podgląd kodu źródłowego z kolorowaniem składni
                                          </DialogDescription>
                                        </DialogHeader>
                                        <div className="h-[60vh] w-full overflow-auto">
                                          <pre className="text-sm font-mono whitespace-pre-wrap p-4 bg-slate-900 dark:bg-slate-950 text-green-400 rounded-lg">
                                            <code>{filePreview}</code>
                                          </pre>
                                        </div>
                                      </DialogContent>
                                    </Dialog>
                                  )}
                                </div>
                                <div className="grid grid-cols-2 gap-4 text-sm">
                                  <div>
                                    <span className="text-muted-foreground">Rozmiar:</span>
                                    <span className="ml-2 font-medium">
                                      {formatFileSize(fileValidation.file_size)}
                                    </span>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">Format:</span>
                                    <span className="ml-2">
                                      <Badge variant={fileValidation.is_valid ? "default" : "destructive"}>
                                        {fileValidation.is_valid ? "Prawidłowy .mx3" : "Nieprawidłowy"}
                                      </Badge>
                                    </span>
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* File Preview */}
                            <AnimatePresence>
                              {showPreview && filePreview && (
                                <motion.div
                                  initial={{ opacity: 0, height: 0 }}
                                  animate={{ opacity: 1, height: "auto" }}
                                  exit={{ opacity: 0, height: 0 }}
                                  className="bg-slate-900 dark:bg-slate-950 rounded-lg border border-slate-700 p-4"
                                >
                                  <div className="flex items-center gap-2 mb-3">
                                    <Code2 className="h-4 w-4 text-blue-400" />
                                    <span className="text-sm font-medium text-slate-300">
                                      Podgląd pliku (pierwsze 20 linii)
                                    </span>
                                  </div>
                                  <pre className="text-xs text-slate-300 font-mono overflow-x-auto whitespace-pre-wrap">
                                    {filePreview}
                                  </pre>
                                </motion.div>
                              )}
                            </AnimatePresence>
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
                              <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                  <SelectTrigger className="h-12 bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm">
                                    <SelectValue placeholder="Wybierz partycję" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {PARTITION_OPTIONS.map((option) => (
                                    <SelectItem key={option.value} value={option.value}>
                                      <div>
                                        <div className="font-medium">{option.label}</div>
                                        <div className="text-xs text-muted-foreground">
                                          {option.description}
                                        </div>
                                      </div>
                                    </SelectItem>
                                  ))}
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
                              <Select onValueChange={field.onChange} defaultValue={field.value}>
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
                                  onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                                  className="font-mono"
                                />
                              </FormControl>
                              <FormDescription>0-4 GPU</FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <FormField
                        control={form.control}
                        name="priority"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-base">
                              Priorytet zadania
                            </FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                min={1}
                                max={10}
                                {...field}
                                onChange={(e) => field.onChange(parseInt(e.target.value) || 5)}
                                className="font-mono"
                              />
                            </FormControl>
                            <FormDescription>
                              1-10, wyższy priorytet = wcześniejsze wykonanie w kolejce
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
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
                          isValidating || 
                          !fileValidation?.file_exists || 
                          !fileValidation?.is_valid
                        }
                        className="w-full h-14 text-base font-semibold bg-gradient-to-r from-purple-500 via-blue-500 to-emerald-500 hover:from-purple-600 hover:via-blue-600 hover:to-emerald-600 text-white shadow-2xl"
                      >
                        {isSubmitting ? (
                          <>
                            <Loader2 className="h-5 w-5 mr-3 animate-spin" />
                            Tworzenie zadania...
                          </>
                        ) : (
                          <>
                            <Play className="h-5 w-5 mr-3" />
                            Utwórz zadanie Amumax
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
                      <span className="text-muted-foreground">CPU:</span>
                      <span className="font-medium">{form.watch("num_cpus")} rdzeni</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">RAM:</span>
                      <span className="font-medium">{form.watch("memory_gb")} GB</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">GPU:</span>
                      <span className="font-medium">{form.watch("num_gpus")}</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Partycja:</span>
                      <span className="font-medium">{form.watch("partition")}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Czas:</span>
                      <span className="font-medium">{form.watch("time_limit")}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Priorytet:</span>
                      <span className="font-medium">{form.watch("priority")}/10</span>
                    </div>
                  </div>
                </div>
                
                <div className="pt-4 border-t border-white/20 dark:border-slate-700/50">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Oszacowany koszt:</span>
                    <Badge variant="outline" className="font-mono">
                      {estimatedCost} punktów
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Help Card */}
            <Card className="backdrop-blur-xl bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-blue-950/50 dark:via-slate-900/80 dark:to-purple-950/50 border-white/20 dark:border-slate-700/50 shadow-xl">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-blue-500" />
                  Wskazówki
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                  <p>Upewnij się, że plik .mx3 jest dostępny z węzłów obliczeniowych</p>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                  <p>Wybierz odpowiednią partycję w zależności od wymagań GPU/CPU</p>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                  <p>Ustaw realistyczny limit czasu dla swojej symulacji</p>
                </div>
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
                  <p>Zadania z wyższym priorytetem będą wykonane wcześniej</p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
