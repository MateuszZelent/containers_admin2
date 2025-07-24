"use client";

import { LoginForm } from "@/components/auth/login-form";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { authApi, userApi } from "@/lib/api-client";
import { Toaster } from "@/components/ui/sonner";

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
    <div className="min-h-screen flex flex-col items-center justify-center bg-muted/40">
      <Toaster position="top-center" />
      <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[350px]">
        <div className="flex flex-col space-y-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            AMUcontainers
          </h1>
          <h2 className="text-lg font-medium">Mateusz Zelent</h2>
          <p className="text-sm text-muted-foreground">
            Zaloguj się, aby zarządzać kontenerami na klastrze obliczeniowym
          </p>
        </div>

        <Card className="sm:shadow-md">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl">Logowanie</CardTitle>
            <CardDescription>
              Wprowadź swoje dane logowania
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <LoginForm onSubmit={handleLogin} />
          </CardContent>
          <CardFooter className="flex flex-col">
            <p className="px-8 text-center text-sm text-muted-foreground">
              System zarządzania kontenerami na klastrze PCSS
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}