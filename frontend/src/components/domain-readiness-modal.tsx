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
  Sparkles
} from 'lucide-react';
import { useDomainStatus } from '@/hooks/useDomainStatus';
// import { toast } from 'sonner';

interface DomainReadinessModalProps {
  jobId: number;
  jobName: string;
  isOpen: boolean;
  onClose: () => void;
  onUrlReady?: (url: string) => void;
}

type ProcessStage = 'preparing' | 'created' | 'ready' | 'error';

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
  const tabOpenedRef = useRef(false); // Use ref instead of state to avoid closure issues
  const [debugInfo, setDebugInfo] = useState<{
    lastAttemptedUrl?: string;
    lastErrorDetails?: any;
    requestTime?: Date;
    responseStatus?: number;
    responseHeaders?: any;
  }>({});

  // Stable onReady callback to prevent hook re-creation
  const handleReady = useCallback((status: any) => {
    console.log('🚀 MODAL onReady called, tabOpened:', tabOpenedRef.current, 'url:', status.url);
    console.log('🚀 MODAL onReady stack trace:', new Error().stack);
    if (!tabOpenedRef.current && status.url) { // Only if tab hasn't been opened yet
      setCurrentStage('ready');
      setProgress(100);
      setWillOpenTab(true);
      tabOpenedRef.current = true; // Mark as opened to prevent duplicates
      // Opóźniamy otwarcie nowej karty, żeby pozwolić animacji się dokończyć
      setTimeout(() => {
        console.log('🔥 MODAL Opening new tab for:', status.url);
        window.open(status.url, '_blank');
        setWillOpenTab(false);
        // Auto-close modal after successful tab opening
        setTimeout(() => {
          console.log('🔒 MODAL Auto-closing after successful tab opening');
          onClose();
        }, 1000); // Close after 1 second
      }, 2000); // 2 sekundy opóźnienia
    } else {
      console.log('🚫 MODAL Tab opening skipped - already opened or no URL');
    }
  }, [onClose]); // Include onClose in dependencies

  const {
    status,
    isLoading,
    error,
    isPolling,
    isSettingUp, // NEW: Add setup state
    pollingStartTime,
    startPolling,
    stopPolling,
    setupDomain,
    isDomainReady,
    domainUrl,
    domain,
    lastAttemptedUrl,
    lastErrorDetails
  } = useDomainStatus(jobId, {
    enabled: isOpen,
    pollingInterval: 2000, // 2 seconds for faster feedback
    maxPollingTime: 300000, // 5 minutes
    onReady: handleReady, // Use stable callback
    onError: (error: string) => {
      setCurrentStage('error');
      setProgress(0);
      // Update debug info when error occurs
      setDebugInfo({
        lastAttemptedUrl: lastAttemptedUrl || undefined,
        lastErrorDetails,
        requestTime: new Date()
      });
    }
  });

    // Auto-start the process when modal opens
  useEffect(() => {
    console.log('Modal effect triggered:', { isOpen, autoStarted, jobId, tabOpened: tabOpenedRef.current });
    if (isOpen && !autoStarted) {
      console.log('Starting modal auto-start for job:', jobId);
      setAutoStarted(true);
      setCurrentStage('preparing');
      setProgress(10);
      handleAutoStart();
    } else if (!isOpen) {
      console.log('Modal closed, resetting for job:', jobId);
      // Reset when modal closes
      setAutoStarted(false);
      setCurrentStage('preparing');
      setProgress(0);
      setWillOpenTab(false);
      tabOpenedRef.current = false; // Reset tab opened state
      // Clear sessionStorage when modal closes to allow future runs
      if (jobId) {
        sessionStorage.removeItem(`onReadyCalled_${jobId}`);
        console.log('🧹 Cleared sessionStorage for job:', jobId);
      }
    }
  }, [isOpen, autoStarted]); // Remove jobId from dependencies to prevent re-runs

  // Watch for status changes to update progress
  useEffect(() => {
    console.log('Status effect triggered:', { status, isDomainReady, currentStage, tabOpened: tabOpenedRef.current });
    if (status) {
      if (status.domain_ready && status.url) {
        console.log('Domain ready detected in status effect, tab opened:', tabOpenedRef.current);
        // Only update UI state, don't open tabs here - let onReady handle that
        setCurrentStage('ready');
        setProgress(100);
      } else if (isDomainReady) {
        setCurrentStage('ready');
        setProgress(100);
      }
    }
  }, [status, isDomainReady]);

  // Watch for errors from the hook
  useEffect(() => {
    if (error) {
      setCurrentStage('error');
      setProgress(0);
      // Update debug info when error occurs
      setDebugInfo({
        lastAttemptedUrl: lastAttemptedUrl || undefined,
        lastErrorDetails,
        requestTime: new Date()
      });
    }
  }, [error]); // Only depend on error, not on other states

  const handleAutoStart = async () => {
    try {
      console.log('handleAutoStart called with status:', status);
      
      // First check if domain is already ready
      if (status && status.domain_ready && status.url) {
        console.log('Domain already ready, tabOpened:', tabOpenedRef.current, 'url:', status.url);
        // Only update UI state, don't open tabs here - let onReady handle that
        setCurrentStage('ready');
        setProgress(100);
        return; // WAŻNE: Wyjdź tutaj, nie rób setup ani polling!
      }
      
      // Only setup domain if it's not ready yet
      console.log('Domain not ready, starting setup process');
      
      // Stage 1: Setup domain
      setCurrentStage('preparing');
      setProgress(20);
      
      await setupDomain();
      
      // Stage 2: Domain created, start monitoring
      setCurrentStage('created');
      setProgress(40);
      
      setTimeout(async () => {
        await startPolling();
        setProgress(60);
      }, 1500);
      
    } catch (error) {
      console.error('Failed to setup domain:', error);
      setCurrentStage('error');
      setProgress(0);
    }
  };

  const getStageInfo = () => {
    switch (currentStage) {
      case 'preparing':
        return {
          icon: Server,
          title: 'Preparing your domain...',
          description: 'Setting up secure web access for your workspace',
          color: 'text-blue-600 dark:text-blue-400',
          bgColor: 'from-blue-50/80 to-indigo-50/80 dark:from-blue-950/40 dark:to-indigo-950/40'
        };
      case 'created':
        return {
          icon: Globe,
          title: 'Domain created successfully',
          description: 'Waiting for SSL certificate and final setup',
          color: 'text-purple-600 dark:text-purple-400',
          bgColor: 'from-purple-50/80 to-pink-50/80 dark:from-purple-950/40 dark:to-pink-950/40'
        };
      case 'ready':
        return {
          icon: CheckCircle2,
          title: 'Domain is ready!',
          description: willOpenTab ? 
            'Opening in new tab in 2 seconds...' : 
            'Your workspace is accessible. You can open it again anytime.',
          color: 'text-green-600 dark:text-green-400',
          bgColor: 'from-green-50/80 to-emerald-50/80 dark:from-green-950/40 dark:to-emerald-950/40'
        };
      case 'error':
        return {
          icon: AlertCircle,
          title: 'Setup failed',
          description: 'Unable to prepare your domain. Please try again.',
          color: 'text-red-600 dark:text-red-400',
          bgColor: 'from-red-50/80 to-pink-50/80 dark:from-red-950/40 dark:to-pink-950/40'
        };
    }
  };

  const stageInfo = getStageInfo();
  const IconComponent = stageInfo.icon;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
              <DialogContent className="sm:max-w-md">
          <DialogDescription className="sr-only">
            Modal showing domain setup progress for container IDE access
          </DialogDescription>
        <DialogHeader className="relative">
          <DialogTitle className="flex items-center gap-2 text-xl text-slate-800 dark:text-slate-100">
            <Globe className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            Domain Setup
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
                    {(currentStage === 'preparing' || currentStage === 'created') ? (
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
                This usually takes 30-60 seconds
              </p>
            </div>
          )}

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
                    <span className="text-sm text-blue-600 dark:text-blue-400 truncate max-w-[200px]">
                      {domainUrl}
                    </span>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* Error Display */}
          {error && currentStage === 'error' && (
            <div className="space-y-3">
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <div className="space-y-2">
                    <div className="font-medium">Setup failed</div>
                    <div className="text-sm">
                      Unable to prepare your domain. Please try again.
                    </div>
                    {lastAttemptedUrl && (
                      <div className="text-xs text-slate-600 dark:text-slate-300 font-mono bg-slate-100 dark:bg-slate-800 p-2 rounded">
                        URL: {lastAttemptedUrl}
                      </div>
                    )}
                    <div className="text-xs text-red-600 dark:text-red-400">
                      {error}
                    </div>
                  </div>
                </AlertDescription>
              </Alert>
              
              {/* Debug Button and Info */}
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
              
              {showDebugInfo && (lastErrorDetails || lastAttemptedUrl || true) && (
                <div className="bg-slate-100 dark:bg-slate-800 p-4 rounded-lg text-xs font-mono space-y-2 max-h-60 overflow-y-auto">
                  <div className="font-semibold text-slate-700 dark:text-slate-300">Debug Information:</div>
                  
                  {/* NEW: Tab opening state */}
                  <div>
                    <span className="text-orange-600 dark:text-orange-400">Tab State:</span>
                    <div className="text-slate-600 dark:text-slate-300">
                      Opened: {tabOpenedRef.current ? 'YES' : 'NO'}, Will Open: {willOpenTab ? 'YES' : 'NO'}, Stage: {currentStage}
                    </div>
                  </div>
                  
                  <div>
                    <span className="text-cyan-600 dark:text-cyan-400">Hook State:</span>
                    <div className="text-slate-600 dark:text-slate-300">
                      Loading: {isLoading ? 'YES' : 'NO'}, Setting Up: {isSettingUp ? 'YES' : 'NO'}, Polling: {isPolling ? 'YES' : 'NO'}
                    </div>
                  </div>
                  
                  {lastAttemptedUrl && (
                    <div>
                      <span className="text-blue-600 dark:text-blue-400">Last URL:</span>
                      <div className="text-slate-600 dark:text-slate-300 break-all">{lastAttemptedUrl}</div>
                    </div>
                  )}
                  
                  {lastErrorDetails && (
                    <div>
                      <span className="text-red-600 dark:text-red-400">Error Details:</span>
                      <pre className="text-slate-600 dark:text-slate-300 whitespace-pre-wrap break-all">
                        {JSON.stringify(lastErrorDetails, null, 2)}
                      </pre>
                    </div>
                  )}
                  
                  <div>
                    <span className="text-green-600 dark:text-green-400">Job Info:</span>
                    <div className="text-slate-600 dark:text-slate-300">
                      ID: {jobId}, Name: {jobName}
                    </div>
                  </div>
                  
                  {status && (
                    <div>
                      <span className="text-purple-600 dark:text-purple-400">Status:</span>
                      <pre className="text-slate-600 dark:text-slate-300 whitespace-pre-wrap">
                        {JSON.stringify(status, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Action Button */}
          <div className="flex justify-end">
            {currentStage === 'error' ? (
              <div className="flex gap-2">
                <Button variant="outline" onClick={onClose} className="border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">
                  Close
                </Button>
                <Button onClick={handleAutoStart} className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white shadow-lg">
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
                  Open in New Tab
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
