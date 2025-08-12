/**
 * Global WebSocket Connection Manager
 * Singleton pattern for WebSocket connections in the application
 */

import { handleTokenExpiration } from './auth-utils';

export interface WebSocketMessage {
  type: string;
  message: string;
  [key: string]: any;
}

interface WebSocketSubscriber {
  id: string;
  onMessage?: (data: WebSocketMessage) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Event) => void;
}

interface ConnectionInfo {
  ws: WebSocket;
  subscribers: Map<string, WebSocketSubscriber>;
  isConnecting: boolean;
  reconnectCount: number;
  reconnectTimeout?: NodeJS.Timeout;
  manualClose?: boolean;
  lastConnectTime?: number;
  closeTimeout?: NodeJS.Timeout;
  cleanupScheduled?: boolean;
  initialPingSent?: boolean;
}

class WebSocketManager {
  private connections = new Map<string, ConnectionInfo>();
  private maxReconnectAttempts = 5;
  private reconnectInterval = 3000;
  private connectionRateLimit = 5000; // 5 seconds between connection attempts
  private connectionCloseDelay = 3000; // Delay before closing unused connections
  private debug = false; // Set to true for verbose logging
  private sendPingOnOpen = false; // Control whether to send an immediate ping on connection
  private static _instance: WebSocketManager | null = null;

