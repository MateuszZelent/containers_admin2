"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { authApi, userApi } from "@/lib/api-client";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

const formSchema = z.object({
  username: z.string().min(1, "Nazwa użytkownika jest wymagana"),
  password: z.string().min(1, "Hasło jest wymagane"),
  rememberMe: z.boolean().default(false),
});

export function LoginForm() {
  const router = useRouter();
  const { refreshAuth } = useAuth();
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      username: "",
      password: "",
      rememberMe: false,
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsLoading(true);
    console.log('[LoginForm] Starting login process...');
    
    try {
      console.log('[LoginForm] Calling authApi.login...');
      await authApi.login(values.username, values.password, values.rememberMe);
      console.log('[LoginForm] Login successful, token should be stored');
      
      // Fetch user info after successful login
      try {
        const userResponse = await userApi.getCurrentUser();
        if (userResponse && userResponse.data) {
          const userData = userResponse.data as any;

          // Add full name if we have first/last name data
          if (!userData.full_name && (userData.first_name || userData.last_name)) {
            const firstName = userData.first_name || '';
            const lastName = userData.last_name || '';
            userData.full_name = `${firstName} ${lastName}`.trim();
          }

          // Save user data
          localStorage.setItem('user_data', JSON.stringify(userData));
          localStorage.setItem('user_data_timestamp', Date.now().toString());
          console.log('[LoginForm] User data saved');
        }
      } catch (userError) {
        console.error('Failed to fetch user data:', userError);
        // Don't fail login if user data fetch fails
      }
      
      // Jeśli użytkownik wybrał "Zapamiętaj mnie", ustaw dłuższą sesję
      if (values.rememberMe) {
        // Ustaw token z dłuższym czasem wygaśnięcia (30 dni)
        const expirationDate = new Date();
        expirationDate.setDate(expirationDate.getDate() + 30);
        localStorage.setItem('auth_token_expires', expirationDate.toISOString());
      } else {
        // Standardowa sesja (usuń po zamknięciu przeglądarki)
        sessionStorage.setItem('auth_session', 'true');
      }
      
      console.log('[LoginForm] Refreshing auth context...');
      // Refresh AuthContext to pick up new auth state
      refreshAuth();
      
      toast.success("Zalogowano pomyślnie");
      
      // Small delay to ensure auth context updates
      setTimeout(() => {
        console.log('[LoginForm] Attempting redirect...');
        // Check if there's a stored redirect path
        const redirectPath = localStorage.getItem('login_redirect');
        if (redirectPath) {
          localStorage.removeItem('login_redirect');
          router.push(redirectPath);
        } else {
          router.push("/dashboard");
        }
      }, 100);
      
    } catch (error: any) {
      console.error('[LoginForm] Login error:', error);
      toast.error(
        error.response?.data?.detail || "Błąd logowania. Sprawdź dane i spróbuj ponownie."
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="username"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nazwa użytkownika</FormLabel>
              <FormControl>
                <Input placeholder="admin" {...field} disabled={isLoading} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Hasło</FormLabel>
              <FormControl>
                <Input 
                  type="password" 
                  placeholder="••••••••" 
                  {...field} 
                  disabled={isLoading} 
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="rememberMe"
          render={({ field }) => (
            <FormItem className="flex flex-row items-start space-x-3 space-y-0">
              <FormControl>
                <Checkbox
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  disabled={isLoading}
                />
              </FormControl>
              <div className="space-y-1 leading-none">
                <FormLabel className="text-sm font-normal">
                  Zapamiętaj mnie
                </FormLabel>
              </div>
            </FormItem>
          )}
        />
        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Zaloguj się
        </Button>
      </form>
    </Form>
  );
}