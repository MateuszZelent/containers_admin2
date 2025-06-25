"use client";

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
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
  Zap
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

export function DomainReadinessModal({
  jobId,
  jobName,
  isOpen,
  onClose,
  onUrlReady
}: DomainReadinessModalProps) {
  const [shouldOpenUrl, setShouldOpenUrl] = useState(false);

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
    pollingInterval: 3000, // 3 seconds
    maxPollingTime: 300000, // 5 minutes
    onReady: (status) => {
      toast.success(`Domain ${status.domain} is now ready!`);
      setShouldOpenUrl(true);
      onUrlReady?.(status.url!);
    },
    onError: (error) => {
      toast.error(`Domain check failed: ${error}`);
    }
  });

  const handleStartMonitoring = async () => {
    setShouldOpenUrl(false);
    
    try {
      // First setup the domain by calling /code-server endpoint
      await setupDomain();
      
      // Then start polling to check when it's ready
      await startPolling();
    } catch (error) {
      console.error('Failed to setup domain:', error);
      // Even if setup fails, try to start polling in case domain already exists
      await startPolling();
    }
  };

  const handleOpenUrl = () => {
    if (domainUrl) {
      window.open(domainUrl, '_blank');
      onClose();
    }
  };

  const handleClose = () => {
    stopPolling();
    onClose();
  };

  const getElapsedTime = () => {
    if (!pollingStartTime) return 0;
    return Math.floor((Date.now() - pollingStartTime) / 1000);
  };

  const getProgress = () => {
    if (!pollingStartTime) return 0;
    const elapsed = Date.now() - pollingStartTime;
    const maxTime = 300000; // 5 minutes
    return Math.min((elapsed / maxTime) * 100, 100);
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Domain Setup for {jobName}
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Status Display */}
          <div className="text-center space-y-4">
            <AnimatePresence mode="wait">
              {!isPolling && !isDomainReady && (
                <motion.div
                  key="initial"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="space-y-4"
                >
                  <div className="mx-auto w-16 h-16 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center">
                    <Globe className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold">Ready to Setup Domain</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Click below to start setting up your secure domain access
                    </p>
                  </div>
                </motion.div>
              )}

              {isPolling && !isDomainReady && (
                <motion.div
                  key="loading"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="space-y-4"
                >
                  <div className="mx-auto w-16 h-16 bg-amber-100 dark:bg-amber-900 rounded-full flex items-center justify-center">
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                    >
                      <Loader2 className="h-8 w-8 text-amber-600 dark:text-amber-400" />
                    </motion.div>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold">Setting Up Domain...</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Configuring secure tunnel and SSL certificate
                    </p>
                    <div className="mt-2 flex items-center justify-center gap-2 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      <span>{getElapsedTime()} seconds elapsed</span>
                    </div>
                  </div>
                </motion.div>
              )}

              {isDomainReady && (
                <motion.div
                  key="success"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="space-y-4"
                >
                  <motion.div
                    initial={{ scale: 0.8 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", duration: 0.6 }}
                    className="mx-auto w-16 h-16 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center"
                  >
                    <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
                  </motion.div>
                  <div>
                    <h3 className="text-lg font-semibold text-green-700 dark:text-green-400">
                      Domain Ready!
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Your secure domain is now accessible
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Domain Info */}
          {domain && (
            <div className="bg-muted/50 rounded-lg p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Domain:</span>
                <Badge variant="outline" className="font-mono">
                  {domain}
                </Badge>
              </div>
              {domainUrl && (
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">URL:</span>
                  <Badge variant="outline" className="font-mono text-green-600">
                    {domainUrl}
                  </Badge>
                </div>
              )}
            </div>
          )}

          {/* Progress Bar */}
          {isPolling && !isDomainReady && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Setup Progress</span>
                <span>{Math.round(getProgress())}%</span>
              </div>
              <Progress value={getProgress()} className="h-2" />
              <p className="text-xs text-muted-foreground text-center">
                This usually takes 30-60 seconds
              </p>
            </div>
          )}

          {/* Error Display */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            
            {!isPolling && !isDomainReady && (
              <Button 
                onClick={handleStartMonitoring}
                disabled={isLoading}
                className="min-w-[120px]"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Starting...
                  </>
                ) : (
                  <>
                    <Zap className="mr-2 h-4 w-4" />
                    Setup Domain
                  </>
                )}
              </Button>
            )}

            {isPolling && !isDomainReady && (
              <Button 
                variant="secondary" 
                onClick={stopPolling}
                className="min-w-[120px]"
              >
                <Clock className="mr-2 h-4 w-4" />
                Stop Monitoring
              </Button>
            )}

            {isDomainReady && shouldOpenUrl && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2 }}
              >
                <Button 
                  onClick={handleOpenUrl}
                  className="min-w-[120px] bg-green-600 hover:bg-green-700"
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Open URL
                </Button>
              </motion.div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
