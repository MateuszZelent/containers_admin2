import React, { memo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  AlertCircle, 
  CheckCircle2, 
  WifiOff,
  Wifi,
  Clock,
  Server,
  Activity,
  Bug,
  Info,
  RefreshCcw
} from 'lucide-react';
import { useConnectionStatusContext } from '@/contexts/ConnectionStatusContext';

interface PCSSDebugPopupProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PCSSDebugPopup = memo<PCSSDebugPopupProps>(({ isOpen, onClose }) => {
  const {
    connectionStatus,
    clusterStatus,
    clusterLoading: loading,
    clusterError: error,
    clusterLastUpdate: lastUpdate,
    isClusterWebSocketActive: isWebSocketActive,
    requestClusterStatusUpdate: requestStatusUpdate
  } = useConnectionStatusContext();

  const formatTimestamp = (date: Date | null) => {
    if (!date) return 'Nigdy';
    return date.toLocaleString();
  };

  const getStatusIcon = (isActive: boolean) => {
    return isActive ? (
      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
    ) : (
      <AlertCircle className="h-4 w-4 text-red-500" />
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bug className="h-5 w-5" />
            Diagnostyka PCSS Cluster
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Status Overview */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Info className="h-4 w-4" />
                Przegląd statusu
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">WebSocket aktywny:</span>
                    <div className="flex items-center gap-2">
                      {getStatusIcon(isWebSocketActive)}
                      <Badge variant={isWebSocketActive ? "default" : "destructive"}>
                        {isWebSocketActive ? 'TAK' : 'NIE'}
                      </Badge>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Dane cluster:</span>
                    <div className="flex items-center gap-2">
                      {getStatusIcon(!!clusterStatus)}
                      <Badge variant={clusterStatus ? "default" : "destructive"}>
                        {clusterStatus ? 'DOSTĘPNE' : 'BRAK'}
                      </Badge>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Status PCSS:</span>
                    <div className="flex items-center gap-2">
                      {getStatusIcon(connectionStatus.pcss.status === 'active')}
                      <Badge variant={connectionStatus.pcss.status === 'active' ? "default" : "destructive"}>
                        {connectionStatus.pcss.status.toUpperCase()}
                      </Badge>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Źródło danych:</span>
                    <div className="flex items-center gap-2">
                      {connectionStatus.pcss.source === 'websocket' ? (
                        <Wifi className="h-4 w-4 text-emerald-500" />
                      ) : (
                        <WifiOff className="h-4 w-4 text-amber-500" />
                      )}
                      <Badge variant={connectionStatus.pcss.source === 'websocket' ? "default" : "secondary"}>
                        {connectionStatus.pcss.source === 'websocket' ? 'LIVE (WebSocket)' : 'API (Fallback)'}
                      </Badge>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Hook używa API Fallback:</span>
                    <div className="flex items-center gap-2">
                      {getStatusIcon(true)} {/* Always WebSocket now */}
                      <Badge variant="default">
                        NIE {/* No API fallback - WebSocket only */}
                      </Badge>
                    </div>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Loading:</span>
                    <Badge variant={loading ? "secondary" : "outline"}>
                      {loading ? 'TAK' : 'NIE'}
                    </Badge>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Błąd:</span>
                    <Badge variant={error ? "destructive" : "outline"}>
                      {error ? 'TAK' : 'NIE'}
                    </Badge>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Ostatnia aktualizacja:</span>
                    <span className="text-xs text-muted-foreground">
                      {formatTimestamp(lastUpdate)}
                    </span>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Sprawdzono PCSS:</span>
                    <span className="text-xs text-muted-foreground">
                      {formatTimestamp(connectionStatus.pcss.lastChecked)}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Error Details */}
          {(error || connectionStatus.pcss.error) && (
            <Card className="border-red-200 dark:border-red-800">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-red-600 dark:text-red-400">
                  <AlertCircle className="h-4 w-4" />
                  Szczegóły błędów
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {error && (
                  <div>
                    <span className="text-sm font-medium">Błąd statusu klastra:</span>
                    <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/10 p-2 rounded mt-1">
                      {error}
                    </p>
                  </div>
                )}
                {connectionStatus.pcss.error && (
                  <div>
                    <span className="text-sm font-medium">Błąd PCSS status:</span>
                    <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/10 p-2 rounded mt-1">
                      {connectionStatus.pcss.error}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Cluster Data */}
          {clusterStatus && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Server className="h-4 w-4" />
                  Dane klastra
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p><strong>Całk. CPU:</strong> {clusterStatus.total_cpus}</p>
                    <p><strong>Użyte CPU:</strong> {clusterStatus.used_cpus}</p>
                    <p><strong>Dostępne CPU:</strong> {clusterStatus.available_cpus}</p>
                  </div>
                  <div>
                    <p><strong>Całk. RAM:</strong> {Math.round(clusterStatus.total_memory / 1024)} GB</p>
                    <p><strong>Użyte RAM:</strong> {Math.round(clusterStatus.used_memory / 1024)} GB</p>
                    <p><strong>Dostępne RAM:</strong> {Math.round(clusterStatus.available_memory / 1024)} GB</p>
                  </div>
                </div>
                
                {clusterStatus.nodes && clusterStatus.nodes.length > 0 && (
                  <div className="mt-4">
                    <h4 className="font-medium mb-2">Węzły ({clusterStatus.nodes.length}):</h4>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {clusterStatus.nodes.map((node, i) => (
                        <div key={i} className="flex items-center justify-between text-xs bg-muted/30 p-2 rounded">
                          <span>{node.name}</span>
                          <div className="flex items-center gap-2">
                            <Badge variant={node.state === 'idle' ? 'default' : 'secondary'} className="text-xs">
                              {node.state}
                            </Badge>
                            <span>{node.used_cpus}/{node.cpus} CPU</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Actions */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Akcje diagnostyczne
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Button 
                  onClick={requestStatusUpdate}
                  size="sm"
                  variant="outline"
                  disabled={loading}
                >
                  <RefreshCcw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                  Wymuś aktualizację WebSocket
                </Button>
                
                <Button 
                  onClick={requestStatusUpdate}
                  size="sm"
                  variant="outline"
                  disabled={loading}
                >
                  <Server className="h-4 w-4 mr-2" />
                  Wymuś odświeżenie API
                </Button>
              </div>
              
              <div className="text-xs text-muted-foreground space-y-1">
                <p><strong>Wymuś aktualizację WebSocket:</strong> Wysyła żądanie statusu przez WebSocket</p>
                <p><strong>Wymuś odświeżenie API:</strong> Pobiera dane bezpośrednio z API</p>
              </div>
            </CardContent>
          </Card>

          {/* Raw Debug Data */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bug className="h-4 w-4" />
                Surowe dane debugowania
              </CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="text-xs bg-muted/30 p-3 rounded overflow-x-auto">
{JSON.stringify({
  clusterStatusContext: {
    isWebSocketActive,
    loading,
    error,
    lastUpdate: formatTimestamp(lastUpdate),
    hasClusterStatus: !!clusterStatus,
    clusterStatusKeys: clusterStatus ? Object.keys(clusterStatus) : []
  },
  connectionStatusPCSS: connectionStatus.pcss,
  clusterStatusSample: clusterStatus ? {
    total_cpus: clusterStatus.total_cpus,
    used_cpus: clusterStatus.used_cpus,
    nodes_count: clusterStatus.nodes?.length || 0
  } : null
}, null, 2)}
              </pre>
            </CardContent>
          </Card>
        </div>

        <div className="flex justify-end pt-4">
          <Button onClick={onClose}>Zamknij</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
});

PCSSDebugPopup.displayName = 'PCSSDebugPopup';

export default PCSSDebugPopup;
