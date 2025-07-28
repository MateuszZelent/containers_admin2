"use client"

import { useState, useEffect } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import * as z from "zod"
import { toast } from "sonner"
import { Loader2, Eye, EyeOff, Save, User, Code, Key, RefreshCcw, Plus, Trash2, Copy, Calendar, Globe, Monitor, Upload, X, ImageIcon, Languages, Check } from "lucide-react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { userApi, cliTokensApi, CLIToken, CLITokenCreate } from "@/lib/api-client"
import { Skeleton } from "@/app/dashboard/components/skeleton"
import { UserAvatar } from "@/components/ui/user-avatar"
import { useLanguage } from "@/lib/i18n/LanguageContext"
import { SUPPORTED_LANGUAGES, SupportedLanguage } from "@/lib/i18n"

// Schema for CLI token creation
const cliTokenCreateSchema = z.object({
  name: z.string()
    .min(1, "Nazwa tokenu jest wymagana")
    .max(100, "Nazwa nie może przekraczać 100 znaków"),
  expires_days: z.number()
    .min(1, "Token musi być ważny co najmniej 1 dzień")
    .max(365, "Token nie może być ważny dłużej niż 365 dni")
    .default(30),
})

// Schema for code server password
const codeServerSchema = z.object({
  code_server_password: z.string()
    .min(5, "Hasło musi mieć minimum 5 znaków")
    .max(50, "Hasło nie może przekraczać 50 znaków"),
})

// Schema for user account data
const accountSchema = z.object({
  email: z.string().email("Podaj poprawny adres email"),
  first_name: z.string().min(1, "Imię jest wymagane"),
  last_name: z.string().min(1, "Nazwisko jest wymagane"),
  password: z.string()
    .min(8, "Hasło musi mieć minimum 8 znaków")
    .optional()
    .or(z.literal('')),
  password_confirm: z.string().optional().or(z.literal('')),
}).refine((data) => {
  if (data.password && data.password !== data.password_confirm) {
    return false;
  }
  return true;
}, {
  message: "Hasła muszą być identyczne",
  path: ["password_confirm"],
});

