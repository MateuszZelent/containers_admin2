import React, { memo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { 
  AlertCircle, 
  CheckCircle2, 
  Clock, 
  RefreshCcw, 
  Wifi, 
  WifiOff,
  Server,
  Activity,
  Loader2,
  ChevronDown,
  ChevronUp,
  AlertTriangle
} from 'lucide-react';
import { useConnectionStatusContext } from '@/contexts/ConnectionStatusContext';
import { ConnectionStatus } from '@/hooks/useConnectionStatus';
import { useTranslation } from '@/lib/i18n/LanguageContext';

interface ConnectionStatusCardProps {
  className?: string;
  showRefreshButton?: boolean;
  compact?: boolean;
}

interface StatusIndicatorProps {
  status: 'active' | 'inactive' | 'checking' | 'reconnecting' | 'unknown';
  label: string;
  lastChecked: Date | null;
  error?: string;
  additionalInfo?: string;
  compact?: boolean;
}

// Kompaktowy komponent pojedynczego statusu - tylko ikonka i tooltip
const CompactStatusIcon = memo<StatusIndicatorProps>(({ 
  status, 
  label, 
  lastChecked, 
  error, 
  additionalInfo 
}) => {
  const getStatusIcon = (status: StatusIndicatorProps['status']) => {
    switch (status) {
      case 'active':
        return { icon: CheckCircle2, color: 'text-emerald-500 dark:text-emerald-400' };
      case 'inactive':
        return { icon: AlertCircle, color: 'text-red-500 dark:text-red-400' };
      case 'checking':
        return { icon: Loader2, color: 'text-blue-500 dark:text-blue-400' };
      case 'reconnecting':
        return { icon: RefreshCcw, color: 'text-amber-500 dark:text-amber-400' };
      default:
        return { icon: AlertTriangle, color: 'text-gray-500 dark:text-gray-400' };
    }
  };

  const config = getStatusIcon(status);
  const Icon = config.icon;

  const getStatusText = (status: StatusIndicatorProps['status']) => {
    switch (status) {
      case 'active': return 'Aktywne';
      case 'inactive': return 'Nieaktywne';
      case 'checking': return 'Sprawdzanie...';
      case 'reconnecting': return 'Łączenie...';
      default: return 'Nieznany';
    }
  };

  const formatLastChecked = (date: Date | null) => {
    if (!date) return 'Nigdy';
    
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    if (diff < 60000) return 'Przed chwilą';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} min temu`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} godz. temu`;
    
    return date.toLocaleString();
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center justify-center">
            <Icon 
              className={`h-5 w-5 ${config.color} ${
                status === 'checking' || status === 'reconnecting' ? 'animate-spin' : ''
              }`} 
            />
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          <div className="space-y-1">
            <p className="font-semibold">{label}</p>
            <p className="text-sm">Status: {getStatusText(status)}</p>
            <p className="text-sm">Ostatnie sprawdzenie: {formatLastChecked(lastChecked)}</p>
            {additionalInfo && <p className="text-sm">{additionalInfo}</p>}
            {error && <p className="text-sm text-red-400">Błąd: {error}</p>}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});

CompactStatusIcon.displayName = 'CompactStatusIcon';

// Rozbudowany komponent statusu dla rozwiniętego widoku
const DetailedStatusIndicator = memo<StatusIndicatorProps>(({ 
  status, 
  label, 
  lastChecked, 
  error, 
  additionalInfo
}) => {
  const getStatusConfig = (status: StatusIndicatorProps['status']) => {
    switch (status) {
      case 'active':
        return {
          icon: CheckCircle2,
          color: 'text-emerald-600 dark:text-emerald-400',
          bgColor: 'bg-emerald-500 dark:bg-emerald-400',
          badgeClass: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800',
        };
      case 'inactive':
        return {
          icon: AlertCircle,
          color: 'text-red-600 dark:text-red-400',
          bgColor: 'bg-red-500 dark:bg-red-400',
          badgeClass: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200 border-red-200 dark:border-red-800',
        };
      case 'checking':
        return {
          icon: Loader2,
          color: 'text-blue-600 dark:text-blue-400',
          bgColor: 'bg-blue-500 dark:bg-blue-400',
          badgeClass: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200 border-blue-200 dark:border-blue-800',
        };
      case 'reconnecting':
        return {
          icon: RefreshCcw,
          color: 'text-amber-600 dark:text-amber-400',
          bgColor: 'bg-amber-500 dark:bg-amber-400',
          badgeClass: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200 border-amber-200 dark:border-amber-800',
        };
      default:
        return {
          icon: AlertTriangle,
          color: 'text-gray-600 dark:text-gray-400',
          bgColor: 'bg-gray-500 dark:bg-gray-400',
          badgeClass: 'bg-gray-100 text-gray-800 dark:bg-gray-900/50 dark:text-gray-200 border-gray-200 dark:border-gray-800',
        };
    }
  };

  const config = getStatusConfig(status);
  const Icon = config.icon;

  const getStatusText = (status: StatusIndicatorProps['status']) => {
    switch (status) {
      case 'active': return 'Aktywne';
      case 'inactive': return 'Nieaktywne';
      case 'checking': return 'Sprawdzanie...';
      case 'reconnecting': return 'Łączenie...';
      default: return 'Nieznany';
    }
  };

  const formatLastChecked = (date: Date | null) => {
    if (!date) return 'Nigdy';
    
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    if (diff < 60000) return 'Przed chwilą';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} min temu`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} godz. temu`;
    
    return date.toLocaleString();
  };

  return (
    <div className="flex items-center justify-between p-3 rounded-lg backdrop-blur-sm bg-gradient-to-br from-slate-500/5 via-slate-600/3 to-gray-700/5 dark:from-slate-400/10 dark:via-slate-500/5 dark:to-gray-600/10 border border-slate-200/30 dark:border-slate-700/30 hover:border-slate-300/40 dark:hover:border-slate-600/40 transition-all duration-300">
      <div className="flex items-center gap-3">
        <div className={`h-3 w-3 rounded-full ${config.bgColor} ${status === 'checking' || status === 'reconnecting' ? 'animate-pulse' : ''}`} />
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className={`font-medium ${config.color}`}>{label}</span>
            {(status === 'checking' || status === 'reconnecting') && (
              <Icon className={`h-4 w-4 animate-spin ${config.color}`} />
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
            <span>Ostatnie sprawdzenie: {formatLastChecked(lastChecked)}</span>
            {additionalInfo && (
              <>
                <span>•</span>
                <span>{additionalInfo}</span>
              </>
            )}
          </div>
          {error && (
            <p className="text-xs text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
        </div>
      </div>
      <Badge className={config.badgeClass}>
        {getStatusText(status)}
      </Badge>
    </div>
  );
});

DetailedStatusIndicator.displayName = 'DetailedStatusIndicator';

export const ConnectionStatusCard = memo<ConnectionStatusCardProps>(({ 
  className = '', 
  showRefreshButton = true,
  compact = false 
}) => {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);
  const {
    connectionStatus,
    isLoading,
    error,
    lastUpdate,
    refreshStatus,
  } = useConnectionStatusContext();

  const handleRefresh = async () => {
    try {
      await refreshStatus();
    } catch (error) {
      console.error('Failed to refresh connection status:', error);
    }
  };

  const getOverallStatus = () => {
    const { ssh, websocket, pcss } = connectionStatus;
    
    if (ssh.status === 'active' && websocket.status === 'active' && pcss.status === 'active') {
      return 'healthy';
    }
    
    if (ssh.status === 'inactive' || websocket.status === 'inactive' || pcss.status === 'inactive') {
      return 'unhealthy';
    }
    
    if (ssh.status === 'checking' || websocket.status === 'checking' || pcss.status === 'checking') {
      return 'checking';
    }
    
    return 'unknown';
  };

  const overallStatus = getOverallStatus();

  const getOverallIcon = () => {
    switch (overallStatus) {
      case 'healthy':
        return { icon: CheckCircle2, color: 'text-emerald-600 dark:text-emerald-400' };
      case 'unhealthy':
        return { icon: AlertCircle, color: 'text-red-600 dark:text-red-400' };
      case 'checking':
        return { icon: Loader2, color: 'text-blue-600 dark:text-blue-400 animate-spin' };
      default:
        return { icon: AlertTriangle, color: 'text-gray-600 dark:text-gray-400' };
    }
  };

  const overallIconConfig = getOverallIcon();
  const OverallIcon = overallIconConfig.icon;

  // Kompaktowy widok - tylko ikonki w jednej linii
  if (compact) {
    return (
      <Card className={`${className} transition-colors duration-300 backdrop-blur-sm bg-gradient-to-br from-slate-500/5 via-slate-600/3 to-gray-700/5 dark:from-slate-400/10 dark:via-slate-500/5 dark:to-gray-600/10 border border-slate-200/30 dark:border-slate-700/30 hover:border-slate-300/40 dark:hover:border-slate-600/40 ${
        overallStatus === 'healthy' 
          ? 'border-emerald-200 dark:border-emerald-800/50' 
          : overallStatus === 'unhealthy'
          ? 'border-red-200 dark:border-red-800/50'
          : 'border-slate-200 dark:border-slate-700'
      }`}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1">
                <OverallIcon className={`h-4 w-4 ${overallIconConfig.color}`} />
                <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  Status połączeń
                </span>
              </div>
              <div className="flex items-center gap-3">
                <CompactStatusIcon
                  status={connectionStatus.ssh.status}
                  label="SSH Connection"
                  lastChecked={connectionStatus.ssh.lastChecked}
                  error={connectionStatus.ssh.error}
                />
                <CompactStatusIcon
                  status={connectionStatus.websocket.status}
                  label="WebSocket Connection"
                  lastChecked={connectionStatus.websocket.lastChecked}
                  error={connectionStatus.websocket.error}
                  additionalInfo={connectionStatus.websocket.verificationCode ? `Code: ${connectionStatus.websocket.verificationCode}` : undefined}
                />
                <CompactStatusIcon
                  status={connectionStatus.pcss.status}
                  label="PCSS Cluster"
                  lastChecked={connectionStatus.pcss.lastChecked}
                  error={connectionStatus.pcss.error}
                  additionalInfo={[
                    connectionStatus.pcss.totalNodes ? `${connectionStatus.pcss.activeNodes}/${connectionStatus.pcss.totalNodes} węzłów` : undefined,
                    connectionStatus.pcss.source ? `(${connectionStatus.pcss.source === 'websocket' ? 'LIVE' : 'API'})` : undefined
                  ].filter(Boolean).join(' ')}
                />
              </div>
            </div>
            {showRefreshButton && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={isLoading}
                className="ml-4"
              >
                <RefreshCcw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Pełny widok z możliwością rozwijania
  return (
    <Card className={`${className} transition-colors duration-300 backdrop-blur-sm bg-gradient-to-br from-slate-500/5 via-slate-600/3 to-gray-700/5 dark:from-slate-400/10 dark:via-slate-500/5 dark:to-gray-600/10 border border-slate-200/30 dark:border-slate-700/30 hover:border-slate-300/40 dark:hover:border-slate-600/40 ${
      overallStatus === 'healthy' 
        ? 'border-emerald-200 dark:border-emerald-800/50' 
        : overallStatus === 'unhealthy'
        ? 'border-red-200 dark:border-red-800/50'
        : 'border-slate-200 dark:border-slate-700'
    }`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <OverallIcon className={`h-5 w-5 ${overallIconConfig.color}`} />
            <CardTitle className="text-slate-900 dark:text-slate-100">
              {t('dashboard.clusterStatus.title')}
            </CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
            >
              {isExpanded ? (
                <>
                  <ChevronUp className="h-4 w-4 mr-1" />
                  Zwiń
                </>
              ) : (
                <>
                  <ChevronDown className="h-4 w-4 mr-1" />
                  Rozwiń
                </>
              )}
            </Button>
            {showRefreshButton && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={isLoading}
              >
                <RefreshCcw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                {t('dashboard.taskManagement.refreshButton')}
              </Button>
            )}
          </div>
        </div>
        {lastUpdate && (
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Ostatnia aktualizacja: {lastUpdate.toLocaleString()}
          </p>
        )}
        {error && (
          <p className="text-sm text-red-600 dark:text-red-400">
            Błąd: {error}
          </p>
        )}
      </CardHeader>

      {/* Zawsze widoczne kompaktowe ikonki */}
      <CardContent className="pt-0">
        <div className="flex items-center gap-4 mb-4">
          <CompactStatusIcon
            status={connectionStatus.ssh.status}
            label={t('dashboard.clusterStatus.sshConnection')}
            lastChecked={connectionStatus.ssh.lastChecked}
            error={connectionStatus.ssh.error}
          />
          <CompactStatusIcon
            status={connectionStatus.websocket.status}
            label={t('dashboard.clusterStatus.websocketConnection')}
            lastChecked={connectionStatus.websocket.lastChecked}
            error={connectionStatus.websocket.error}
            additionalInfo={connectionStatus.websocket.verificationCode ? `${t('dashboard.clusterStatus.websocketVerification')}: ${connectionStatus.websocket.verificationCode}` : undefined}
          />
          <CompactStatusIcon
            status={connectionStatus.pcss.status}
            label="PCSS Cluster"
            lastChecked={connectionStatus.pcss.lastChecked}
            error={connectionStatus.pcss.error}
            additionalInfo={[
              connectionStatus.pcss.totalNodes ? `${connectionStatus.pcss.activeNodes}/${connectionStatus.pcss.totalNodes} aktywnych węzłów` : undefined,
              connectionStatus.pcss.source ? `(${connectionStatus.pcss.source === 'websocket' ? 'LIVE' : 'API'})` : undefined
            ].filter(Boolean).join(' ')}
          />
        </div>

        {/* Rozwinięte szczegóły */}
        {isExpanded && (
          <div className="space-y-3 border-t border-slate-200/30 dark:border-slate-700/30 pt-4">
            <DetailedStatusIndicator
              status={connectionStatus.ssh.status}
              label={t('dashboard.clusterStatus.sshConnection')}
              lastChecked={connectionStatus.ssh.lastChecked}
              error={connectionStatus.ssh.error}
            />
            
            <DetailedStatusIndicator
              status={connectionStatus.websocket.status}
              label={t('dashboard.clusterStatus.websocketConnection')}
              lastChecked={connectionStatus.websocket.lastChecked}
              error={connectionStatus.websocket.error}
              additionalInfo={connectionStatus.websocket.verificationCode ? `${t('dashboard.clusterStatus.websocketVerification')}: ${connectionStatus.websocket.verificationCode}` : undefined}
            />
            
            <DetailedStatusIndicator
              status={connectionStatus.pcss.status}
              label="PCSS Cluster"
              lastChecked={connectionStatus.pcss.lastChecked}
              error={connectionStatus.pcss.error}
              additionalInfo={connectionStatus.pcss.totalNodes ? `${connectionStatus.pcss.activeNodes}/${connectionStatus.pcss.totalNodes} aktywnych węzłów` : undefined}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
});

ConnectionStatusCard.displayName = 'ConnectionStatusCard';

export default ConnectionStatusCard;
