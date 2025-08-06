"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ExternalLink, 
  Loader2, 
  CheckCircle2, 
  AlertCircle, 
  Clock,
  Globe,
  Zap,
  Server,
  Sparkles,
  Terminal,
  Wifi,
  Link
} from 'lucide-react';
import { useDomainStatus } from '@/hooks/useDomainStatus';
import { useTunnelSetupWebSocket, TunnelSetupEvent } from '@/hooks/useTunnelSetupWebSocket';

interface DomainReadinessModalProps {
  jobId: number;
  jobName: string;
  isOpen: boolean;
  onClose: () => void;
  onUrlReady?: (url: string) => void;
}

type ProcessStage = 'preparing' | 'connecting' | 'ssh_preflight' | 'ssh_tunnel' | 'socat_forwarder' | 'connectivity_test' | 'domain_setup' | 'domain_check' | 'ready' | 'error';

interface ConsoleMessage {
  id: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  timestamp: Date;
  step?: string;
  details?: any;
}

export function DomainReadinessModal({
  jobId,
  jobName,
  isOpen,
  onClose,
  onUrlReady
}: DomainReadinessModalProps) {
  const [currentStage, setCurrentStage] = useState<ProcessStage>('preparing');
  const [progress, setProgress] = useState(0);
  const [autoStarted, setAutoStarted] = useState(false);
  const [showDebugInfo, setShowDebugInfo] = useState(false);
  const [willOpenTab, setWillOpenTab] = useState(false);
  const [consoleMessages, setConsoleMessages] = useState<ConsoleMessage[]>([]);
  const [tunnelEstablished, setTunnelEstablished] = useState(false);
  const tabOpenedRef = useRef(false);
  const consoleRef = useRef<HTMLDivElement>(null);

  // Auto-scroll console to bottom
  useEffect(() => {
    if (consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }
  }, [consoleMessages]);

  const addConsoleMessage = useCallback((message: string, type: 'info' | 'success' | 'warning' | 'error', step?: string, details?: any) => {
    const newMessage: ConsoleMessage = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      message,
      type,
      timestamp: new Date(),
      step,
      details
    };
    
    setConsoleMessages(prev => [...prev, newMessage]);
  }, []);

  // Handle tunnel setup WebSocket events
  const handleTunnelEvent = useCallback((event: TunnelSetupEvent) => {
    console.log('Received tunnel event:', event);
    
    const messageType = event.type === 'tunnel_error' ? 'error' : 
                       event.type === 'tunnel_warning' ? 'warning' :
                       event.type === 'tunnel_established' ? 'success' : 'info';
    
    addConsoleMessage(event.message, messageType, event.step, event.details);
    
    // Update progress and stage based on event
    switch (event.step) {
      case 'connecting':
        setCurrentStage('connecting');
        setProgress(10);
        break;
      case 'ssh_preflight':
        setCurrentStage('ssh_preflight');
        setProgress(20);
        break;
      case 'ssh_tunnel':
        setCurrentStage('ssh_tunnel');
        setProgress(40);
        break;
      case 'socat_forwarder':
        setCurrentStage('socat_forwarder');
        setProgress(60);
        break;
      case 'connectivity_test':
        setCurrentStage('connectivity_test');
        setProgress(75);
        break;
      case 'complete':
        if (event.type === 'tunnel_established') {
          setTunnelEstablished(true);
          setCurrentStage('domain_setup');
          setProgress(80);
          // Now start domain setup
          setTimeout(() => {
            startDomainSetup();
          }, 1000);
        }
        break;
      case 'error':
        setCurrentStage('error');
        setProgress(0);
        break;
    }
  }, [addConsoleMessage]);

  // WebSocket connection for tunnel setup
  const { isConnected: wsConnected } = useTunnelSetupWebSocket({
    jobId,
    enabled: isOpen && !tunnelEstablished,
    onEvent: handleTunnelEvent,
    onConnect: () => {
      console.log('Tunnel setup WebSocket connected');
      addConsoleMessage('🔗 Connected to tunnel setup stream', 'info');
    },
    onDisconnect: () => {
      console.log('Tunnel setup WebSocket disconnected');
      if (isOpen) {
        addConsoleMessage('📡 Connection lost, retrying...', 'warning');
      }
    },
    onError: (error) => {
      console.error('Tunnel setup WebSocket error:', error);
      addConsoleMessage(`❌ WebSocket error: ${error}`, 'error');
    }
  });

  // Domain status hook (used after tunnel is established)
  const {
    status,
    isLoading,
    error,
    isPolling,
    isSettingUp,
    setupDomain,
    isDomainReady,
    domainUrl,
    domain,
    lastAttemptedUrl,
    lastErrorDetails
  } = useDomainStatus(jobId, {
    enabled: tunnelEstablished && isOpen,
    pollingInterval: 2000,
    maxPollingTime: 300000,
    onReady: (status: any) => {
      if (!tabOpenedRef.current && status.url) {
        setCurrentStage('ready');
        setProgress(100);
        setWillOpenTab(true);
        tabOpenedRef.current = true;
        addConsoleMessage('🎉 Domain is ready! Opening in new tab...', 'success');
        
        setTimeout(() => {
          window.open(status.url, '_blank');
          setWillOpenTab(false);
          setTimeout(() => {
            onClose();
          }, 1000);
        }, 2000);
      }
    },
    onError: (error: string) => {
      setCurrentStage('error');
      setProgress(0);
      addConsoleMessage(`❌ Domain setup failed: ${error}`, 'error');
    }
  });

  const startTunnelSetup = useCallback(async () => {
    try {
      addConsoleMessage('🔧 Initiating tunnel setup...', 'info', 'preparing');
      
      // Call the backend endpoint to create/start tunnel
      const token = localStorage.getItem('access_token') || localStorage.getItem('auth_token');
      const response = await fetch(`/api/v1/jobs/${jobId}/tunnels`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || `HTTP ${response.status}`);
      }
      
      const tunnelData = await response.json();
      addConsoleMessage('✅ Tunnel setup request sent successfully!', 'success', 'preparing');
      console.log('Tunnel setup initiated:', tunnelData);
      
      // The WebSocket events will now start coming in from the backend
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      addConsoleMessage(`❌ Failed to start tunnel setup: ${errorMessage}`, 'error');
      setCurrentStage('error');
      setProgress(0);
    }
  }, [jobId, addConsoleMessage]);

  const startDomainSetup = useCallback(async () => {
    try {
      addConsoleMessage('🌐 Setting up domain registration...', 'info', 'domain_setup');
      setCurrentStage('domain_setup');
      setProgress(85);
      
      await setupDomain();
      
      addConsoleMessage('✅ Domain setup initiated, checking availability...', 'success', 'domain_check');
      setCurrentStage('domain_check');
      setProgress(90);
      
    } catch (error) {
      addConsoleMessage(`❌ Domain setup failed: ${error}`, 'error');
      setCurrentStage('error');
      setProgress(0);
    }
  }, [setupDomain, addConsoleMessage]);

  // Auto-start the process when modal opens
  useEffect(() => {
    if (isOpen && !autoStarted) {
      setAutoStarted(true);
      setCurrentStage('preparing');
      setProgress(5);
      setConsoleMessages([]);
      setTunnelEstablished(false);
      addConsoleMessage('🚀 Starting tunnel setup process...', 'info', 'preparing');
      
      // Start the tunnel setup process
      setTimeout(() => {
        startTunnelSetup();
      }, 1000); // Small delay to let WebSocket connect
      
    } else if (!isOpen) {
      // Reset when modal closes
      setAutoStarted(false);
      setCurrentStage('preparing');
      setProgress(0);
      setWillOpenTab(false);
      setConsoleMessages([]);
      setTunnelEstablished(false);
      tabOpenedRef.current = false;
      if (jobId) {
        sessionStorage.removeItem(`onReadyCalled_${jobId}`);
      }
    }
  }, [isOpen, autoStarted, addConsoleMessage, jobId, startTunnelSetup]);

  // Watch for domain status changes
  useEffect(() => {
    if (tunnelEstablished && status) {
      if (status.domain_ready && status.url) {
        setCurrentStage('ready');
        setProgress(100);
      }
    }
  }, [status, tunnelEstablished]);

  const getStageInfo = () => {
    switch (currentStage) {
      case 'preparing':
        return {
          icon: Server,
          title: 'Initializing setup...',
          description: 'Preparing tunnel and domain configuration',
          color: 'text-blue-600 dark:text-blue-400',
          bgColor: 'from-blue-50/80 to-indigo-50/80 dark:from-blue-950/40 dark:to-indigo-950/40'
        };
      case 'connecting':
        return {
          icon: Wifi,
          title: 'Starting tunnel connection...',
          description: 'Establishing secure connection to compute node',
          color: 'text-cyan-600 dark:text-cyan-400',
          bgColor: 'from-cyan-50/80 to-blue-50/80 dark:from-cyan-950/40 dark:to-blue-950/40'
        };
      case 'ssh_preflight':
        return {
          icon: Terminal,
          title: 'SSH Pre-flight checks...',
          description: 'Verifying SSH configuration and keys',
          color: 'text-orange-600 dark:text-orange-400',
          bgColor: 'from-orange-50/80 to-red-50/80 dark:from-orange-950/40 dark:to-red-950/40'
        };
      case 'ssh_tunnel':
        return {
          icon: Link,
          title: 'Creating SSH tunnel...',
          description: 'Establishing secure SSH connection',
          color: 'text-purple-600 dark:text-purple-400',
          bgColor: 'from-purple-50/80 to-pink-50/80 dark:from-purple-950/40 dark:to-pink-950/40'
        };
      case 'socat_forwarder':
        return {
          icon: Zap,
          title: 'Setting up port forwarder...',
          description: 'Creating network bridge for web access',
          color: 'text-yellow-600 dark:text-yellow-400',
          bgColor: 'from-yellow-50/80 to-orange-50/80 dark:from-yellow-950/40 dark:to-orange-950/40'
        };
      case 'connectivity_test':
        return {
          icon: Wifi,
          title: 'Testing connectivity...',
          description: 'Verifying tunnel functionality',
          color: 'text-indigo-600 dark:text-indigo-400',
          bgColor: 'from-indigo-50/80 to-purple-50/80 dark:from-indigo-950/40 dark:to-purple-950/40'
        };
      case 'domain_setup':
        return {
          icon: Globe,
          title: 'Setting up domain...',
          description: 'Registering secure web domain',
          color: 'text-teal-600 dark:text-teal-400',
          bgColor: 'from-teal-50/80 to-cyan-50/80 dark:from-teal-950/40 dark:to-cyan-950/40'
        };
      case 'domain_check':
        return {
          icon: Clock,
          title: 'Verifying domain...',
          description: 'Checking SSL certificate and accessibility',
          color: 'text-emerald-600 dark:text-emerald-400',
          bgColor: 'from-emerald-50/80 to-green-50/80 dark:from-emerald-950/40 dark:to-green-950/40'
        };
      case 'ready':
        return {
          icon: CheckCircle2,
          title: 'Setup complete!',
          description: willOpenTab ? 
            'Opening workspace in new tab in 2 seconds...' : 
            'Your workspace is ready and accessible',
          color: 'text-green-600 dark:text-green-400',
          bgColor: 'from-green-50/80 to-emerald-50/80 dark:from-green-950/40 dark:to-emerald-950/40'
        };
      case 'error':
        return {
          icon: AlertCircle,
          title: 'Setup failed',
          description: 'Unable to complete setup. Check console for details.',
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
    setTunnelEstablished(false);
    setConsoleMessages([]);
    setCurrentStage('preparing');
    setProgress(0);
    tabOpenedRef.current = false;
    
    // Clear console and start fresh
    addConsoleMessage('🔄 Retrying tunnel setup...', 'info', 'preparing');
    
    // Restart the process
    setTimeout(() => {
      startTunnelSetup();
    }, 500);
  };

  const stageInfo = getStageInfo();
  const IconComponent = stageInfo.icon;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl">
        <DialogDescription className="sr-only">
          Modal showing real-time tunnel and domain setup progress for container IDE access
        </DialogDescription>
        <DialogHeader className="relative">
          <DialogTitle className="flex items-center gap-2 text-xl text-slate-800 dark:text-slate-100">
            <Globe className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            Tunnel & Domain Setup
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
                  <div className={`inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-100/90 dark:bg-slate-800/90 ${stageInfo.color} shadow-lg dark:shadow-xl border border-slate-200/50 dark:border-slate-600/50 ${willOpenTab && currentStage === 'ready' ? 'animate-pulse' : ''}`}>
                    {(currentStage !== 'ready' && currentStage !== 'error') ? (
                      <Loader2 className="w-8 h-8 animate-spin" />
                    ) : (
                      <IconComponent className={`w-8 h-8 ${willOpenTab && currentStage === 'ready' ? 'animate-bounce' : ''}`} />
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
                <span>Progress</span>
                <span>{progress}%</span>
              </div>
              <Progress 
                value={progress} 
                className="h-3 bg-slate-100 dark:bg-slate-800 border dark:border-slate-700"
              />
              <p className="text-xs text-center text-slate-500 dark:text-slate-400">
                This process includes tunnel setup and domain registration
              </p>
            </div>
          )}

          {/* Real-time Console */}
          <div className="bg-slate-900 dark:bg-slate-950 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
              <Terminal className="h-4 w-4 text-slate-600 dark:text-slate-400" />
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Setup Console</span>
              <div className={`ml-auto h-2 w-2 rounded-full ${wsConnected ? 'bg-green-500' : 'bg-red-500'}`} />
            </div>
            <div 
              ref={consoleRef}
              className="h-48 overflow-y-auto p-3 text-sm font-mono text-green-400 dark:text-green-300 bg-slate-900 dark:bg-slate-950 space-y-1"
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
                  Waiting for setup to begin...
                </div>
              )}
            </div>
          </div>

          {/* Domain Info */}
          {domain && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="bg-slate-50/80 dark:bg-slate-800/80 backdrop-blur-sm rounded-xl p-4 border border-slate-200/50 dark:border-slate-700/50 shadow-sm dark:shadow-lg"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Domain:</span>
                  <span className="text-sm font-mono text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-700 px-2 py-1 rounded border dark:border-slate-600">
                    {domain}
                  </span>
                </div>
                {domainUrl && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">URL:</span>
                    <span className="text-sm text-blue-600 dark:text-blue-400 truncate max-w-[300px]">
                      {domainUrl}
                    </span>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* Debug Info Toggle */}
          {(currentStage === 'error' || showDebugInfo) && (
            <div className="space-y-3">
              <div className="flex justify-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowDebugInfo(!showDebugInfo)}
                  className="text-xs px-3 py-1"
                >
                  {showDebugInfo ? "Hide Debug Info" : "Show Debug Info"}
                </Button>
              </div>
              
              {showDebugInfo && (
                <div className="bg-slate-100 dark:bg-slate-800 p-4 rounded-lg text-xs font-mono space-y-2 max-h-60 overflow-y-auto">
                  <div className="font-semibold text-slate-700 dark:text-slate-300">Debug Information:</div>
                  
                  <div>
                    <span className="text-blue-600 dark:text-blue-400">WebSocket:</span>
                    <div className="text-slate-600 dark:text-slate-300">
                      Connected: {wsConnected ? 'YES' : 'NO'}, Tunnel Established: {tunnelEstablished ? 'YES' : 'NO'}
                    </div>
                  </div>
                  
                  <div>
                    <span className="text-purple-600 dark:text-purple-400">Stage:</span>
                    <div className="text-slate-600 dark:text-slate-300">
                      Current: {currentStage}, Progress: {progress}%
                    </div>
                  </div>
                  
                  <div>
                    <span className="text-green-600 dark:text-green-400">Job Info:</span>
                    <div className="text-slate-600 dark:text-slate-300">
                      ID: {jobId}, Name: {jobName}
                    </div>
                  </div>
                  
                  {lastAttemptedUrl && (
                    <div>
                      <span className="text-cyan-600 dark:text-cyan-400">Last URL:</span>
                      <div className="text-slate-600 dark:text-slate-300 break-all">{lastAttemptedUrl}</div>
                    </div>
                  )}
                  
                  {(error || lastErrorDetails) && (
                    <div>
                      <span className="text-red-600 dark:text-red-400">Error Details:</span>
                      <pre className="text-slate-600 dark:text-slate-300 whitespace-pre-wrap break-all">
                        {error || JSON.stringify(lastErrorDetails, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end">
            {currentStage === 'error' ? (
              <div className="flex gap-2">
                <Button variant="outline" onClick={onClose} className="border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">
                  Close
                </Button>
                <Button onClick={handleRetry} className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white shadow-lg">
                  Try Again
                </Button>
              </div>
            ) : currentStage === 'ready' ? (
              <div className="flex gap-2">
                <Button variant="outline" onClick={onClose} className="border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">
                  Close
                </Button>
                <Button 
                  onClick={() => domainUrl && window.open(domainUrl, '_blank')} 
                  className="bg-green-600 hover:bg-green-700 dark:bg-green-500 dark:hover:bg-green-600 text-white shadow-lg"
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Open Workspace
                </Button>
              </div>
            ) : (
              <Button variant="outline" onClick={onClose} className="border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">
                Cancel
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
