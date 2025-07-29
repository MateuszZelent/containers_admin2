"use client";

import { useAuth } from '@/contexts/AuthContext';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect } from 'react';

interface AuthGuardProps {
  children: React.ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  console.log('[AuthGuard] State:', { isAuthenticated, isLoading, pathname });

  useEffect(() => {
    console.log('[AuthGuard] Effect triggered:', { isAuthenticated, isLoading, pathname });
    
    if (!isLoading && !isAuthenticated) {
      console.log('[AuthGuard] Not authenticated, redirecting to login...');
      // Store current path for redirect after login
      if (pathname !== '/login') {
        localStorage.setItem('login_redirect', pathname);
      }
      router.push('/login');
    } else if (!isLoading && isAuthenticated) {
      console.log('[AuthGuard] Authenticated, showing protected content');
    }
  }, [isAuthenticated, isLoading, router, pathname]);

  // Show loading while checking auth
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  // Don't render children if not authenticated
  if (!isAuthenticated) {
    return null;
  }

  return <>{children}</>;
}
