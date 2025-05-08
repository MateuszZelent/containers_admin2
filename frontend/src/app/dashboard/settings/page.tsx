"use client"

import { useState, useEffect } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import * as z from "zod"
import { toast } from "sonner"
import { Loader2, Eye, EyeOff, Save, User, Code, Key, RefreshCcw } from "lucide-react"

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
import { userApi } from "@/lib/api-client"
import { Skeleton } from "@/app/dashboard/components/skeleton"

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
  const [isInitialLoading, setIsInitialLoading] = useState(true) // For initial page load skeleton
  const [isSubmittingAccount, setIsSubmittingAccount] = useState(false) // For account form submission
  const [isSubmittingCodeServer, setIsSubmittingCodeServer] = useState(false) // For code-server form submission
  const [showSuccessAccount, setShowSuccessAccount] = useState(false) // For success animation on account
  const [showSuccessCodeServer, setShowSuccessCodeServer] = useState(false) // For success animation on code server
  
  const [showPassword, setShowPassword] = useState(false)
  const [isEditingCodeServer, setIsEditingCodeServer] = useState(false) // Renamed for clarity
  const [userData, setUserData] = useState<any>(null)
  const [fetchError, setFetchError] = useState<string | null>(null)
  
  // Code Server form
  const codeServerForm = useForm<z.infer<typeof codeServerSchema>>({
    resolver: zodResolver(codeServerSchema),
    defaultValues: { code_server_password: "" }
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
  }, []);

  // Fetch all user settings from /v1/users/me endpoint
  const fetchUserData = async () => {
    setIsInitialLoading(true); // Use specific loading state
    setFetchError(null);
    
    try {
      console.log("Fetching user data from /v1/users/me...");
      const response = await userApi.getCurrentUser();
      
      if (response && response.data) {
        const fetchedUserData = response.data; // Use a different variable name to avoid confusion with state
        setUserData(fetchedUserData);
        
        console.log("Successfully fetched user data:", fetchedUserData);
        
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
        
        console.log("User data in localStorage updated:", mergedData);
        
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

  // If we're still loading data for the first time, show skeleton UI
  if (isInitialLoading) { // Use specific loading state for skeleton
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold">Ustawienia użytkownika</h1>
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
          <h1 className="text-3xl font-bold">Ustawienia użytkownika</h1>
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
        <h1 className="text-3xl font-bold">Ustawienia użytkownika</h1>
      </div>

      <Separator />

      <Tabs defaultValue="account" className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="account" className="flex items-center gap-2">
            <User className="h-4 w-4" />
            Ustawienia konta
          </TabsTrigger>
          <TabsTrigger value="code-server" className="flex items-center gap-2">
            <Code className="h-4 w-4" />
            Ustawienia Code-server
          </TabsTrigger>
        </TabsList>
        
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
      </Tabs>
    </div>
  )
}
