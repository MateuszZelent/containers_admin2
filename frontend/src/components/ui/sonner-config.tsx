import { Toaster } from 'sonner';

// Konfiguracja domyślnych opcji dla wszystkich powiadomień toast
export function SonnerToaster() {
  return (
    <Toaster
      position="top-center"
      toastOptions={{
        closeButton: true,
        duration: 5000, // 5 sekund jako domyślny czas
        className: "sonner-toast-with-close-button",
        style: {
          // Opcjonalne style dla lepszego wyświetlania przycisku zamykania
        }
      }}
    />
  );
}
