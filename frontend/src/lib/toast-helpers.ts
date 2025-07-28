import { toast } from 'sonner';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, Loader2 } from 'lucide-react';

// Global debounce map to prevent duplicate toasts
const toastDebounceMap = new Map<string, number>();

// Clean up old entries from debounce map every 5 minutes
const CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes
let cleanupInterval: NodeJS.Timeout | null = null;

const startCleanupTask = () => {
  if (cleanupInterval) return; // Already running
  
  cleanupInterval = setInterval(() => {
    const now = Date.now();
    const cutoff = now - 30000; // Remove entries older than 30 seconds
    
    let removedCount = 0;
    for (const [key, timestamp] of toastDebounceMap.entries()) {
      if (timestamp < cutoff) {
        toastDebounceMap.delete(key);
        removedCount++;
      }
    }
    
    if (removedCount > 0) {
      console.log(`[Toast Cleanup] Removed ${removedCount} old debounce entries`);
    }
  }, CLEANUP_INTERVAL);
};

// Start cleanup task when module loads
if (typeof window !== 'undefined') {
  startCleanupTask();
}

// Helper function to debounce toasts by message
const debounceToast = (key: string, fn: () => void, delay: number = 3000) => {
  const now = Date.now();
  const lastShown = toastDebounceMap.get(key) || 0;
  
  console.log(`[Toast Debounce] Key: ${key}, Last shown: ${lastShown}, Now: ${now}, Delay: ${delay}`);
  
  if (now - lastShown > delay) {
    console.log(`[Toast Debounce] Showing toast for key: ${key}`);
    toastDebounceMap.set(key, now);
    return fn();
  } else {
    console.log(`[Toast Debounce] Skipping duplicate toast for key: ${key}, time left: ${delay - (now - lastShown)}ms`);
    return null; // Return null for blocked toasts
  }
};

// Helper functions for different types of toast notifications
export const showToast = {
  success: (message: string, description?: string, action?: { label: string; onClick: () => void }) => {
    const key = `success:${message}`;
    return debounceToast(key, () => {
      toast.success(message, {
        description,
        action: action ? {
          label: action.label,
          onClick: action.onClick,
        } : undefined,
      });
    }, 1000); // 1 second debounce for success messages
  },

  error: (message: string, description?: string, action?: { label: string; onClick: () => void }) => {
    const key = `error:${message}`;
    return debounceToast(key, () => {
      toast.error(message, {
        description,
        action: action ? {
          label: action.label,
          onClick: action.onClick,
        } : undefined,
      });
    }, 2000); // 2 second debounce for error messages
  },

  warning: (message: string, description?: string, action?: { label: string; onClick: () => void }) => {
    const key = `warning:${message}`;
    return debounceToast(key, () => {
      toast.warning(message, {
        description,
        action: action ? {
          label: action.label,
          onClick: action.onClick,
        } : undefined,
      });
    }, 3000); // 3 second debounce for warnings
  },

  info: (message: string, description?: string, action?: { label: string; onClick: () => void }) => {
    const key = `info:${message}`;
    return debounceToast(key, () => {
      toast.info(message, {
        description,
        action: action ? {
          label: action.label,
          onClick: action.onClick,
        } : undefined,
      });
    }, 1500); // 1.5 second debounce for info messages
  },

  loading: (message: string, description?: string) => {
    return toast.loading(message, {
      description,
    });
  },

  promise: async <T>(
    promise: Promise<T>,
    messages: {
      loading: string;
      success: string | ((data: T) => string);
      error: string | ((error: any) => string);
    },
    options?: {
      loadingDescription?: string;
      successDescription?: string | ((data: T) => string);
      errorDescription?: string | ((error: any) => string);
    }
  ) => {
    return toast.promise(promise, {
      loading: messages.loading,
      success: messages.success,
      error: messages.error,
    });
  },

  // Custom styled toasts for HPC jobs
  jobSuccess: (jobName: string, jobId?: string) => {
    return toast.success('✅ Zadanie ukończone pomyślnie', {
      description: `${jobName}${jobId ? ` (ID: ${jobId})` : ''}`,
      action: {
        label: 'Zobacz szczegóły',
        onClick: () => {
          console.log('Navigate to job:', jobId);
        },
      },
    });
  },

  jobError: (jobName: string, error: string, jobId?: string) => {
    return toast.error('❌ Błąd w zadaniu', {
      description: `${jobName}: ${error}${jobId ? ` (ID: ${jobId})` : ''}`,
      action: {
        label: 'Spróbuj ponownie',
        onClick: () => {
          console.log('Retry job:', jobId);
        },
      },
    });
  },

  connection: (status: 'connected' | 'disconnected' | 'reconnecting') => {
    const configs = {
      connected: {
        type: 'success' as const,
        message: '🟢 Połączenie przywrócone',
        description: 'Połączenie z klastrem PCSS zostało przywrócone',
      },
      disconnected: {
        type: 'error' as const,
        message: '🔴 Utracono połączenie',
        description: 'Brak połączenia z klastrem PCSS',
      },
      reconnecting: {
        type: 'loading' as const,
        message: '🟡 Łączenie...',
        description: 'Próba ponownego nawiązania połączenia z klastrem',
      },
    };

    const config = configs[status];
    return toast[config.type](config.message, {
      description: config.description,
    });
  },

  // Dismiss all toasts
  dismissAll: () => {
    toast.dismiss();
  },

  // Dismiss specific toast
  dismiss: (toastId: string | number) => {
    toast.dismiss(toastId);
  },
};

// Export individual functions for backward compatibility
export const {
  success: toastSuccess,
  error: toastError,
  warning: toastWarning,
  info: toastInfo,
  loading: toastLoading,
  promise: toastPromise,
} = showToast;
