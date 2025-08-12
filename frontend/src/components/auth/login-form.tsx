"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { useRouter } from "next/navigation";
import { Loader2, User2, Lock } from "lucide-react";

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
        {/* Username */}
        <FormField
          control={form.control}
          name="username"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                Nazwa użytkownika
              </FormLabel>
              <FormControl>
                <div className="relative">
                  <User2 className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 dark:text-slate-500" />
                  <Input
                    {...field}
                    placeholder="Wprowadź nazwę użytkownika"
                    autoComplete="username"
                    disabled={isLoading}
                    className="pl-10 py-3 rounded-lg bg-slate-100/80 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 focus:border-blue-500 focus:ring-blue-500/50 dark:focus:border-blue-400 dark:focus:ring-blue-400/50 transition-all text-base"
                  />
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {/* Password */}
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                Hasło
              </FormLabel>
              <FormControl>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 dark:text-slate-500" />
                  <Input
                    {...field}
                    type="password"
                    autoComplete="current-password"
                    placeholder="Wprowadź hasło"
                    disabled={isLoading}
                    className="pl-10 py-3 rounded-lg bg-slate-100/80 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 focus:border-blue-500 focus:ring-blue-500/50 dark:focus:border-blue-400 dark:focus:ring-blue-400/50 transition-all text-base"
                  />
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {/* Remember me */}
        <FormField
          control={form.control}
          name="rememberMe"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center space-x-3 pt-2">
              <FormControl>
                <Checkbox
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  disabled={isLoading}
                  className="w-5 h-5 rounded border-slate-300 dark:border-slate-600 data-[state=checked]:bg-blue-600 data-[state=checked]:text-white dark:data-[state=checked]:bg-blue-500"
                />
              </FormControl>
              <FormLabel className="text-sm font-medium text-slate-700 dark:text-slate-300 select-none cursor-pointer">
                Zapamiętaj mnie
              </FormLabel>
            </FormItem>
          )}
        />
        <Button
          type="submit"
          className="w-full py-3 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 text-white font-bold text-base shadow-lg hover:shadow-xl hover:brightness-110 active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500 dark:focus-visible:ring-offset-slate-900 transition-all duration-150"
          disabled={isLoading}
        >
          {isLoading && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
          Zaloguj się
        </Button>
      </form>
    </Form>
  );
}