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
  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-7">
        {/* Username */}
        <FormField
          control={form.control}
          name="username"
          render={({ field }) => (
            <FormItem className="relative">
              <FormControl>
                <div className="relative">
                  <User2 className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-blue-400 dark:text-blue-300 opacity-80 pointer-events-none" />
                  <Input
                    {...field}
                    placeholder=" "
                    autoComplete="username"
                    disabled={isLoading}
                    className="peer pl-10 py-2.5 rounded-xl bg-slate-100/80 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 focus:border-blue-400 focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-900/40 transition-all text-base font-medium placeholder:opacity-0 autofill:shadow-[inset_0_0_0_1000px_rgba(241,245,249,0.8)] dark:autofill:shadow-[inset_0_0_0_1000px_rgba(30,41,59,0.8)]"
                  />
                  <label className="absolute left-10 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400 text-base pointer-events-none transition-all duration-200 origin-left scale-100 peer-placeholder-shown:scale-100 peer-placeholder-shown:top-1/2 peer-placeholder-shown:text-base peer-focus:scale-90 peer-focus:-translate-y-6 peer-focus:text-blue-500 dark:peer-focus:text-blue-300 peer-not-placeholder-shown:scale-90 peer-not-placeholder-shown:-translate-y-6 peer-not-placeholder-shown:text-blue-500 dark:peer-not-placeholder-shown:text-blue-300">
                    Nazwa użytkownika
                  </label>
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
            <FormItem className="relative">
              <FormControl>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-blue-400 dark:text-blue-300 opacity-80 pointer-events-none" />
                  <Input
                    {...field}
                    type="password"
                    autoComplete="current-password"
                    placeholder=" "
                    disabled={isLoading}
                    className="peer pl-10 py-2.5 rounded-xl bg-slate-100/80 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 focus:border-blue-400 focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-900/40 transition-all text-base font-medium placeholder:opacity-0 autofill:shadow-[inset_0_0_0_1000px_rgba(241,245,249,0.8)] dark:autofill:shadow-[inset_0_0_0_1000px_rgba(30,41,59,0.8)]"
                  />
                  <label className="absolute left-10 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400 text-base pointer-events-none transition-all duration-200 origin-left scale-100 peer-placeholder-shown:scale-100 peer-placeholder-shown:top-1/2 peer-placeholder-shown:text-base peer-focus:scale-90 peer-focus:-translate-y-6 peer-focus:text-blue-500 dark:peer-focus:text-blue-300 peer-not-placeholder-shown:scale-90 peer-not-placeholder-shown:-translate-y-6 peer-not-placeholder-shown:text-blue-500 dark:peer-not-placeholder-shown:text-blue-300">
                    Hasło
                  </label>
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
            <FormItem className="flex flex-row items-center space-x-2">
              <FormControl>
                <Checkbox
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  disabled={isLoading}
                  className="rounded-md border-slate-300 dark:border-slate-700 focus:ring-blue-400"
                />
              </FormControl>
              <FormLabel className="text-sm font-medium text-slate-600 dark:text-slate-300 select-none">
                Zapamiętaj mnie
              </FormLabel>
            </FormItem>
          )}
        />
        <Button
          type="submit"
          className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-500 via-purple-500 to-indigo-500 text-white font-bold text-base shadow-lg border-0 hover:brightness-110 hover:scale-[1.02] active:scale-95 focus:ring-2 focus:ring-blue-300 focus:outline-none transition-all duration-150"
          style={{boxShadow: '0 4px 24px 0 rgba(80,80,180,0.10)'}}
          disabled={isLoading}
        >
          {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Zaloguj się
        </Button>
      </form>
    </Form>
  );
}