export default function SettingsPage() {
  const { t, language, setLanguage } = useLanguage()
  const [isInitialLoading, setIsInitialLoading] = useState(true) // For initial page load skeleton
  const [isSubmittingAccount, setIsSubmittingAccount] = useState(false) // For account form submission
  const [isSubmittingCodeServer, setIsSubmittingCodeServer] = useState(false) // For code-server form submission
  const [showSuccessAccount, setShowSuccessAccount] = useState(false) // For success animation on account
  const [showSuccessCodeServer, setShowSuccessCodeServer] = useState(false) // For success animation on code server
  
  // Avatar states
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false)
  const [isDeletingAvatar, setIsDeletingAvatar] = useState(false)
  const [showAvatarPreview, setShowAvatarPreview] = useState(false)
  const [previewAvatarUrl, setPreviewAvatarUrl] = useState<string | null>(null)
  
  // CLI Tokens states
  const [cliTokens, setCliTokens] = useState<CLIToken[]>([])
  const [isLoadingTokens, setIsLoadingTokens] = useState(false)
  const [isCreatingToken, setIsCreatingToken] = useState(false)
  const [showCreateTokenDialog, setShowCreateTokenDialog] = useState(false)
  const [newTokenData, setNewTokenData] = useState<{ token: string; tokenInfo: CLIToken } | null>(null)
  
  const [showPassword, setShowPassword] = useState(false)
  const [isEditingCodeServer, setIsEditingCodeServer] = useState(false) // Renamed for clarity
  const [userData, setUserData] = useState<any>(null)
  const [fetchError, setFetchError] = useState<string | null>(null)
  
  // Code Server form
  const codeServerForm = useForm<z.infer<typeof codeServerSchema>>({
    resolver: zodResolver(codeServerSchema),
    defaultValues: { code_server_password: "" }
  })
  
  // CLI Token creation form
  const cliTokenForm = useForm<z.infer<typeof cliTokenCreateSchema>>({
    resolver: zodResolver(cliTokenCreateSchema),
    defaultValues: {
      name: "",
      expires_days: 30
    }
  })
  
  // Account form
  const accountForm = useForm<z.infer<typeof accountSchema>>({
    resolver: zodResolver(accountSchema),
    defaultValues: {
      email: "",
      first_name: "",
      last_name: "",
      password: "",
      password_confirm: ""
    }
  })

  // Fetch user data on first render
  useEffect(() => {
    fetchUserData();
    fetchCliTokens();
  }, []);

  // Fetch CLI tokens
  const fetchCliTokens = async () => {
    setIsLoadingTokens(true);
    try {
      const response = await cliTokensApi.getTokens();
      setCliTokens(response.data);
    } catch (error: any) {
      console.error("Error fetching CLI tokens:", error);
      toast.error("Nie udało się pobrać listy tokenów CLI");
    } finally {
      setIsLoadingTokens(false);
    }
  };

  // Create new CLI token
  const createCliToken = async (values: z.infer<typeof cliTokenCreateSchema>) => {
    setIsCreatingToken(true);
    try {
      const response = await cliTokensApi.createToken(values);
      setNewTokenData({
        token: response.data.token,
        tokenInfo: response.data.token_info
      });
      
      // Refresh tokens list
      await fetchCliTokens();
      
      // Reset form
      cliTokenForm.reset();
      
      toast.success("Token CLI został pomyślnie utworzony!");
    } catch (error: any) {
      console.error("Error creating CLI token:", error);
      const errorMessage = error.response?.data?.detail || "Wystąpił błąd podczas tworzenia tokenu";
      toast.error(errorMessage);
    } finally {
      setIsCreatingToken(false);
    }
  };

  // Delete CLI token
  const deleteCliToken = async (tokenId: number, tokenName: string) => {
    try {
      await cliTokensApi.deleteToken(tokenId);
      await fetchCliTokens();
      toast.success(`Token "${tokenName}" został usunięty`);
    } catch (error: any) {
      console.error("Error deleting CLI token:", error);
      const errorMessage = error.response?.data?.detail || "Wystąpił błąd podczas usuwania tokenu";
      toast.error(errorMessage);
    }
  };

  // Extend CLI token
  const extendCliToken = async (tokenId: number, days: number) => {
    try {
      await cliTokensApi.updateToken(tokenId, { expires_days: days });
      await fetchCliTokens();
      toast.success(`Token został przedłużony o ${days} dni`);
    } catch (error: any) {
      console.error("Error extending CLI token:", error);
      const errorMessage = error.response?.data?.detail || "Wystąpił błąd podczas przedłużania tokenu";
      toast.error(errorMessage);
    }
  };

  // Copy token to clipboard
  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Token został skopiowany do schowka");
    } catch (error) {
      console.error("Error copying to clipboard:", error);
      toast.error("Nie udało się skopiować tokenu");
    }
  };

  // Format date for display
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('pl-PL');
  };

  // Check if token is expired
  const isTokenExpired = (expiresAt: string) => {
    return new Date(expiresAt) < new Date();
  };

  // Get days until expiration
  const getDaysUntilExpiration = (expiresAt: string) => {
    const now = new Date();
    const expiry = new Date(expiresAt);
    const diffTime = expiry.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  // Fetch all user settings from /v1/users/me endpoint
  const fetchUserData = async () => {
    setIsInitialLoading(true); // Use specific loading state
    setFetchError(null);
    
    try {
      // Pobieranie danych użytkownika z API
      const response = await userApi.getCurrentUser();
      
      if (response && response.data) {
        const fetchedUserData = response.data; // Use a different variable name to avoid confusion with state
        setUserData(fetchedUserData);
        
        // Dane użytkownika zostały pomyślnie pobrane
        
        // Set values for code server form
        if (fetchedUserData.code_server_password) {
          codeServerForm.setValue("code_server_password", fetchedUserData.code_server_password);
        }
        
        // Set values for account form (reset to ensure all fields are populated)
        accountForm.reset({
          email: fetchedUserData.email || "",
          first_name: fetchedUserData.first_name || "",
          last_name: fetchedUserData.last_name || "",
          password: "",
          password_confirm: ""
        });
        
      } else {
        setFetchError("Otrzymano pustą odpowiedź z serwera");
        toast.error("Nie udało się pobrać danych użytkownika.");
      }
    } catch (error: any) {
      console.error("Error fetching user data:", error);
      const errorMessage = error.response?.data?.detail || "Błąd podczas pobierania danych użytkownika";
      setFetchError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsInitialLoading(false); // Use specific loading state
    }
  };
    
  // Handle code server password form submission
  async function onCodeServerSubmit(values: z.infer<typeof codeServerSchema>) {
    if (isSubmittingCodeServer) return; 
    
    setIsSubmittingCodeServer(true);
    setShowSuccessCodeServer(false);
    
    try {
      // Add artificial delay to make loading state more visible (min 700ms)
      const startTime = Date.now();
      await userApi.updateCurrentUser({ 
        code_server_password: values.code_server_password 
      });
      
      // Ensure loader is visible for at least 700ms to prevent too quick flashing
      const elapsed = Date.now() - startTime;
      if (elapsed < 700) {
        await new Promise(resolve => setTimeout(resolve, 700 - elapsed));
      }
      
      // Update local state with the new password
      const updatedUserData = {
        ...userData,
        code_server_password: values.code_server_password
      };
      setUserData(updatedUserData);
      
      codeServerForm.reset({ code_server_password: values.code_server_password }); // Reset form with new value
      
      // Show success state on button briefly before resetting
      setShowSuccessCodeServer(true);
      
      toast.success("Hasło Code Server zostało pomyślnie zaktualizowane", {
        duration: 5000,
        position: "top-center",
        id: `code-server-update-success-${Date.now()}`,
        className: "bg-green-50 border-green-200 text-green-800",
        closeButton: true
      });
      
      // Reset success state and close edit form after delay
      setTimeout(() => {
        setShowSuccessCodeServer(false);
        setIsEditingCodeServer(false);
      }, 1500);
      
    } catch (error: any) {
      const errorMessage = error.response?.data?.detail || "Wystąpił błąd podczas aktualizacji hasła";
      console.error("Code server password update error:", error);
      
      toast.error(errorMessage, {
        duration: 7000,
        position: "top-center", 
        id: `code-server-update-error-${Date.now()}`,
        className: "bg-red-50 border-red-200 text-red-800",
        closeButton: true
      });
      
      setShowSuccessCodeServer(false);
    } finally {
      // If there was an error, we still want to stop the loading state
      if (!showSuccessCodeServer) {
        setIsSubmittingCodeServer(false);
      } else {
        // For successful submission, the loading state is managed by the success timeout
        setTimeout(() => {
          setIsSubmittingCodeServer(false);
        }, 1500);
      }
    }
  }
  
  // Dodajemy nową funkcję do aktualizacji danych w localStorage
  const updateUserDataInStorage = (updatedData: any) => {
    try {
      // Pobierz aktualne dane
      const storedUserData = localStorage.getItem('user_data');
      if (storedUserData) {
        const parsedData = JSON.parse(storedUserData);
        
        // Połącz istniejące dane z nowymi
        const mergedData = { ...parsedData, ...updatedData };
        
        // Dodaj pełne imię i nazwisko jako pomocnicze pole
        if (updatedData.first_name || updatedData.last_name) {
          const firstName = updatedData.first_name || parsedData.first_name || '';
          const lastName = updatedData.last_name || parsedData.last_name || '';
          if (firstName || lastName) {
            mergedData.full_name = `${firstName} ${lastName}`.trim();
          }
        }
        
        // Zapisz zaktualizowane dane
        localStorage.setItem('user_data', JSON.stringify(mergedData));
        localStorage.setItem('user_data_timestamp', Date.now().toString());
        
        // Dane użytkownika zostały zaktualizowane w localStorage
        
        // Wyzwól własne zdarzenie informujące o aktualizacji danych
        window.dispatchEvent(new Event('user-data-updated'));
      } else {
        // Jeśli nie ma danych w localStorage, zapisz aktualne dane z formularza
        localStorage.setItem('user_data', JSON.stringify(updatedData));
        localStorage.setItem('user_data_timestamp', Date.now().toString());
        window.dispatchEvent(new Event('user-data-updated'));
      }
    } catch (error) {
      console.error("Error updating user data in localStorage:", error);
    }
  };

  // Handle account form submission
  async function onAccountSubmit(values: z.infer<typeof accountSchema>) {
    if (isSubmittingAccount) return;
    
    setIsSubmittingAccount(true);
    setShowSuccessAccount(false);
    
    try {
      // Add artificial delay to make loading state more visible (min 700ms)
      const startTime = Date.now();
      
      const updateData: any = {
        email: values.email,
        first_name: values.first_name,
        last_name: values.last_name,
      };
      
      if (values.password) {
        updateData.password = values.password;
      }
      
      await userApi.updateCurrentUser(updateData);
      
      // Ensure loader is visible for at least 700ms to prevent too quick flashing
      const elapsed = Date.now() - startTime;
      if (elapsed < 700) {
        await new Promise(resolve => setTimeout(resolve, 700 - elapsed));
      }
      
      // Update the local state with new values
      const updatedUserData = {
        ...userData,
        email: values.email,
        first_name: values.first_name,
        last_name: values.last_name,
      };
      setUserData(updatedUserData);
      
      // Reset form fields after successful update, keeping new data
      accountForm.reset({
        email: values.email,
        first_name: values.first_name,
        last_name: values.last_name,
        password: "", // Clear password fields
        password_confirm: "" // Clear password fields
      });
      
      // Dodajemy aktualizację danych w localStorage
      updateUserDataInStorage({
        email: values.email,
        first_name: values.first_name,
        last_name: values.last_name
      });
      
      // Show success state on button
      setShowSuccessAccount(true);
      
      toast.success(
        values.password 
          ? "Dane konta oraz hasło zostały pomyślnie zaktualizowane" 
          : "Dane konta zostały pomyślnie zaktualizowane", 
        {
          duration: 5000,
          position: "top-center",
          id: `account-update-success-${Date.now()}`,
          className: "bg-green-50 border-green-200 text-green-800",
        }
      );
      
      // Reset success state after delay
      setTimeout(() => {
        setShowSuccessAccount(false);
      }, 2000);
      
    } catch (error: any) {
      console.error("Account update error:", error);
      const errorMessage = error.response?.data?.detail || "Wystąpił błąd podczas aktualizacji danych konta";
      
      toast.error(errorMessage, {
        duration: 7000,
        position: "top-center",
        id: `account-update-error-${Date.now()}`,
        className: "bg-red-50 border-red-200 text-red-800",
      });
      
      setShowSuccessAccount(false);
    } finally {
      // If there was an error, we still want to stop the loading state
      if (!showSuccessAccount) {
        setIsSubmittingAccount(false);
      } else {
        // For successful submission, the loading state is managed by the success timeout
        setTimeout(() => {
          setIsSubmittingAccount(false);
        }, 2000);
      }
    }
  }

  // Handle avatar upload
  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error("Plik musi być obrazem");
      return;
    }

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Rozmiar pliku nie może przekraczać 5MB");
      return;
    }

    setIsUploadingAvatar(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await userApi.uploadAvatar(formData);
      
      // Refresh user data from server to get the latest avatar_url
      await fetchUserData();

      toast.success("Avatar został pomyślnie zaktualizowany!");
      
      // Trigger refresh of active users panel and any other components
      window.dispatchEvent(new Event('user-data-updated'));
      
    } catch (error: any) {
      console.error("Avatar upload error:", error);
      const errorMessage = error.response?.data?.detail || "Wystąpił błąd podczas przesyłania avatara";
      toast.error(errorMessage);
    } finally {
      setIsUploadingAvatar(false);
      // Reset file input
      event.target.value = '';
    }
  };

  // Handle avatar deletion
  const handleAvatarDelete = async () => {
    setIsDeletingAvatar(true);
    try {
      await userApi.deleteAvatar();
      
      // Refresh user data from server to get the latest state
      await fetchUserData();

      toast.success("Avatar został usunięty");
      
      // Trigger refresh of active users panel and any other components
      window.dispatchEvent(new Event('user-data-updated'));
      
    } catch (error: any) {
      console.error("Avatar delete error:", error);
      const errorMessage = error.response?.data?.detail || "Wystąpił błąd podczas usuwania avatara";
      toast.error(errorMessage);
    } finally {
      setIsDeletingAvatar(false);
    }
  };

  // If we're still loading data for the first time, show skeleton UI
  if (isInitialLoading) { // Use specific loading state for skeleton
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold">{t('settings.title')}</h1>
        </div>
        <Separator />
        <div className="w-full max-w-2xl">
          <Card>
            <CardHeader>
              <Skeleton className="h-8 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </CardHeader>
            <CardContent className="space-y-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-3/4" />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // If there was an error fetching data, show error with retry button
  if (fetchError && !userData) {
    return (
      <div className="space-y-6">
        {/* ... (reszta kodu błędu bez zmian) ... */}
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold">{t('settings.title')}</h1>
        </div>

        <Separator />

        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle className="text-red-500">Błąd podczas pobierania danych</CardTitle>
            <CardDescription>
              Nie udało się pobrać danych użytkownika z serwera.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">{fetchError}</p>
            <Button onClick={fetchUserData} disabled={isInitialLoading}>
              {isInitialLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
              Spróbuj ponownie
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">{t('settings.title')}</h1>
      </div>

      <Separator />

      <Tabs defaultValue="avatar" className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="avatar" className="flex items-center gap-2">
            <ImageIcon className="h-4 w-4" />
            {t('settings.tabs.avatar')}
          </TabsTrigger>
          <TabsTrigger value="account" className="flex items-center gap-2">
            <User className="h-4 w-4" />
            {t('settings.tabs.account')}
          </TabsTrigger>
          <TabsTrigger value="code-server" className="flex items-center gap-2">
            <Code className="h-4 w-4" />
            {t('settings.tabs.codeServer')}
          </TabsTrigger>
          <TabsTrigger value="cli-tokens" className="flex items-center gap-2">
            <Key className="h-4 w-4" />
            {t('settings.tabs.cliTokens')}
          </TabsTrigger>
          <TabsTrigger value="language" className="flex items-center gap-2">
            <Languages className="h-4 w-4" />
            {t('settings.tabs.language')}
          </TabsTrigger>
        </TabsList>
        
        {/* Avatar Tab */}
        <TabsContent value="avatar">
          <Card className="max-w-2xl">
            <CardHeader>
              <CardTitle>Avatar użytkownika</CardTitle>
              <CardDescription>
                Zarządzaj swoim zdjęciem profilowym wyświetlanym w systemie
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Current Avatar Display */}
              <div className="flex items-center space-x-6">
                <div className="flex-shrink-0">
                  <UserAvatar
                    id={userData?.id}
                    username={userData?.username}
                    firstName={userData?.first_name}
                    lastName={userData?.last_name}
                    avatarUrl={userData?.avatar_url}
                    size="xl"
                    showTooltip={false}
                  />
                </div>
                <div className="flex-1 space-y-2">
                  <h3 className="text-lg font-medium">
                    {userData?.first_name && userData?.last_name
                      ? `${userData.first_name} ${userData.last_name}`
                      : userData?.username}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {userData?.avatar_url
                      ? "Twój aktualny avatar"
                      : "Używasz domyślnego avatara z inicjałami"}
                  </p>
                </div>
              </div>

              <Separator />

              {/* Avatar Upload */}
              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-medium mb-2">Prześlij nowy avatar</h4>
                  <p className="text-sm text-muted-foreground mb-4">
                    Wybierz obraz JPG, PNG lub GIF. Maksymalny rozmiar: 5MB. 
                    Obraz zostanie automatycznie przycięty do kwadratu i przeskalowany.
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="relative inline-block">
                    <input
                      type="file"
                      id="avatar-upload"
                      accept="image/*"
                      onChange={handleAvatarUpload}
                      disabled={isUploadingAvatar}
                      className="sr-only"
                    />
                    <label
                      htmlFor="avatar-upload"
                      className={`inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 cursor-pointer w-full sm:w-auto ${
                        isUploadingAvatar ? 'pointer-events-none opacity-50' : ''
                      }`}
                    >
                      {isUploadingAvatar ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Przesyłanie...
                        </>
                      ) : (
                        <>
                          <Upload className="mr-2 h-4 w-4" />
                          Wybierz plik
                        </>
                      )}
                    </label>
                  </div>

                  {userData?.avatar_url && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="outline"
                          disabled={isDeletingAvatar || isUploadingAvatar}
                          className="w-full sm:w-auto"
                        >
                          {isDeletingAvatar ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Usuwanie...
                            </>
                          ) : (
                            <>
                              <X className="mr-2 h-4 w-4" />
                              Usuń avatar
                            </>
                          )}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Usuń avatar</AlertDialogTitle>
                          <AlertDialogDescription>
                            Czy na pewno chcesz usunąć swój avatar? Zostanie zastąpiony domyślnym avatarem z inicjałami.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Anuluj</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={handleAvatarDelete}
                            className="bg-red-600 hover:bg-red-700"
                          >
                            Usuń avatar
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              </div>

              <div className="rounded-md bg-blue-50 p-4 text-sm text-blue-800 dark:bg-blue-900/20 dark:text-blue-300">
                <h4 className="font-semibold mb-2">Wskazówki dotyczące avatara:</h4>
                <ul className="space-y-1 list-disc list-inside">
                  <li>Najlepsze rezultaty uzyskasz używając kwadratowych obrazów</li>
                  <li>Obraz zostanie automatycznie przycięty i przeskalowany do 200x200 pikseli</li>
                  <li>Avatar będzie widoczny dla wszystkich użytkowników systemu</li>
                  <li>Obsługiwane formaty: JPG, PNG, GIF</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Account Settings Tab */}
        <TabsContent value="account">
          <Card className="max-w-2xl">
            <CardHeader>
              <CardTitle>Ustawienia konta</CardTitle>
              <CardDescription>
                Zarządzaj swoimi danymi osobowymi i hasłem do logowania
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...accountForm}>
                <form onSubmit={accountForm.handleSubmit(onAccountSubmit)} className="space-y-4">
                  {/* Username (Login) field - read-only */}
                  <div className="space-y-2">
                    <FormItem>
                      <FormLabel>Login (nazwa użytkownika)</FormLabel>
                      <FormControl>
                        <Input 
                          value={userData?.username || ""}
                          disabled
                          className="bg-muted/50"
                        />
                      </FormControl>
                      <FormDescription>
                        Twój login nie może zostać zmieniony
                      </FormDescription>
                    </FormItem>
                  </div>
                  
                  {/* ... (reszta pól formularza bez zmian) ... */}
                  <div className="grid gap-4 md:grid-cols-2">
                    <FormField
                      control={accountForm.control}
                      name="first_name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Imię</FormLabel>
                          <FormControl>
                            <Input placeholder="Jan" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={accountForm.control}
                      name="last_name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Nazwisko</FormLabel>
                          <FormControl>
                            <Input placeholder="Kowalski" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <FormField
                    control={accountForm.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Adres email</FormLabel>
                        <FormControl>
                          <Input type="email" placeholder="jan.kowalski@example.com" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <Separator className="my-4" />
                  
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium">Zmiana hasła (opcjonalnie)</h3>
                    <p className="text-sm text-muted-foreground">Pozostaw puste, jeśli nie chcesz zmieniać hasła</p>
                  </div>
                  
                  <div className="grid gap-4 md:grid-cols-2">
                    <FormField
                      control={accountForm.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Nowe hasło</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Input 
                                type={showPassword ? "text" : "password"} 
                                placeholder="Nowe hasło" 
                                {...field} 
                              />
                              <Button 
                                type="button"
                                variant="ghost" 
                                size="icon"
                                className="absolute right-0 top-0"
                                onClick={() => setShowPassword(!showPassword)}
                              >
                                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                              </Button>
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={accountForm.control}
                      name="password_confirm"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Potwierdź nowe hasło</FormLabel>
                          <FormControl>
                            <Input 
                              type={showPassword ? "text" : "password"} 
                              placeholder="Powtórz hasło" 
                              {...field} 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <Button 
                    type="submit" 
                    className={`mt-4 relative transition-all duration-300 ${
                      showSuccessAccount ? "bg-green-600 hover:bg-green-700" : ""
                    }`}
                    disabled={isSubmittingAccount || showSuccessAccount}
                  >
                    {isSubmittingAccount ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        <span className="animate-pulse">Zapisywanie...</span>
                      </>
                    ) : showSuccessAccount ? (
                      <>
                        <svg 
                          className="mr-2 h-4 w-4 animate-scale-in-center" 
                          fill="none" 
                          stroke="currentColor" 
                          viewBox="0 0 24 24" 
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path 
                            strokeLinecap="round" 
                            strokeLinejoin="round" 
                            strokeWidth={2} 
                            d="M5 13l4 4L19 7" 
                          />
                        </svg>
                        Zapisano!
                      </>
                    ) : (
                      <>
                        <Save className="mr-2 h-4 w-4" />
                        Zapisz zmiany
                      </>
                    )}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* Code Server Settings Tab */}
        <TabsContent value="code-server">
          <Card className="max-w-2xl">
            <CardHeader>
              <CardTitle>Ustawienia Code Server</CardTitle>
              <CardDescription>
                Zarządzaj hasłem do Code Server używanym przy uruchamianiu kontenerów
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {userData?.code_server_password && !isEditingCodeServer && ( // Show current password only if not editing
                <div className="space-y-2">
                  <h3 className="text-sm font-medium">Bieżące hasło Code Server:</h3>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 rounded-md border p-2 bg-muted/50">
                      {showPassword ? userData.code_server_password : '••••••••'}
                    </div>
                    <Button 
                      variant="outline" 
                      size="icon"
                      onClick={() => setShowPassword(!showPassword)}
                      title={showPassword ? "Ukryj hasło" : "Pokaż hasło"}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              )}

              {!isEditingCodeServer ? (
                <Button 
                  onClick={() => {
                    setIsEditingCodeServer(true);
                    // Optionally pre-fill form if editing existing password
                    codeServerForm.setValue("code_server_password", userData?.code_server_password || "");
                  }}
                  className="flex items-center gap-2"
                >
                  <Key className="h-4 w-4" />
                  {userData?.code_server_password ? "Zmień hasło" : "Ustaw hasło"}                </Button>              ) : (                <Form {...codeServerForm}>                  <form onSubmit={codeServerForm.handleSubmit(onCodeServerSubmit)} className="space-y-4">                    <FormField                      control={codeServerForm.control}                      name="code_server_password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Nowe hasło Code Server</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Input 
                                type={showPassword ? "text" : "password"}
                                placeholder="Wprowadź nowe hasło" 
                                {...field} 
                              />
                              <Button 
                                type="button"
                                variant="ghost" 
                                size="icon"
                                className="absolute right-0 top-0"
                                onClick={() => setShowPassword(!showPassword)}
                              >
                                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                              </Button>
                            </div>
                          </FormControl>
                          <FormDescription>
                            Hasło musi mieć co najmniej 5 znaków.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="flex gap-2">
                      <Button 
                        type="submit" 
                        disabled={isSubmittingCodeServer || showSuccessCodeServer}
                        className={`flex items-center gap-2 transition-all duration-300 ${
                          showSuccessCodeServer ? "bg-green-600 hover:bg-green-700" : ""
                        }`}
                      >
                        {isSubmittingCodeServer ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span className="animate-pulse">Zapisywanie...</span>
                          </>
                        ) : showSuccessCodeServer ? (
                          <>
                            <svg 
                              className="h-4 w-4 animate-scale-in-center" 
                              fill="none" 
                              stroke="currentColor" 
                              viewBox="0 0 24 24" 
                              xmlns="http://www.w3.org/2000/svg"
                            >
                              <path 
                                strokeLinecap="round" 
                                strokeLinejoin="round" 
                                strokeWidth={2} 
                                d="M5 13l4 4L19 7" 
                              />
                            </svg>
                            Zapisano!
                          </>
                        ) : (
                          <>
                            <Save className="h-4 w-4" />
                            Zapisz hasło
                          </>
                        )}
                      </Button>
                      <Button 
                        type="button" 
                        variant="outline" 
                        onClick={() => {
                          codeServerForm.reset({ code_server_password: userData?.code_server_password || "" })
                          setIsEditingCodeServer(false)
                        }}
                        disabled={isSubmittingCodeServer || showSuccessCodeServer}
                      >
                        Anuluj
                      </Button>
                    </div>
                  </form>
                </Form>
              )}
              
              <div className="rounded-md bg-blue-50 p-4 text-sm text-blue-800 dark:bg-blue-900/20 dark:text-blue-300">
                <p>To hasło będzie używane do logowania do interfejsu Code Server we wszystkich Twoich kontenerach. Zalecamy użycie silnego i unikalnego hasła.</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* CLI Tokens Tab */}
        <TabsContent value="cli-tokens">
          <Card className="max-w-4xl">
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>Tokeny CLI</CardTitle>
                  <CardDescription>
                    Zarządzaj tokenami uwierzytelniania dla narzędzi CLI
                  </CardDescription>
                </div>
                <Dialog open={showCreateTokenDialog} onOpenChange={setShowCreateTokenDialog}>
                  <DialogTrigger asChild>
                    <Button className="flex items-center gap-2">
                      <Plus className="h-4 w-4" />
                      Utwórz nowy token
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Utwórz nowy token CLI</DialogTitle>
                      <DialogDescription>
                        Utwórz nowy token do uwierzytelniania w narzędziach CLI
                      </DialogDescription>
                    </DialogHeader>
                    <Form {...cliTokenForm}>
                      <form onSubmit={cliTokenForm.handleSubmit(createCliToken)} className="space-y-4">
                        <FormField
                          control={cliTokenForm.control}
                          name="name"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Nazwa tokenu</FormLabel>
                              <FormControl>
                                <Input 
                                  placeholder="np. Laptop do pracy, Serwer produkcyjny" 
                                  {...field} 
                                />
                              </FormControl>
                              <FormDescription>
                                Podaj opisową nazwę, aby łatwo rozpoznać, gdzie używasz tego tokenu
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={cliTokenForm.control}
                          name="expires_days"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Ważność (dni)</FormLabel>
                              <FormControl>
                                <Input 
                                  type="number" 
                                  min="1" 
                                  max="365" 
                                  {...field}
                                  onChange={(e) => field.onChange(parseInt(e.target.value))}
                                />
                              </FormControl>
                              <FormDescription>
                                Czas ważności tokenu (1-365 dni)
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <DialogFooter>
                          <Button 
                            type="button" 
                            variant="outline" 
                            onClick={() => setShowCreateTokenDialog(false)}
                            disabled={isCreatingToken}
                          >
                            Anuluj
                          </Button>
                          <Button type="submit" disabled={isCreatingToken}>
                            {isCreatingToken ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Tworzenie...
                              </>
                            ) : (
                              "Utwórz token"
                            )}
                          </Button>
                        </DialogFooter>
                      </form>
                    </Form>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              {/* Show new token after creation */}
              {newTokenData && (
                <div className="mb-6 p-4 border rounded-lg bg-green-50 dark:bg-green-900/20">
                  <h3 className="font-semibold text-green-800 dark:text-green-300 mb-2">
                    Token został utworzony!
                  </h3>
                  <p className="text-sm text-green-700 dark:text-green-400 mb-3">
                    Skopiuj poniższy token i zapisz go w bezpiecznym miejscu. Nie będzie możliwe ponowne jego wyświetlenie.
                  </p>
                  <div className="flex items-center gap-2 p-3 bg-white dark:bg-gray-800 border rounded font-mono text-sm">
                    <code className="flex-1 break-all">{newTokenData.token}</code>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        navigator.clipboard.writeText(newTokenData.token);
                        toast.success("Token skopiowany do schowka!");
                      }}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  <Button
                    className="mt-3"
                    size="sm"
                    onClick={() => setNewTokenData(null)}
                  >
                    Zamknij
                  </Button>
                </div>
              )}

              {/* Tokens list */}
              <div className="space-y-4">
                {isLoadingTokens ? (
                  <div className="space-y-3">
                    {Array(3).fill(0).map((_, i) => (
                      <Skeleton key={i} className="h-20 w-full" />
                    ))}
                  </div>
                ) : cliTokens.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Key className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Nie masz jeszcze żadnych tokenów CLI</p>
                    <p className="text-sm">Utwórz pierwszy token, aby rozpocząć korzystanie z CLI</p>
                  </div>
                ) : (
                  cliTokens.map((token) => {
                    const isExpired = new Date(token.expires_at) < new Date();
                    const daysUntilExpiry = Math.ceil(
                      (new Date(token.expires_at).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
                    );

                    return (
                      <div key={token.id} className={`p-4 border rounded-lg ${
                        !token.is_active || isExpired ? 'bg-muted/50' : 'bg-background'
                      }`}>
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <h3 className="font-semibold">{token.name}</h3>
                              {!token.is_active ? (
                                <Badge variant="secondary">Nieaktywny</Badge>
                              ) : isExpired ? (
                                <Badge variant="destructive">Wygasł</Badge>
                              ) : daysUntilExpiry <= 7 ? (
                                <Badge variant="outline" className="text-orange-600 border-orange-600">
                                  Wygasa za {daysUntilExpiry} dni
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-green-600 border-green-600">
                                  Aktywny
                                </Badge>
                              )}
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-muted-foreground">
                              <div className="flex items-center gap-2">
                                <Calendar className="h-4 w-4" />
                                <span>Utworzony: {new Date(token.created_at).toLocaleDateString('pl-PL')}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <Calendar className="h-4 w-4" />
                                <span>Wygasa: {new Date(token.expires_at).toLocaleDateString('pl-PL')}</span>
                              </div>
                              {token.last_used_at ? (
                                <div className="flex items-center gap-2">
                                  <Globe className="h-4 w-4" />
                                  <span>Ostatnie użycie: {new Date(token.last_used_at).toLocaleDateString('pl-PL')}</span>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <Globe className="h-4 w-4" />
                                  <span>Nigdy nie używany</span>
                                </div>
                              )}
                            </div>

                            {token.last_used_ip && (
                              <div className="mt-2 text-sm text-muted-foreground">
                                <div className="flex items-center gap-2">
                                  <Monitor className="h-4 w-4" />
                                  <span>Ostatnie IP: {token.last_used_ip}</span>
                                </div>
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-2 ml-4">
                            {token.is_active && !isExpired && (
                              <Dialog>
                                <DialogTrigger asChild>
                                  <Button variant="outline" size="sm">
                                    <RefreshCcw className="h-4 w-4 mr-1" />
                                    Przedłuż
                                  </Button>
                                </DialogTrigger>
                                <DialogContent>
                                  <DialogHeader>
                                    <DialogTitle>Przedłuż token "{token.name}"</DialogTitle>
                                    <DialogDescription>
                                      Wybierz o ile dni przedłużyć ważność tokenu
                                    </DialogDescription>
                                  </DialogHeader>
                                  <div className="grid gap-4 py-4">
                                    <div className="grid grid-cols-4 items-center gap-4">
                                      <Button
                                        onClick={() => extendCliToken(token.id, 30)}
                                        className="col-span-4"
                                      >
                                        Przedłuż o 30 dni
                                      </Button>
                                    </div>
                                    <div className="grid grid-cols-4 items-center gap-4">
                                      <Button
                                        onClick={() => extendCliToken(token.id, 90)}
                                        className="col-span-4"
                                      >
                                        Przedłuż o 90 dni
                                      </Button>
                                    </div>
                                    <div className="grid grid-cols-4 items-center gap-4">
                                      <Button
                                        onClick={() => extendCliToken(token.id, 180)}
                                        className="col-span-4"
                                      >
                                        Przedłuż o 180 dni
                                      </Button>
                                    </div>
                                  </div>
                                </DialogContent>
                              </Dialog>
                            )}
                            
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="destructive" size="sm">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Usuń token</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Czy na pewno chcesz usunąć token "{token.name}"? 
                                    Ta akcja nie może zostać cofnięta i uniemożliwi korzystanie z tego tokenu.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Anuluj</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => deleteCliToken(token.id, token.name)}
                                    className="bg-red-600 hover:bg-red-700"
                                  >
                                    Usuń token
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>

              {cliTokens.length > 0 && (
                <div className="mt-6 pt-6 border-t">
                  <div className="rounded-md bg-blue-50 p-4 text-sm text-blue-800 dark:bg-blue-900/20 dark:text-blue-300">
                    <h4 className="font-semibold mb-2">Informacje o tokenach CLI:</h4>
                    <ul className="space-y-1 list-disc list-inside">
                      <li>Tokeny CLI umożliwiają uwierzytelnianie w narzędziach wiersza poleceń bez podawania hasła</li>
                      <li>Każdy token ma określony czas ważności i może być przedłużony lub usunięty w dowolnym momencie</li>
                      <li>Token jest wyświetlany tylko podczas tworzenia - zapisz go w bezpiecznym miejscu</li>
                      <li>Monitoruj ostatnie użycie tokenów, aby wykryć nieautoryzowany dostęp</li>
                    </ul>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Language Tab */}
        <TabsContent value="language">
          <Card className="max-w-2xl">
            <CardHeader>
              <CardTitle>{t('settings.language.title')}</CardTitle>
              <CardDescription>
                {t('settings.language.description')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Current Language Display */}
              <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/50">
                <div className="flex items-center gap-3">
                  <Languages className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">{t('settings.language.current')}</p>
                    <p className="text-sm text-muted-foreground">
                      {SUPPORTED_LANGUAGES[language]}
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="text-sm font-medium">{t('settings.language.change')}</h3>
                <div className="grid gap-3">
                  {Object.entries(SUPPORTED_LANGUAGES).map(([langCode, langName]) => (
                    <Button
                      key={langCode}
                      variant={language === langCode ? "default" : "outline"}
                      className="justify-start"
                      onClick={async () => {
                        if (langCode !== language) {
                          try {
                            await userApi.updateLanguage(langCode);
                            setLanguage(langCode as SupportedLanguage);
                            
                            const successMessages = {
                              pl: 'Język interfejsu został zmieniony',
                              en: 'Interface language has been changed'
                            };
                            
                            toast.success(successMessages[langCode as SupportedLanguage], {
                              duration: 3000,
                              position: "top-center",
                            });
                            
                            // Refresh page to ensure all components update
                            setTimeout(() => {
                              window.location.reload();
                            }, 500);
                            
                          } catch (error) {
                            console.error('Error changing language:', error);
                            toast.error(t('settings.language.changeError'), {
                              duration: 5000,
                              position: "top-center",
                            });
                          }
                        }
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <Languages className="h-4 w-4" />
                        <span>{langName}</span>
                        {language === langCode && (
                          <Check className="h-4 w-4 ml-auto" />
                        )}
                      </div>
                    </Button>
                  ))}
                </div>
              </div>

              <div className="rounded-md bg-blue-50 p-4 text-sm text-blue-800 dark:bg-blue-900/20 dark:text-blue-300">
                <p>
                  {language === 'pl' 
                    ? 'Zmiana języka zostanie zastosowana natychmiast. Strona zostanie odświeżona, aby zapewnić prawidłowe wyświetlanie wszystkich elementów.' 
                    : 'Language change will be applied immediately. Page will be refreshed to ensure proper display of all elements.'
                  }
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
