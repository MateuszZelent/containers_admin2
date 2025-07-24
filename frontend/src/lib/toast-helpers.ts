import { toast } from 'sonner';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, Loader2 } from 'lucide-react';

// Helper functions for different types of toast notifications
export const showToast = {
  success: (message: string, description?: string, action?: { label: string; onClick: () => void }) => {
    return toast.success(message, {
      description,
      action: action ? {
        label: action.label,
        onClick: action.onClick,
      } : undefined,
    });
  },

  error: (message: string, description?: string, action?: { label: string; onClick: () => void }) => {
    return toast.error(message, {
      description,
      action: action ? {
        label: action.label,
        onClick: action.onClick,
      } : undefined,
    });
  },

  warning: (message: string, description?: string, action?: { label: string; onClick: () => void }) => {
    return toast.warning(message, {
      description,
      action: action ? {
        label: action.label,
        onClick: action.onClick,
      } : undefined,
    });
  },

  info: (message: string, description?: string, action?: { label: string; onClick: () => void }) => {
    return toast.info(message, {
      description,
      action: action ? {
        label: action.label,
        onClick: action.onClick,
      } : undefined,
    });
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
