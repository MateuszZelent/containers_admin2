"use client";

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

interface PublicOnlyGuardProps {
  children: React.ReactNode;
}

export function PublicOnlyGuard({ children }: PublicOnlyGuardProps) {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  console.log('[PublicOnlyGuard] State:', { isAuthenticated, isLoading });

  useEffect(() => {
    console.log('[PublicOnlyGuard] Effect triggered:', { isAuthenticated, isLoading });
    
    if (!isLoading && isAuthenticated) {
      console.log('[PublicOnlyGuard] User is authenticated, redirecting to dashboard...');
      // If user is already authenticated, redirect to dashboard
      router.push('/dashboard');
    }
  }, [isAuthenticated, isLoading, router]);

  // Show loading while checking auth
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  // Don't render children if authenticated (will redirect)
  if (isAuthenticated) {
    return null;
  }

  return <>{children}</>;
}
