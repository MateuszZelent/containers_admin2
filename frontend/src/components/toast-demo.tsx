"use client";

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { showToast } from '@/lib/toast-helpers';
import { toast } from 'sonner';
import { 
  CheckCircle2, 
  AlertCircle, 
  AlertTriangle, 
  Info, 
  Loader2,
  Sparkles,
  Zap,
  Bell
} from 'lucide-react';

export function ToastDemo() {
  const handleSuccessToast = () => {
    showToast.success(
      'Operacja zakończona pomyślnie!',
      'Wszystkie dane zostały zapisane w systemie.',
      {
        label: 'Zobacz szczegóły',
        onClick: () => console.log('Action clicked!')
      }
    );
  };

  const handleErrorToast = () => {
    showToast.error(
      'Wystąpił błąd systemu',
      'Nie udało się połączyć z bazą danych. Spróbuj ponownie.',
      {
        label: 'Spróbuj ponownie',
        onClick: () => console.log('Retry clicked!')
      }
    );
  };

  const handleWarningToast = () => {
    showToast.warning(
      'Uwaga: Ograniczone zasoby',
      'Zostało tylko 15% wolnego miejsca na dysku.'
    );
  };

  const handleInfoToast = () => {
    showToast.info(
      'Nowa aktualizacja dostępna',
      'Wersja 2.1.0 zawiera nowe funkcje i poprawki błędów.'
    );
  };

  const handleLoadingToast = () => {
    const loadingToast = showToast.loading(
      'Przetwarzanie danych...',
      'Proszę czekać, operacja może potrwać kilka minut.'
    );

    // Simulate async operation
    setTimeout(() => {
      showToast.dismiss(loadingToast);
      showToast.success('Dane zostały przetworzone!');
    }, 3000);
  };

  const handlePromiseToast = () => {
    const simulatePromise = new Promise((resolve, reject) => {
      setTimeout(() => {
        Math.random() > 0.5 ? resolve('Success data') : reject(new Error('Something went wrong'));
      }, 2000);
    });

    showToast.promise(simulatePromise, {
      loading: 'Ładowanie danych...',
      success: 'Dane zostały załadowane pomyślnie!',
      error: 'Nie udało się załadować danych',
    });
  };

  const handleJobSuccess = () => {
    showToast.jobSuccess('AMUMAX Simulation', 'job_12345');
  };

  const handleJobError = () => {
    showToast.jobError('COMSOL Analysis', 'Insufficient memory allocated', 'job_67890');
  };

  const handleConnectionStatus = (status: 'connected' | 'disconnected' | 'reconnecting') => {
    showToast.connection(status);
  };

  const handleMultipleToasts = () => {
    showToast.info('Rozpoczynam operację...');
    
    setTimeout(() => {
      showToast.warning('Sprawdzam zasoby systemowe...');
    }, 500);

    setTimeout(() => {
      showToast.success('Wszystko gotowe!', 'System jest gotowy do pracy.');
    }, 1000);
  };

  const handleBasicSonnerToast = () => {
    toast('Podstawowy toast', {
      description: 'To jest podstawowy toast z sonner',
      action: {
        label: 'Akcja',
        onClick: () => console.log('Basic action!'),
      },
    });
  };

  return (
    <div className="w-full max-w-4xl mx-auto p-6 space-y-6">
      <Card className="glass-tabs">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-blue-500" />
            <CardTitle className="text-2xl">Glass Toast Notifications</CardTitle>
          </div>
          <CardDescription>
            Piękne, nowoczesne powiadomienia w stylu glass design, dostosowane do stylistyki aplikacji
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-8">
          {/* Basic Toasts */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-4">
              <Bell className="w-5 h-5 text-slate-600" />
              <h3 className="text-lg font-semibold">Podstawowe powiadomienia</h3>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Button 
                onClick={handleSuccessToast}
                className="bg-green-500/10 border-green-500/20 text-green-700 hover:bg-green-500/20 dark:text-green-400"
                variant="outline"
              >
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Success
              </Button>
              
              <Button 
                onClick={handleErrorToast}
                className="bg-red-500/10 border-red-500/20 text-red-700 hover:bg-red-500/20 dark:text-red-400"
                variant="outline"
              >
                <AlertCircle className="w-4 h-4 mr-2" />
                Error
              </Button>
              
              <Button 
                onClick={handleWarningToast}
                className="bg-yellow-500/10 border-yellow-500/20 text-yellow-700 hover:bg-yellow-500/20 dark:text-yellow-400"
                variant="outline"
              >
                <AlertTriangle className="w-4 h-4 mr-2" />
                Warning
              </Button>
              
              <Button 
                onClick={handleInfoToast}
                className="bg-blue-500/10 border-blue-500/20 text-blue-700 hover:bg-blue-500/20 dark:text-blue-400"
                variant="outline"
              >
                <Info className="w-4 h-4 mr-2" />
                Info
              </Button>
            </div>
          </div>

          {/* Advanced Toasts */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-4">
              <Zap className="w-5 h-5 text-slate-600" />
              <h3 className="text-lg font-semibold">Zaawansowane powiadomienia</h3>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <Button 
                onClick={handleLoadingToast}
                className="bg-purple-500/10 border-purple-500/20 text-purple-700 hover:bg-purple-500/20 dark:text-purple-400"
                variant="outline"
              >
                <Loader2 className="w-4 h-4 mr-2" />
                Loading Toast
              </Button>
              
              <Button 
                onClick={handlePromiseToast}
                className="bg-indigo-500/10 border-indigo-500/20 text-indigo-700 hover:bg-indigo-500/20 dark:text-indigo-400"
                variant="outline"
              >
                Promise Toast
              </Button>
              
              <Button 
                onClick={handleMultipleToasts}
                className="bg-pink-500/10 border-pink-500/20 text-pink-700 hover:bg-pink-500/20 dark:text-pink-400"
                variant="outline"
              >
                Multiple Toasts
              </Button>
              
              <Button 
                onClick={handleBasicSonnerToast}
                className="bg-gray-500/10 border-gray-500/20 text-gray-700 hover:bg-gray-500/20 dark:text-gray-400"
                variant="outline"
              >
                Basic Sonner
              </Button>
            </div>
          </div>

          {/* Job-specific Toasts */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-4">
              <Badge variant="secondary" className="text-sm">
                🚀 Zadania HPC
              </Badge>
              <h3 className="text-lg font-semibold">Powiadomienia o zadaniach</h3>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Button 
                onClick={handleJobSuccess}
                className="bg-green-500/10 border-green-500/20 text-green-700 hover:bg-green-500/20 dark:text-green-400"
                variant="outline"
              >
                ✅ Job Success
              </Button>
              
              <Button 
                onClick={handleJobError}
                className="bg-red-500/10 border-red-500/20 text-red-700 hover:bg-red-500/20 dark:text-red-400"
                variant="outline"
              >
                ❌ Job Error
              </Button>
            </div>
          </div>

          {/* Connection Status */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-4">
              <Badge variant="outline" className="text-sm">
                🔗 Połączenie
              </Badge>
              <h3 className="text-lg font-semibold">Status połączenia</h3>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Button 
                onClick={() => handleConnectionStatus('connected')}
                className="bg-green-500/10 border-green-500/20 text-green-700 hover:bg-green-500/20 dark:text-green-400"
                variant="outline"
              >
                🟢 Connected
              </Button>
              
              <Button 
                onClick={() => handleConnectionStatus('disconnected')}
                className="bg-red-500/10 border-red-500/20 text-red-700 hover:bg-red-500/20 dark:text-red-400"
                variant="outline"
              >
                🔴 Disconnected
              </Button>
              
              <Button 
                onClick={() => handleConnectionStatus('reconnecting')}
                className="bg-yellow-500/10 border-yellow-500/20 text-yellow-700 hover:bg-yellow-500/20 dark:text-yellow-400"
                variant="outline"
              >
                🟡 Reconnecting
              </Button>
            </div>
          </div>

          {/* Utilities */}
          <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-slate-700">
            <h3 className="text-lg font-semibold">Narzędzia</h3>
            <div className="flex gap-3">
              <Button 
                onClick={showToast.dismissAll}
                variant="outline"
                size="sm"
              >
                Usuń wszystkie
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Feature List */}
      <Card className="glass-tabs">
        <CardHeader>
          <CardTitle className="text-xl">✨ Funkcje Glass Toast</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div className="space-y-2">
              <h4 className="font-semibold text-blue-600 dark:text-blue-400">🎨 Design</h4>
              <ul className="space-y-1 text-slate-600 dark:text-slate-400">
                <li>• Glass morphism effect z backdrop blur</li>
                <li>• Płynne animacje wejścia/wyjścia</li>
                <li>• Responsywny design</li>
                <li>• Wsparcie dla dark mode</li>
                <li>• Dostępność (a11y) i high contrast</li>
              </ul>
            </div>
            
            <div className="space-y-2">
              <h4 className="font-semibold text-green-600 dark:text-green-400">⚡ Funkcjonalność</h4>
              <ul className="space-y-1 text-slate-600 dark:text-slate-400">
                <li>• 5 typów powiadomień</li>
                <li>• Promise handling</li>
                <li>• Custom akcje i ikony</li>
                <li>• Auto-dismiss z progress bar</li>
                <li>• Niestandardowe powiadomienia HPC</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
