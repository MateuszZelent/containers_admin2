"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { authApi } from "@/lib/api-client";

export default function LogoutPage() {
  const router = useRouter();

  useEffect(() => {
    const performLogout = async () => {
      await authApi.logout();
      
      // Wymuszamy pełne przeładowanie strony
      window.location.href = '/login';
    };
    
    performLogout();
  }, [router]);

  return (
    <div className="flex h-screen w-full items-center justify-center">
      <div className="text-center">
        <div className="mb-4">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent" />
        </div>
        <p>Wylogowywanie...</p>
      </div>
    </div>
  );
}
