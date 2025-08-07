"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from '@/components/ui/progress';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ExternalLink, 
  Loader2, 
  CheckCircle2, 
  AlertCircle, 
  Globe,
  Server,
  Terminal,
  Wifi,
  Link,
  Wrench
} from 'lucide-react';
import { useTunnelSetupWebSocket, TunnelSetupEvent } from '@/hooks/useTunnelSetupWebSocket';

interface CodeServerModalProps {
  jobId: number;
  jobName: string;
  isOpen: boolean;
  onClose: () => void;
}

type ProcessStage = 'preparing' | 'ssh_tunnel' | 'domain_setup' | 'caddy_setup' | 'domain_check' | 'complete' | 'error';

interface ConsoleMessage {
  id: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  timestamp: Date;
  step?: string;
}

export function CodeServerModal({
  jobId,
  jobName,
  isOpen,
  onClose
}: CodeServerModalProps) {
  const [currentStage, setCurrentStage] = useState<ProcessStage>('preparing');
  const [progress, setProgress] = useState(0);
  const [autoStarted, setAutoStarted] = useState(false);
  const [willOpenTab, setWillOpenTab] = useState(false);
  const [consoleMessages, setConsoleMessages] = useState<ConsoleMessage[]>([]);
  const [finalUrl, setFinalUrl] = useState<string>('');
  const tabOpenedRef = useRef(false);
  const consoleRef = useRef<HTMLDivElement>(null);

  // Auto-scroll console to bottom
  useEffect(() => {
    if (consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }
  }, [consoleMessages]);

  const addConsoleMessage = useCallback((message: string, type: 'info' | 'success' | 'warning' | 'error', step?: string) => {
    const newMessage: ConsoleMessage = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      message,
      type,
      timestamp: new Date(),
      step
    };
    
    setConsoleMessages(prev => [...prev, newMessage]);
  }, []);

  // Handle tunnel setup WebSocket events
  const handleTunnelEvent = useCallback((event: TunnelSetupEvent) => {
    console.log('Received tunnel event:', event);
    
    const messageType = event.type === 'tunnel_error' || event.type === 'setup_error' ? 'error' : 
                       event.type === 'tunnel_warning' ? 'warning' :
                       event.type === 'tunnel_established' || event.type === 'setup_complete' ? 'success' : 'info';
    
    addConsoleMessage(event.message, messageType, event.step);
    
    // Update progress and stage based on event step or type
    if (event.step) {
      switch (event.step) {
        case 'ssh_tunnel':
        case 'initializing':
        case 'validation':
          setCurrentStage('ssh_tunnel');
          setProgress(25);
          break;
        case 'port_allocation':
        case 'database':
          setCurrentStage('ssh_tunnel');
          setProgress(40);
          break;
        case 'background_start':
        case 'ssh_connection':
          setCurrentStage('ssh_tunnel');
          setProgress(50);
          break;
        case 'domain_setup':
          setCurrentStage('domain_setup');
          setProgress(65);
          break;
        case 'caddy_setup':
          setCurrentStage('caddy_setup');
          setProgress(80);
          break;
        case 'domain_check':
          setCurrentStage('domain_check');
          setProgress(95);
          break;
        case 'complete':
          if (event.type === 'tunnel_established' || event.type === 'setup_complete') {
            setCurrentStage('complete');
            setProgress(100);
            setWillOpenTab(true);
          }
          break;
        case 'error':
          setCurrentStage('error');
          setProgress(0);
          break;
      }
    } else {
      // Handle events without specific step
      if (event.type === 'setup_started') {
        setCurrentStage('ssh_tunnel');
        setProgress(10);
      } else if (event.type === 'setup_complete') {
        setCurrentStage('complete');
        setProgress(100);
        setWillOpenTab(true);
      } else if (event.type === 'setup_error' || event.type === 'tunnel_error') {
        setCurrentStage('error');
        setProgress(0);
      }
    }
  }, [addConsoleMessage]);

  // WebSocket connection for tunnel setup updates
  const { isConnected: wsConnected } = useTunnelSetupWebSocket({
    jobId,
    enabled: isOpen, // Keep connection open while modal is open
    onEvent: handleTunnelEvent,
    onConnect: () => {
      addConsoleMessage('🔗 Połączono z serwerem', 'info');
    },
    onDisconnect: () => {
      // Only show disconnection message if we didn't complete successfully or close intentionally
      if (isOpen && currentStage !== 'complete') {
        addConsoleMessage('📡 Połączenie WebSocket przerwane', 'warning');
      }
    },
    onError: (error) => {
      addConsoleMessage(`❌ Błąd połączenia: ${error}`, 'error');
    }
  });

  const startCodeServerSetup = useCallback(async () => {
    try {
      addConsoleMessage('🚀 Rozpoczynanie konfiguracji środowiska IDE...', 'info', 'preparing');
      
      // Call the old code-server endpoint which now has WebSocket integration
      const token = localStorage.getItem('access_token') || localStorage.getItem('auth_token');
      const response = await fetch(`/api/v1/jobs/${jobId}/code-server`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || `HTTP ${response.status}`);
      }
      
      const data = await response.json();
      setFinalUrl(data.url);
      
      if (currentStage !== 'error') {
        setCurrentStage('complete');
        setProgress(100);
        setWillOpenTab(true);
        // Note: Success message is already sent by backend via WebSocket
        
        // Open in new tab after a short delay
        setTimeout(() => {
          if (data.url && !tabOpenedRef.current) {
            addConsoleMessage(`🌐 Otwieranie ${data.url} w nowej karcie...`, 'info');
            window.open(data.url, '_blank');
            tabOpenedRef.current = true;
            setWillOpenTab(false);
            // Don't auto-close modal - let user close it manually to see logs
          }
        }, 2000);
      }
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      addConsoleMessage(`❌ Błąd podczas konfiguracji: ${errorMessage}`, 'error');
      setCurrentStage('error');
      setProgress(0);
    }
  }, [jobId, addConsoleMessage, currentStage, onClose]);

  // Auto-start the process when modal opens
  useEffect(() => {
    if (isOpen && !autoStarted) {
      setAutoStarted(true);
      setCurrentStage('preparing');
      setProgress(5);
      setConsoleMessages([]);
      tabOpenedRef.current = false;
      
      // Start the setup process
      setTimeout(() => {
        startCodeServerSetup();
      }, 1000);
      
    } else if (!isOpen) {
      // Reset when modal closes
      setAutoStarted(false);
      setCurrentStage('preparing');
      setProgress(0);
      setWillOpenTab(false);
      setConsoleMessages([]);
      setFinalUrl('');
      tabOpenedRef.current = false;
    }
  }, [isOpen, autoStarted]); // Removed startCodeServerSetup from dependencies to prevent infinite loop

  const getStageInfo = () => {
    switch (currentStage) {
      case 'preparing':
        return {
          icon: Server,
          title: 'Przygotowanie...',
          description: 'Inicjalizacja konfiguracji środowiska',
          color: 'text-blue-600 dark:text-blue-400',
          bgColor: 'from-blue-50/80 to-indigo-50/80 dark:from-blue-950/40 dark:to-indigo-950/40'
        };
      case 'ssh_tunnel':
        return {
          icon: Link,
          title: 'Tworzenie tunelu SSH...',
          description: 'Ustanawianie bezpiecznego połączenia',
          color: 'text-purple-600 dark:text-purple-400',
          bgColor: 'from-purple-50/80 to-pink-50/80 dark:from-purple-950/40 dark:to-pink-950/40'
        };
      case 'domain_setup':
        return {
          icon: Globe,
          title: 'Konfiguracja domeny...',
          description: 'Generowanie bezpiecznej domeny internetowej',
          color: 'text-teal-600 dark:text-teal-400',
          bgColor: 'from-teal-50/80 to-cyan-50/80 dark:from-teal-950/40 dark:to-cyan-950/40'
        };
      case 'caddy_setup':
        return {
          icon: Wrench,
          title: 'Konfiguracja proxy...',
          description: 'Ustawianie serwera proxy',
          color: 'text-orange-600 dark:text-orange-400',
          bgColor: 'from-orange-50/80 to-red-50/80 dark:from-orange-950/40 dark:to-red-950/40'
        };
      case 'domain_check':
        return {
          icon: Wifi,
          title: 'Sprawdzanie dostępności...',
          description: 'Weryfikacja konfiguracji domeny',
          color: 'text-indigo-600 dark:text-indigo-400',
          bgColor: 'from-indigo-50/80 to-purple-50/80 dark:from-indigo-950/40 dark:to-purple-950/40'
        };
      case 'complete':
        return {
          icon: CheckCircle2,
          title: 'Gotowe!',
          description: willOpenTab ? 
            'Otwieranie IDE w nowej karcie...' : 
            'Twoje środowisko IDE jest gotowe! Modal pozostanie otwarty żebyś mógł skopiować logi.',
          color: 'text-green-600 dark:text-green-400',
          bgColor: 'from-green-50/80 to-emerald-50/80 dark:from-green-950/40 dark:to-emerald-950/40'
        };
      case 'error':
        return {
          icon: AlertCircle,
          title: 'Błąd konfiguracji',
          description: 'Nie udało się skonfigurować środowiska',
          color: 'text-red-600 dark:text-red-400',
          bgColor: 'from-red-50/80 to-pink-50/80 dark:from-red-950/40 dark:to-pink-950/40'
        };
    }
  };

  const getConsoleMessageIcon = (type: string) => {
    switch (type) {
      case 'success': return '✅';
      case 'error': return '❌';
      case 'warning': return '⚠️';
      default: return '📟';
    }
  };

  const handleRetry = () => {
    setAutoStarted(false);
    setConsoleMessages([]);
    setCurrentStage('preparing');
    setProgress(0);
    tabOpenedRef.current = false;
    
    setTimeout(() => {
      startCodeServerSetup();
    }, 500);
  };

  const stageInfo = getStageInfo();
  const IconComponent = stageInfo.icon;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader className="relative">
          <DialogTitle className="flex items-center gap-2 text-xl text-slate-800 dark:text-slate-100">
            <Terminal className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            Uruchamianie IDE
          </DialogTitle>
          <p className="text-sm text-slate-600 dark:text-slate-400">{jobName}</p>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Main Status Display */}
          <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${stageInfo.bgColor} p-6 backdrop-blur-sm border border-slate-200/50 dark:border-slate-700/50 shadow-lg dark:shadow-2xl`}>
            <div className="relative z-10">
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentStage}
                  initial={{ opacity: 0, y: 20, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -20, scale: 0.9 }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                  className="text-center space-y-4"
                >
                  <div className={`inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-100/90 dark:bg-slate-800/90 ${stageInfo.color} shadow-lg dark:shadow-xl border border-slate-200/50 dark:border-slate-600/50 ${willOpenTab && currentStage === 'complete' ? 'animate-pulse' : ''}`}>
                    {(currentStage !== 'complete' && currentStage !== 'error') ? (
                      <Loader2 className="w-8 h-8 animate-spin" />
                    ) : (
                      <IconComponent className={`w-8 h-8 ${willOpenTab && currentStage === 'complete' ? 'animate-bounce' : ''}`} />
                    )}
                  </div>
                  
                  <div>
                    <h3 className={`text-lg font-semibold ${stageInfo.color} mb-1`}>
                      {stageInfo.title}
                    </h3>
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                      {stageInfo.description}
                    </p>
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>
            
            {/* Animated background particles */}
            <div className="absolute inset-0 overflow-hidden">
              <div className="absolute -top-4 -left-4 w-24 h-24 bg-white/10 dark:bg-slate-400/5 rounded-full animate-pulse" />
              <div className="absolute -bottom-4 -right-4 w-32 h-32 bg-white/5 dark:bg-slate-400/3 rounded-full animate-pulse" style={{ animationDelay: '1s' }} />
            </div>
          </div>

          {/* Progress Bar */}
          {currentStage !== 'error' && (
            <div className="space-y-3">
              <div className="flex justify-between text-sm text-slate-600 dark:text-slate-400">
                <span>Postęp</span>
                <span>{progress}%</span>
              </div>
              <Progress 
                value={progress} 
                className="h-3 bg-slate-100 dark:bg-slate-800 border dark:border-slate-700"
              />
            </div>
          )}

          {/* Real-time Console */}
          <div className="bg-slate-900 dark:bg-slate-950 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
              <Terminal className="h-4 w-4 text-slate-600 dark:text-slate-400" />
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Konsola</span>
              <div className={`ml-auto h-2 w-2 rounded-full ${wsConnected ? 'bg-green-500' : 'bg-red-500'}`} />
            </div>
            <div 
              ref={consoleRef}
              className="h-40 overflow-y-auto p-3 text-sm font-mono text-green-400 dark:text-green-300 bg-slate-900 dark:bg-slate-950 space-y-1"
            >
              {consoleMessages.map((msg) => (
                <div key={msg.id} className="flex items-start gap-2">
                  <span className="text-slate-500 dark:text-slate-400 text-xs">
                    {msg.timestamp.toLocaleTimeString()}
                  </span>
                  <span className="text-xs">{getConsoleMessageIcon(msg.type)}</span>
                  <span className={`flex-1 ${
                    msg.type === 'error' ? 'text-red-400' :
                    msg.type === 'warning' ? 'text-yellow-400' :
                    msg.type === 'success' ? 'text-green-400' :
                    'text-slate-300 dark:text-slate-200'
                  }`}>
                    {msg.message}
                  </span>
                </div>
              ))}
              {consoleMessages.length === 0 && (
                <div className="text-slate-500 dark:text-slate-400 text-center py-8">
                  Oczekiwanie na rozpoczęcie...
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end">
            {currentStage === 'error' ? (
              <div className="flex gap-2">
                <Button variant="outline" onClick={onClose}>
                  Zamknij
                </Button>
                <Button onClick={handleRetry} className="bg-blue-600 hover:bg-blue-700">
                  Spróbuj ponownie
                </Button>
              </div>
            ) : currentStage === 'complete' ? (
              <div className="flex gap-2">
                <Button variant="outline" onClick={onClose}>
                  Zamknij i wyczyść logi
                </Button>
                <Button 
                  onClick={() => finalUrl && window.open(finalUrl, '_blank')} 
                  className="bg-green-600 hover:bg-green-700"
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Otwórz IDE ponownie
                </Button>
              </div>
            ) : (
              <Button variant="outline" onClick={onClose}>
                Anuluj
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
