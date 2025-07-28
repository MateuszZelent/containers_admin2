import React, { memo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  Clock,
  Loader2,
  Wifi,
  WifiOff
} from 'lucide-react';
import { useClusterHealth } from '@/hooks/useClusterHealth';

interface ClusterHealthIndicatorProps {
  variant?: 'badge' | 'icon' | 'full';
  showTooltip?: boolean;
  className?: string;
}

export const ClusterHealthIndicator = memo<ClusterHealthIndicatorProps>(({
  variant = 'badge',
  showTooltip = true,
  className = ''
}) => {
  const { overallStatus, healthScore, issues, isSSHActive, isWebSocketActive, isPCSSActive } = useClusterHealth();

  const getStatusConfig = () => {
    switch (overallStatus) {
      case 'healthy':
        return {
          icon: CheckCircle2,
          text: 'Operacyjny',
          color: 'text-emerald-600 dark:text-emerald-400',
          bgColor: 'bg-emerald-50 dark:bg-emerald-950',
          borderColor: 'border-emerald-200 dark:border-emerald-800',
          badgeVariant: 'default' as const,
        };
      case 'degraded':
        return {
          icon: AlertTriangle,
          text: 'Ograniczony',
          color: 'text-amber-600 dark:text-amber-400',
          bgColor: 'bg-amber-50 dark:bg-amber-950',
          borderColor: 'border-amber-200 dark:border-amber-800',
          badgeVariant: 'secondary' as const,
        };
      case 'unhealthy':
        return {
          icon: XCircle,
          text: 'Niedostępny',
          color: 'text-red-600 dark:text-red-400',
          bgColor: 'bg-red-50 dark:bg-red-950',
          borderColor: 'border-red-200 dark:border-red-800',
          badgeVariant: 'destructive' as const,
        };
      case 'checking':
        return {
          icon: Loader2,
          text: 'Sprawdzanie...',
          color: 'text-blue-600 dark:text-blue-400',
          bgColor: 'bg-blue-50 dark:bg-blue-950',
          borderColor: 'border-blue-200 dark:border-blue-800',
          badgeVariant: 'outline' as const,
        };
      default:
        return {
          icon: Clock,
          text: 'Nieznany',
          color: 'text-gray-600 dark:text-gray-400',
          bgColor: 'bg-gray-50 dark:bg-gray-950',
          borderColor: 'border-gray-200 dark:border-gray-800',
          badgeVariant: 'secondary' as const,
        };
    }
  };

  const config = getStatusConfig();
  const Icon = config.icon;

  const renderContent = () => {
    switch (variant) {
      case 'icon':
        return (
          <Icon 
            className={`h-5 w-5 ${config.color} ${overallStatus === 'checking' ? 'animate-spin' : ''}`} 
          />
        );
      
      case 'full':
        return (
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${config.bgColor} ${config.borderColor}`}>
            <Icon 
              className={`h-4 w-4 ${config.color} ${overallStatus === 'checking' ? 'animate-spin' : ''}`} 
            />
            <span className={`text-sm font-medium ${config.color}`}>
              {config.text} ({healthScore}%)
            </span>
          </div>
        );
      
      default: // badge
        return (
          <Badge 
            variant={config.badgeVariant}
            className={`flex items-center gap-1.5 ${className}`}
          >
            <Icon 
              className={`h-3 w-3 ${overallStatus === 'checking' ? 'animate-spin' : ''}`} 
            />
            {config.text}
          </Badge>
        );
    }
  };

  const content = renderContent();

  if (!showTooltip) {
    return content;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="cursor-help">
            {content}
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          <div className="space-y-2">
            <div className="font-medium">Status Klastra ({healthScore}%)</div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="flex items-center gap-1">
                {isSSHActive ? (
                  <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                ) : (
                  <XCircle className="h-3 w-3 text-red-500" />
                )}
                SSH
              </div>
              <div className="flex items-center gap-1">
                {isWebSocketActive ? (
                  <Wifi className="h-3 w-3 text-emerald-500" />
                ) : (
                  <WifiOff className="h-3 w-3 text-red-500" />
                )}
                WebSocket
              </div>
              <div className="flex items-center gap-1">
                {isPCSSActive ? (
                  <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                ) : (
                  <XCircle className="h-3 w-3 text-red-500" />
                )}
                PCSS
              </div>
            </div>
            {issues.length > 0 && (
              <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
                <div className="font-medium text-xs mb-1">Problemy:</div>
                <ul className="text-xs space-y-1">
                  {issues.slice(0, 3).map((issue, index) => (
                    <li key={index} className="text-muted-foreground">
                      • {issue}
                    </li>
                  ))}
                  {issues.length > 3 && (
                    <li className="text-muted-foreground">
                      • ... i {issues.length - 3} więcej
                    </li>
                  )}
                </ul>
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});

ClusterHealthIndicator.displayName = 'ClusterHealthIndicator';

export default ClusterHealthIndicator;
