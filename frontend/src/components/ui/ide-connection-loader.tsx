"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Loader2, Wifi, CheckCircle, AlertCircle, Code2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface IDEConnectionLoaderProps {
  isConnecting: boolean
  onCancel?: () => void
  onRetry?: () => void
  connectionStage?: 'preparing' | 'configuring' | 'verifying' | 'ready' | 'error'
  errorMessage?: string
  className?: string
}

const connectionStages = {
  preparing: {
    label: "Przygotowywanie połączenia...",
    progress: 25,
    icon: Loader2,
    description: "Tworzenie tunelu SSH",
  },
  configuring: {
    label: "Konfigurowanie domeny...",
    progress: 50,
    icon: Wifi,
    description: "Konfiguracja Caddy proxy",
  },
  verifying: {
    label: "Weryfikacja dostępności...",
    progress: 75,
    icon: Loader2,
    description: "Sprawdzanie gotowości domeny",
  },
  ready: {
    label: "Połączenie nawiązane!",
    progress: 100,
    icon: CheckCircle,
    description: "Otwieranie IDE w nowej karcie",
  },
  error: {
    label: "Błąd połączenia",
    progress: 0,
    icon: AlertCircle,
    description: "Nie udało się nawiązać połączenia",
  },
}

export function IDEConnectionLoader({
  isConnecting,
  onCancel,
  onRetry,
  connectionStage = 'preparing',
  errorMessage,
  className,
}: IDEConnectionLoaderProps) {
  const [animationProgress, setAnimationProgress] = useState(0)
  const stage = connectionStages[connectionStage]
  const Icon = stage.icon

  // Smooth progress animation
  useEffect(() => {
    if (!isConnecting && connectionStage !== 'error') return

    const targetProgress = stage.progress
    const interval = setInterval(() => {
      setAnimationProgress(prev => {
        if (prev >= targetProgress) {
          clearInterval(interval)
          return targetProgress
        }
        return Math.min(prev + 2, targetProgress)
      })
    }, 50)

    return () => clearInterval(interval)
  }, [stage.progress, isConnecting, connectionStage])

  // Reset progress when starting new connection
  useEffect(() => {
    if (isConnecting && connectionStage === 'preparing') {
      setAnimationProgress(0)
    }
  }, [isConnecting, connectionStage])

  if (!isConnecting && connectionStage !== 'error') {
    return null
  }

  return (
    <div className={cn(
      "fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center",
      className
    )}>
      <div className="bg-card border rounded-lg p-6 w-full max-w-md mx-4 shadow-lg">
        <div className="text-center space-y-4">
          {/* Header with icon */}
          <div className="flex items-center justify-center space-x-2">
            <Code2 className="h-6 w-6 text-primary" />
            <h3 className="text-lg font-semibold">Łączenie z IDE</h3>
          </div>

          {/* Stage indicator */}
          <div className="flex items-center justify-center space-x-2">
            <Icon 
              className={cn(
                "h-5 w-5",
                connectionStage === 'error' ? "text-destructive" :
                connectionStage === 'ready' ? "text-green-500" :
                "text-primary animate-spin"
              )} 
            />
            <span className={cn(
              "text-sm font-medium",
              connectionStage === 'error' ? "text-destructive" :
              connectionStage === 'ready' ? "text-green-500" :
              "text-foreground"
            )}>
              {stage.label}
            </span>
          </div>

          {/* Progress bar */}
          {connectionStage !== 'error' && (
            <div className="space-y-2">
              <Progress 
                value={animationProgress} 
                className="w-full"
              />
              <p className="text-xs text-muted-foreground">
                {stage.description}
              </p>
            </div>
          )}

          {/* Error message */}
          {connectionStage === 'error' && errorMessage && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-md p-3">
              <p className="text-sm text-destructive">
                {errorMessage}
              </p>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex justify-center space-x-2 pt-2">
            {connectionStage === 'error' ? (
              <>
                {onRetry && (
                  <Button onClick={onRetry} size="sm">
                    Spróbuj ponownie
                  </Button>
                )}
                {onCancel && (
                  <Button onClick={onCancel} variant="outline" size="sm">
                    Anuluj
                  </Button>
                )}
              </>
            ) : connectionStage !== 'ready' && onCancel && (
              <Button onClick={onCancel} variant="outline" size="sm">
                Anuluj
              </Button>
            )}
          </div>

          {/* Connection tips */}
          {connectionStage === 'verifying' && (
            <div className="text-xs text-muted-foreground space-y-1 pt-2">
              <p>💡 Pierwsza konfiguracja domeny może zająć do 30 sekund</p>
              <p>🔒 Sprawdzamy certyfikat SSL i dostępność</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
