import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Wifi, WifiOff, AlertTriangle } from 'lucide-react';

interface WebSocketStatusProps {
  isJobStatusConnected: boolean;
  isTunnelHealthConnected: boolean;
  isNotificationsConnected: boolean;
  reconnectCounts?: {
    jobStatus: number;
    tunnelHealth: number;
    notifications: number;
  };
  className?: string;
}

export const WebSocketStatus: React.FC<WebSocketStatusProps> = ({
  isJobStatusConnected,
  isTunnelHealthConnected,
  isNotificationsConnected,
  reconnectCounts,
  className = ""
}) => {
  const allConnected = isJobStatusConnected && isTunnelHealthConnected && isNotificationsConnected;
  const anyReconnecting = reconnectCounts && (
    reconnectCounts.jobStatus > 0 || 
    reconnectCounts.tunnelHealth > 0 || 
    reconnectCounts.notifications > 0
  );

  const getStatusIcon = () => {
    if (anyReconnecting) {
      return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
    }
    if (allConnected) {
      return <Wifi className="h-4 w-4 text-green-500" />;
    }
    return <WifiOff className="h-4 w-4 text-red-500" />;
  };

  const getStatusText = () => {
    if (anyReconnecting) return "Reconnecting...";
    if (allConnected) return "Real-time Connected";
    return "Real-time Disconnected";
  };

  const getStatusColor = () => {
    if (anyReconnecting) return "yellow";
    if (allConnected) return "green";
    return "red";
  };

  const getTooltipContent = () => {
    return (
      <div className="space-y-1">
        <div className="font-medium">Real-time Connection Status</div>
        <div className="space-y-1 text-sm">
          <div className="flex items-center justify-between">
            <span>Jobs:</span>
            <Badge variant={isJobStatusConnected ? "default" : "destructive"} className="ml-2">
              {isJobStatusConnected ? "Connected" : "Disconnected"}
            </Badge>
          </div>
          <div className="flex items-center justify-between">
            <span>Tunnels:</span>
            <Badge variant={isTunnelHealthConnected ? "default" : "destructive"} className="ml-2">
              {isTunnelHealthConnected ? "Connected" : "Disconnected"}
            </Badge>
          </div>
          <div className="flex items-center justify-between">
            <span>Notifications:</span>
            <Badge variant={isNotificationsConnected ? "default" : "destructive"} className="ml-2">
              {isNotificationsConnected ? "Connected" : "Disconnected"}
            </Badge>
          </div>
          {reconnectCounts && (
            <div className="mt-2 pt-2 border-t">
              <div className="text-xs text-muted-foreground">
                Reconnect attempts:
              </div>
              <div className="text-xs">
                Jobs: {reconnectCounts.jobStatus}, 
                Tunnels: {reconnectCounts.tunnelHealth}, 
                Notifications: {reconnectCounts.notifications}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={`flex items-center space-x-2 ${className}`}>
            {getStatusIcon()}
            <Badge variant="outline" className={`
              ${getStatusColor() === 'green' ? 'border-green-500 text-green-700' : ''}
              ${getStatusColor() === 'red' ? 'border-red-500 text-red-700' : ''}
              ${getStatusColor() === 'yellow' ? 'border-yellow-500 text-yellow-700' : ''}
            `}>
              {getStatusText()}
            </Badge>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          {getTooltipContent()}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
