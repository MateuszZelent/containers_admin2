"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";

export default function LogoutPage() {
  const router = useRouter();
  const { logout } = useAuth();

  useEffect(() => {
    const performLogout = async () => {
      console.log('[LogoutPage] Performing logout');
      
      try {
        // Use AuthContext logout which handles all cleanup
        logout();
        
        // Navigate to login page
        router.push('/login');
      } catch (error) {
        console.error('[LogoutPage] Logout error:', error);
        // Fallback - force navigation even if logout fails
        window.location.href = '/login';
      }
    };
    
    performLogout();
  }, [router, logout]);

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
