"use client";

import { Toaster } from 'sonner';
import { useTheme } from 'next-themes';

// Konfiguracja domyślnych opcji dla wszystkich powiadomień toast
export function SonnerToaster() {
  const { theme } = useTheme();
  
  return (
    <Toaster
      theme={theme as any}
      position="top-center"
      expand={true}
      richColors={true}
      closeButton={true}
      duration={4000}
      gap={12}
      offset={20}
      className="toaster group"
      toastOptions={{
        style: {
          background: 'var(--toast-bg)',
          border: '1px solid var(--toast-border)',
          color: 'var(--toast-color)',
        },
        className: 'glass-toast',
        descriptionClassName: 'glass-toast-description',
      }}
    />
  );
}
