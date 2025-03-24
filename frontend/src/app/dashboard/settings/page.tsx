"use client"

import { useState, useEffect } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import * as z from "zod"
import { toast } from "sonner"
import { Loader2, Eye, EyeOff } from "lucide-react"

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
import { userApi } from "@/lib/api-client"

const formSchema = z.object({
  code_server_password: z.string()
    .min(5, "Hasło musi mieć minimum 5 znaków")
    .max(50, "Hasło nie może przekraczać 50 znaków"),
})

export default function SettingsPage() {
  const [isLoading, setIsLoading] = useState(false)
  const [currentPassword, setCurrentPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [isEditing, setIsEditing] = useState(false)

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { code_server_password: "" }
  })

// Pobierz dane użytkownika przy pierwszym renderowaniu - używamy dedykowanej metody getCodeServerPassword
useEffect(() => {
    fetchSettings();
  }, []);



//   useEffect(() => {
//     async function fetchCodeServerPassword() {
//       try {
//         setIsLoading(true)
//         // Używamy dedykowanej metody do pobierania hasła code-server
//         alert("1");
//         const password = await userApi.getCodeServerPassword();
//         alert(password);
//         if (password) {
//           setCurrentPassword(password)
//           form.setValue("code_server_password", password)
//         }
//       } catch (error) {
//         toast.error("Nie udało się pobrać hasła Code Server")
//         console.error(error)
//       } finally {
//         setIsLoading(false)
//       }
//     }
    
//     fetchCodeServerPassword()
//   }, [])


// Pobierz wszystkie zadania
const fetchSettings = async () => {
    setIsLoading(true);
    try {
        const response = await userApi.getCurrentUser();
        if (response && response.data) {
            const { code_server_password } = response.data;

            if (code_server_password) {
                setCurrentPassword(code_server_password);
                form.setValue("code_server_password", code_server_password);
            } else {
                toast.error("Nie udało się pobrać hasła do Code Server.");
            }
        } else {
            toast.error("Nie udało się pobrać danych użytkownika.");
        }

        // Log only specific parts of the response for debugging
        console.log("Fetched user data:", response.data);
    } catch (error) {
        toast.error("Nie udało się pobrać listy zadań.");
        console.error(error);
    } finally {
        setIsLoading(false);
    }
};
    
  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsLoading(true)
    try {
      await userApi.updateCurrentUser({ 
        code_server_password: values.code_server_password 
      })
      setCurrentPassword(values.code_server_password)
      setIsEditing(false)
      toast.success("Hasło zostało zaktualizowane")
      setCurrentPassword(updatedPassword)
    } catch (error: any) {
      toast.error (
        error.response?.data?.detail || "Wystąpił błąd podczas aktualizacji hasła"
    )} finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Ustawienia użytkownika</h1>
      </div>

      <Separator />

      <div className="grid gap-6">
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle>Ustawienia Code Server</CardTitle>
            <CardDescription>
              Zarządzaj hasłem do Code Server używanym przy uruchamianiu kontenerów
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Bieżące hasło */}
            <div className="space-y-2">
              <h3 className="text-sm font-medium">Bieżące hasło Code Server:</h3>
              <div className="flex items-center gap-2">
                <div className="flex-1 rounded-md border p-2 bg-muted/50">
                  {showPassword ? currentPassword : '••••••••'}
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

            {/* Formularz zmiany hasła */}
            {!isEditing ? (
              <Button onClick={() => setIsEditing(true)}>Zmień hasło</Button>
            ) : (
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="code_server_password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nowe hasło Code Server</FormLabel>
                        <FormControl>
                          <Input 
                            type={showPassword ? "text" : "password"}
                            placeholder="Wprowadź nowe hasło" 
                            {...field} 
                          />
                        </FormControl>
                        <FormDescription>
                          Hasło musi mieć co najmniej 5 znaków.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="flex gap-2">
                    <Button type="submit" disabled={isLoading}>
                      {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Zapisz hasło
                    </Button>
                    <Button 
                      type="button" 
                      variant="outline" 
                      onClick={() => {
                        form.reset({ code_server_password: currentPassword })
                        setIsEditing(false)
                      }}
                    >
                      Anuluj
                    </Button>
                  </div>
                </form>
              </Form>
            )}
            
            <div className="text-sm text-muted-foreground">
              <p>To hasło będzie używane do logowania do interfejsu Code Server we wszystkich Twoich kontenerach.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
