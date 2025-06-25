"use client";

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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
import { toast } from 'sonner';

interface DomainReadinessModalProps {
  jobId: number;
  jobName: string;
  isOpen: boolean;
  onClose: () => void;
  onUrlReady?: (url: string) => void;
}

type ProcessStage = 'preparing' | 'created' | 'ready' | 'opening' | 'complete' | 'error';

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

  const {
    status,
    isLoading,
    error,
    isPolling,
    pollingStartTime,
    startPolling,
    stopPolling,
    setupDomain,
    isDomainReady,
    domainUrl,
    domain
  } = useDomainStatus(jobId, {
    enabled: isOpen,
    pollingInterval: 2000, // 2 seconds for faster feedback
    maxPollingTime: 300000, // 5 minutes
    onReady: (status) => {
      setCurrentStage('ready');
      setProgress(90);
      setTimeout(() => {
        setCurrentStage('opening');
        setProgress(95);
        setTimeout(() => {
          window.open(status.url!, '_blank');
          onUrlReady?.(status.url!);
          setCurrentStage('complete');
          setProgress(100);
          setTimeout(() => {
            onClose();
          }, 2000);
        }, 1000);
      }, 1000);
    },
    onError: (error) => {
      setCurrentStage('error');
      setProgress(0);
    }
  });

  // Auto-start the process when modal opens
  useEffect(() => {
    if (isOpen && !autoStarted) {
      setAutoStarted(true);
      setCurrentStage('preparing');
      setProgress(10);
      handleAutoStart();
    } else if (!isOpen) {
      // Reset when modal closes
      setAutoStarted(false);
      setCurrentStage('preparing');
      setProgress(0);
      stopPolling();
    }
  }, [isOpen, autoStarted]);

  const handleAutoStart = async () => {
    try {
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
          color: 'text-blue-600',
          bgColor: 'from-blue-50 to-indigo-50'
        };
      case 'created':
        return {
          icon: Globe,
          title: 'Domain created successfully',
          description: 'Waiting for SSL certificate and final setup',
          color: 'text-purple-600',
          bgColor: 'from-purple-50 to-pink-50'
        };
      case 'ready':
        return {
          icon: CheckCircle2,
          title: 'Domain is ready!',
          description: 'Your workspace is now accessible via secure HTTPS',
          color: 'text-green-600',
          bgColor: 'from-green-50 to-emerald-50'
        };
      case 'opening':
        return {
          icon: ExternalLink,
          title: 'Opening in new tab...',
          description: 'Launching your development environment',
          color: 'text-emerald-600',
          bgColor: 'from-emerald-50 to-teal-50'
        };
      case 'complete':
        return {
          icon: Sparkles,
          title: 'Complete!',
          description: 'Your workspace is now open and ready to use',
          color: 'text-emerald-600',
          bgColor: 'from-emerald-50 to-green-50'
        };
      case 'error':
        return {
          icon: AlertCircle,
          title: 'Setup failed',
          description: 'Unable to prepare your domain. Please try again.',
          color: 'text-red-600',
          bgColor: 'from-red-50 to-pink-50'
        };
    }
  };

  const stageInfo = getStageInfo();
  const IconComponent = stageInfo.icon;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px] overflow-hidden">
        <DialogHeader className="relative">
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Globe className="h-6 w-6 text-blue-600" />
            Domain Setup
          </DialogTitle>
          <p className="text-sm text-muted-foreground">{jobName}</p>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Main Status Display */}
          <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${stageInfo.bgColor} p-6 backdrop-blur-sm border border-white/20`}>
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
                  <div className={`inline-flex items-center justify-center w-16 h-16 rounded-full bg-white/80 ${stageInfo.color} shadow-lg`}>
                    {(currentStage === 'preparing' || currentStage === 'created') ? (
                      <Loader2 className="w-8 h-8 animate-spin" />
                    ) : (
                      <IconComponent className="w-8 h-8" />
                    )}
                  </div>
                  
                  <div>
                    <h3 className={`text-lg font-semibold ${stageInfo.color} mb-1`}>
                      {stageInfo.title}
                    </h3>
                    <p className="text-sm text-slate-600">
                      {stageInfo.description}
                    </p>
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>
            
            {/* Animated background particles */}
            <div className="absolute inset-0 overflow-hidden">
              <div className="absolute -top-4 -left-4 w-24 h-24 bg-white/10 rounded-full animate-pulse" />
              <div className="absolute -bottom-4 -right-4 w-32 h-32 bg-white/5 rounded-full animate-pulse" style={{ animationDelay: '1s' }} />
            </div>
          </div>

          {/* Progress Bar */}
          {currentStage !== 'error' && (
            <div className="space-y-3">
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Progress</span>
                <span>{progress}%</span>
              </div>
              <Progress 
                value={progress} 
                className="h-3 bg-slate-100"
              />
              <p className="text-xs text-center text-muted-foreground">
                This usually takes 30-60 seconds
              </p>
            </div>
          )}

          {/* Domain Info */}
          {domain && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="bg-slate-50/80 backdrop-blur-sm rounded-xl p-4 border border-slate-200/50"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-700">Domain:</span>
                  <span className="text-sm font-mono text-slate-900 bg-white px-2 py-1 rounded">
                    {domain}
                  </span>
                </div>
                {domainUrl && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-700">URL:</span>
                    <span className="text-sm text-blue-600 truncate max-w-[200px]">
                      {domainUrl}
                    </span>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* Error Display */}
          {error && currentStage === 'error' && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {error}
              </AlertDescription>
            </Alert>
          )}

          {/* Action Button */}
          <div className="flex justify-end">
            {currentStage === 'error' ? (
              <div className="flex gap-2">
                <Button variant="outline" onClick={onClose}>
                  Close
                </Button>
                <Button onClick={handleAutoStart} className="bg-blue-600 hover:bg-blue-700">
                  Try Again
                </Button>
              </div>
            ) : currentStage === 'complete' ? (
              <Button onClick={onClose} className="bg-green-600 hover:bg-green-700">
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Done
              </Button>
            ) : (
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