  private constructor() {
    // Private constructor enforces singleton
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        this.closeAll();
      });
    }
  }

  public static getInstance(): WebSocketManager {
    // Check if we have a global instance on window first (for browser environment)
    if (typeof window !== 'undefined') {
      if (!(window as any).__wsManager) {
        (window as any).__wsManager = new WebSocketManager();
      }
      return (window as any).__wsManager;
    }
    
    // Fallback for server-side rendering
    if (!WebSocketManager._instance) {
      WebSocketManager._instance = new WebSocketManager();
    }
    return WebSocketManager._instance;
  }

  private log(message: string, ...args: any[]): void {
    if (this.debug) {
      console.log(`[WebSocketManager] ${message}`, ...args);
    }
  }

  private warn(message: string, ...args: any[]): void {
    console.warn(`[WebSocketManager] ${message}`, ...args);
  }

  private error(message: string, ...args: any[]): void {
    console.error(`[WebSocketManager] ${message}`, ...args);
  }

  private getWebSocketUrl(url: string): string | null {
    if (typeof window === 'undefined') return null;
    
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const currentHost = window.location.hostname || 'localhost';
    
    const isLocalDevelopment = currentHost === 'localhost' || currentHost === '127.0.0.1';
    const isProductionDomain = currentHost.includes('amucontainers.orion.zfns.eu.org');
    
    let host: string;
    if (isLocalDevelopment) {
      host = 'localhost:8000';
    } else if (isProductionDomain) {
      host = currentHost;
    } else {
      host = `${currentHost}:8000`;
    }
    
    const token = localStorage.getItem("access_token") || localStorage.getItem("auth_token");
    const baseUrl = `${protocol}//${host}${url}`;
    
    if (token) {
      const separator = url.includes('?') ? '&' : '?';
      return `${baseUrl}${separator}token=${encodeURIComponent(token)}`;
    }
    
    return baseUrl;
  }

  private createConnection(url: string): WebSocket | null {
    // Check if connection already exists
    const existingConnection = this.connections.get(url);
    if (existingConnection) {
      // If connection exists and is open, use it
      if (existingConnection.ws.readyState === WebSocket.OPEN) {
        this.log(`Reusing existing WebSocket connection for: ${url}`);
        return existingConnection.ws;
      }
      
      // If connection exists but is not open and reconnection is in progress, 
      // wait for that connection instead of creating a new one
      if (existingConnection.isConnecting) {
        this.log(`Connection attempt already in progress for: ${url}`);
        return existingConnection.ws;
      }

      // Rate limit connection creation
      const now = Date.now();
      if (existingConnection.lastConnectTime && 
          (now - existingConnection.lastConnectTime) < this.connectionRateLimit) {
        this.warn(`Connection attempt rate limited for ${url}`);
        return existingConnection.ws;
      }
      
      // Clear any pending close timeout
      if (existingConnection.closeTimeout) {
        this.log(`Cancelling scheduled close for ${url}`);
        clearTimeout(existingConnection.closeTimeout);
        existingConnection.closeTimeout = undefined;
        existingConnection.cleanupScheduled = false;
      }
    }

    // Create new connection
    const wsUrl = this.getWebSocketUrl(url);
    if (!wsUrl) {
      this.warn(`Cannot create WebSocket URL for: ${url}`);
      return null;
    }

    this.log(`Creating new WebSocket connection for: ${url}`);
    try {
      return new WebSocket(wsUrl);
    } catch (error) {
      this.error(`Failed to create WebSocket for ${url}:`, error);
      return null;
    }
  }

  private setupWebSocketHandlers(url: string, connectionInfo: ConnectionInfo) {
    const { ws } = connectionInfo;

    ws.onopen = () => {
      this.log(`Connected to: ${url}`);
      connectionInfo.isConnecting = false;
      connectionInfo.reconnectCount = 0;
      connectionInfo.lastConnectTime = Date.now();
      connectionInfo.cleanupScheduled = false;

      // Notify all subscribers
      connectionInfo.subscribers.forEach(subscriber => {
        subscriber.onConnect?.();
      });

      // Optionally send an initial ping immediately after connection
      if (this.sendPingOnOpen && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'ping', timestamp: new Date().toISOString() }));
        connectionInfo.initialPingSent = true;
      }
    };

    ws.onmessage = (event) => {
      try {
        const data: WebSocketMessage = JSON.parse(event.data);
        
        // Handle pong messages
        if (data.type === 'pong') {
          this.log(`Received pong from: ${url}`);
          return;
        }

        // If configured to wait for server acknowledgement, send ping after connection is established
        if (!this.sendPingOnOpen && !connectionInfo.initialPingSent && data.type === 'connection_established') {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping', timestamp: new Date().toISOString() }));
            connectionInfo.initialPingSent = true;
          }
        }
        
        // Check for auth error messages
        if (data.type === 'error' && data.message) {
          const message = data.message.toLowerCase();
          if (message.includes('unauthorized') || 
              message.includes('invalid token') || 
              message.includes('token expired') ||
              message.includes('could not validate credentials')) {
            this.log(`Auth error message received: ${data.message}`);
            handleTokenExpiration();
            return;
          }
        }
        
        // Notify all subscribers
        connectionInfo.subscribers.forEach(subscriber => {
          subscriber.onMessage?.(data);
        });
      } catch (error) {
        this.error(`Error parsing message from ${url}:`, error);
      }
    };

    ws.onclose = (event) => {
      this.log(`Disconnected from: ${url} (code: ${event.code})`);
      
      // Check if close code indicates authentication issues
      if (event.code === 1008 || event.code === 4001 || event.code === 4003) {
        this.log(`Authentication error detected (code: ${event.code})`);
        handleTokenExpiration();
        return;
      }
      
      const shouldReconnectImmediately = connectionInfo.manualClose;
      connectionInfo.manualClose = false;
      connectionInfo.isConnecting = false;

      // Notify all subscribers
      connectionInfo.subscribers.forEach(subscriber => {
        subscriber.onDisconnect?.();
      });

      if (shouldReconnectImmediately) {
        // Manual reconnect requested
        if (connectionInfo.subscribers.size > 0) {
          this.reconnect(url);
        } else {
          this.connections.delete(url);
        }
        return;
      }

      // Auto-reconnect if there are still subscribers
      if (connectionInfo.subscribers.size > 0 &&
          connectionInfo.reconnectCount < this.maxReconnectAttempts) {

        const delay = Math.min(1000 * Math.pow(2, connectionInfo.reconnectCount), 30000);
        this.log(`Reconnecting to ${url} in ${delay}ms (attempt ${connectionInfo.reconnectCount + 1})`);

        connectionInfo.reconnectTimeout = setTimeout(() => {
          if (connectionInfo.subscribers.size > 0) {
            this.reconnect(url);
          } else {
            this.connections.delete(url);
          }
        }, delay);

        connectionInfo.reconnectCount++;
      } else if (connectionInfo.reconnectCount >= this.maxReconnectAttempts) {
        this.warn(`Max reconnect attempts reached for ${url}, giving up`);
        this.connections.delete(url);
      }
    };

    ws.onerror = (error) => {
      this.error(`Error on: ${url}`, error);
      connectionInfo.isConnecting = false;
      
      // Notify all subscribers
      connectionInfo.subscribers.forEach(subscriber => {
        subscriber.onError?.(error);
      });
    };
  }

  private reconnect(url: string) {
    const connectionInfo = this.connections.get(url);
    if (!connectionInfo || connectionInfo.isConnecting) return;

    // Check if we have no subscribers (cleanup)
    if (connectionInfo.subscribers.size === 0) {
      this.connections.delete(url);
      return;
    }

    connectionInfo.isConnecting = true;
    
    const newWs = this.createConnection(url);
    if (newWs) {
      connectionInfo.ws = newWs;
      connectionInfo.lastConnectTime = Date.now();
      connectionInfo.initialPingSent = false;
      this.setupWebSocketHandlers(url, connectionInfo);
    } else {
      // Failed to create new connection
      connectionInfo.isConnecting = false;
      
      // Schedule another attempt if we still have subscribers
      if (connectionInfo.subscribers.size > 0 &&
          connectionInfo.reconnectCount < this.maxReconnectAttempts) {
        
        const delay = Math.min(1000 * Math.pow(2, connectionInfo.reconnectCount), 30000);
        connectionInfo.reconnectTimeout = setTimeout(() => {
          if (connectionInfo.subscribers.size > 0) {
            this.reconnect(url);
          }
        }, delay);
        
        connectionInfo.reconnectCount++;
      }
    }
  }

  /**
   * Subscribe to WebSocket channel
   */
  subscribe(url: string, subscriber: WebSocketSubscriber): () => void {
    // Ensure subscriber has an ID
    if (!subscriber.id) {
      subscriber.id = Math.random().toString(36).substring(2, 9);
    }
    
    let connectionInfo = this.connections.get(url);
    
    if (!connectionInfo) {
      // Create new connection
      const ws = this.createConnection(url);
      if (!ws) {
        this.error(`Failed to create connection to: ${url}`);
        return () => {}; // Return no-op unsubscribe
      }

      connectionInfo = {
        ws,
        subscribers: new Map(),
        isConnecting: true,
        reconnectCount: 0,
        lastConnectTime: Date.now(),
        initialPingSent: false
      };
      
      this.connections.set(url, connectionInfo);
      this.setupWebSocketHandlers(url, connectionInfo);
    } else if (connectionInfo.cleanupScheduled) {
      // If cleanup was scheduled, cancel it
      if (connectionInfo.closeTimeout) {
        clearTimeout(connectionInfo.closeTimeout);
        connectionInfo.closeTimeout = undefined;
        connectionInfo.cleanupScheduled = false;
        this.log(`Cancelled cleanup for ${url}, reusing connection`);
      }
    }

    // Check if we already have this subscriber
    const existingSubscriber = connectionInfo.subscribers.get(subscriber.id);
    if (existingSubscriber) {
      this.log(`Subscriber ${subscriber.id} already exists for ${url}, updating callbacks`);
      // Update callbacks if they've changed
      connectionInfo.subscribers.set(subscriber.id, {
        ...existingSubscriber,
        onMessage: subscriber.onMessage || existingSubscriber.onMessage,
        onConnect: subscriber.onConnect || existingSubscriber.onConnect,
        onDisconnect: subscriber.onDisconnect || existingSubscriber.onDisconnect,
        onError: subscriber.onError || existingSubscriber.onError
      });
    } else {
      // Add new subscriber
      connectionInfo.subscribers.set(subscriber.id, subscriber);
      this.log(`Added subscriber ${subscriber.id} to ${url}, total subscribers: ${connectionInfo.subscribers.size}`);
    }

    // If connection is already open, notify immediately
    if (connectionInfo.ws.readyState === WebSocket.OPEN) {
      subscriber.onConnect?.();
    }

    // Return unsubscribe function
    return () => {
      const info = this.connections.get(url);
      if (!info) return;
      
      // Remove this specific subscriber
      info.subscribers.delete(subscriber.id);
      this.log(`Unsubscribed ${subscriber.id} from ${url}, remaining subscribers: ${info.subscribers.size}`);
      
      // If no more subscribers, schedule connection close with a delay
      // This helps avoid rapid connect/disconnect cycles when navigating between pages
      if (info.subscribers.size === 0 && !info.cleanupScheduled) {
        this.log(`No more subscribers for ${url}, scheduling cleanup in ${this.connectionCloseDelay}ms`);
        info.cleanupScheduled = true;
        
        // Cancel any existing reconnect attempts
        if (info.reconnectTimeout) {
          clearTimeout(info.reconnectTimeout);
          info.reconnectTimeout = undefined;
        }
        
        info.closeTimeout = setTimeout(() => {
          const connection = this.connections.get(url);
          if (!connection) return;
          
          // Double-check that we still have no subscribers
          if (connection.subscribers.size === 0) {
            this.log(`Closing unused connection to: ${url}`);
            try {
              connection.ws.close(1000, 'No subscribers');
            } catch (error) {
              this.error(`Error closing connection to ${url}:`, error);
            }
            this.connections.delete(url);
          } else {
            // Someone subscribed while we were waiting
            connection.cleanupScheduled = false;
            this.log(`Cancelled cleanup for ${url} - new subscribers arrived`);
          }
        }, this.connectionCloseDelay);
      }
    };
  }

  /**
   * Send message through WebSocket
   */
  sendMessage(url: string, data: any): boolean {
    const connectionInfo = this.connections.get(url);
    if (connectionInfo?.ws.readyState === WebSocket.OPEN) {
      try {
        connectionInfo.ws.send(JSON.stringify(data));
        return true;
      } catch (error) {
        this.error(`Error sending message to ${url}:`, error);
        return false;
      }
    }
    this.warn(`Cannot send message to ${url} - connection not ready`);
    return false;
  }

  /**
   * Check if connection is active
   */
  isConnected(url: string): boolean {
    const connectionInfo = this.connections.get(url);
    return connectionInfo?.ws.readyState === WebSocket.OPEN || false;
  }

  /**
   * Get connection stats for debugging
   */
  getStats() {
    const stats: Record<string, { connected: boolean; subscribers: number }> = {};
    
    this.connections.forEach((info, url) => {
      stats[url] = {
        connected: info.ws.readyState === WebSocket.OPEN,
        subscribers: info.subscribers.size
      };
    });
    
    return stats;
  }

  /**
   * Force immediate reconnection for a given URL
   */
  forceReconnect(url: string) {
    const connectionInfo = this.connections.get(url);
    if (!connectionInfo) return;

    // Rate limit reconnects
    const now = Date.now();
    if (connectionInfo.lastConnectTime && 
        (now - connectionInfo.lastConnectTime) < this.connectionRateLimit) {
      this.warn(`Reconnect attempt rate limited for ${url}`);
      return;
    }

    if (connectionInfo.reconnectTimeout) {
      clearTimeout(connectionInfo.reconnectTimeout);
      connectionInfo.reconnectTimeout = undefined;
    }
    
    if (connectionInfo.closeTimeout) {
      clearTimeout(connectionInfo.closeTimeout);
      connectionInfo.closeTimeout = undefined;
      connectionInfo.cleanupScheduled = false;
    }

    connectionInfo.reconnectCount = 0;
    connectionInfo.manualClose = true;
    
    try {
      connectionInfo.ws.close(1000, 'Manual reconnect');
    } catch (error) {
      this.error(`Error during manual reconnect for ${url}:`, error);
      // Attempt reconnect anyway
      setTimeout(() => this.reconnect(url), 100);
    }
  }

  /**
   * Disconnect and remove all subscribers for a given URL
   */
  disconnect(url: string) {
    const connectionInfo = this.connections.get(url);
    if (!connectionInfo) return;

    if (connectionInfo.reconnectTimeout) {
      clearTimeout(connectionInfo.reconnectTimeout);
    }
    
    if (connectionInfo.closeTimeout) {
      clearTimeout(connectionInfo.closeTimeout);
    }

    // Notify subscribers before clearing
    connectionInfo.subscribers.forEach(sub => sub.onDisconnect?.());
    connectionInfo.subscribers.clear();
    
    try {
      connectionInfo.ws.close(1000, 'Manual disconnect');
    } catch (error) {
      this.error(`Error closing connection to ${url}:`, error);
    }
    
    this.connections.delete(url);
  }

  /**
   * Close all connections - useful for cleanup on logout/page unload
   */
  closeAll() {
    this.log('Closing all WebSocket connections');
    this.connections.forEach((_, url) => {
      this.disconnect(url);
    });
  }
}

// Global singleton instance
export const wsManager = WebSocketManager.getInstance();
