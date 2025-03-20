"use client";

import Image from "next/image";
import { redirect } from "next/navigation";
import { useEffect, useState } from "react";
import { LoginForm } from "@/components/auth/login-form";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { authApi } from "@/lib/api-client";
import { Toaster } from "@/components/ui/sonner";

export default function LoginPage() {
  const [isLoading, setIsLoading] = useState(true);



  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-muted/40">
      <Toaster position="top-center" />
      <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[350px]">
        <div className="flex flex-col space-y-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            SLURM Container Manager
          </h1>
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
            <LoginForm />
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