"use client";

import { LoginForm } from "@/components/auth/login-form";
import { APP_VERSION, APP_VERSION_DATE } from "@/version";
import { Network } from "lucide-react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { authApi, userApi } from "@/lib/api-client";
import { Toaster } from "@/components/ui/sonner";
import { PublicOnlyGuard } from "@/components/auth/PublicOnlyGuard";

export default function LoginPage() {

  // Add logic to check for redirect after successful login
  const handleLoginSuccess = () => {
    // Check if there's a stored redirect path
    const redirectPath = localStorage.getItem('login_redirect');
    
    if (redirectPath) {
      // Clear the stored path
      localStorage.removeItem('login_redirect');
      // Redirect to the stored path
      window.location.href = redirectPath;
    } else {
      // Default redirect to dashboard
      window.location.href = '/dashboard';
    }
  };
  
  // Handle login form submission
  const handleLogin = async (values: { username: string; password: string }) => {
    try {
      // Authenticate user and store token
      await authApi.login(values.username, values.password);

      // Fetch user info after successful login
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
      }

      // Use the success handler to redirect
      handleLoginSuccess();
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  };
  
  // Handle form submission
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const values = {
      username: formData.get('username') as string,
      password: formData.get('password') as string,
    };
    
    try {
      await handleLogin(values);
    } catch (error) {
      console.error('Submit error:', error);
    }
  };
  
  return (
    <PublicOnlyGuard>
      <div className="relative min-h-screen flex flex-col bg-muted/40">
        <Toaster position="top-center" />
        
        <div className="flex-1 flex flex-col items-center justify-center p-4">
          <div className="flex flex-col items-center gap-8 w-full">
            {/* Header: logo and app name */}
            <header className="w-full flex flex-col items-center">
              <span className="inline-flex items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 via-purple-600 to-indigo-600 shadow-xl p-2.5 mb-3">
                <Network className="w-9 h-9 text-white drop-shadow-xl" />
              </span>
              <span className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-slate-900 to-slate-700 dark:from-slate-100 dark:to-slate-300 bg-clip-text text-transparent select-none drop-shadow-sm">
                AMUcontainers
              </span>
            </header>

            {/* Main login card */}
            <main className="flex flex-col items-center justify-center w-full">
              <div className="relative rounded-3xl bg-white/80 dark:bg-slate-900/90 shadow-2xl border border-slate-200/40 dark:border-slate-800/60 px-8 pt-8 pb-6 overflow-hidden w-full max-w-md" style={{backdropFilter: 'blur(8px)'}}>
                {/* Soft accent glow */}
                <div className="absolute -top-8 left-1/2 -translate-x-1/2 w-72 h-24 bg-gradient-to-br from-blue-400/20 via-purple-400/10 to-transparent rounded-full blur-2xl opacity-50 pointer-events-none" />
                <CardHeader className="space-y-1 text-center">
                  <CardTitle className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Logowanie</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-5 mt-2">
                  <LoginForm />
                </CardContent>
              </div>
            </main>
          </div>
        </div>

        {/* Footer: version and author */}
        <footer className="w-full flex flex-col items-center gap-1 pb-6 pt-4">
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-gradient-to-r from-blue-100/80 via-purple-100/80 to-indigo-100/80 dark:from-blue-900/70 dark:via-purple-900/70 dark:to-indigo-900/70 text-blue-700 dark:text-blue-200 shadow-md tracking-wide border border-blue-200/40 dark:border-blue-800/40">
            <svg className="w-3 h-3 mr-1 text-blue-400 dark:text-blue-300" fill="currentColor" viewBox="0 0 20 20"><circle cx="10" cy="10" r="10" /></svg>
            v{APP_VERSION}
            <span className="mx-1 text-slate-400 dark:text-slate-500">•</span>
            {APP_VERSION_DATE}
          </span>
          <span className="text-xs text-slate-400 dark:text-slate-500 font-medium mt-1">Mateusz Zelent • System zarządzania kontenerami na klastrze PCSS</span>
        </footer>
      </div>
    </PublicOnlyGuard>
  );
}