/**
 * Global WebSocket Connection Manager
 * Zapewnia singleton pattern dla połączeń WebSocket w całej aplikacji
 */

import { handleTokenExpiration, isTokenExpiredError } from './auth-utils';

export interface WebSocketMessage {
  type: string;
  timestamp: string;
  channel: string;
  [key: string]: any;
}

interface WebSocketSubscriber {
  onMessage?: (data: WebSocketMessage) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Event) => void;
}

interface ConnectionInfo {
  ws: WebSocket;
  subscribers: Set<WebSocketSubscriber>;
  isConnecting: boolean;
  reconnectCount: number;
  reconnectTimeout?: NodeJS.Timeout;
  manualClose?: boolean;
}

class WebSocketManager {
  private connections = new Map<string, ConnectionInfo>();
  private maxReconnectAttempts = 5;
  private reconnectInterval = 3000;
  private static _instance: WebSocketManager | null = null;

  private constructor() {
    // Private constructor enforces singleton
    console.log('[WSManager] Creating new WebSocketManager instance');
  }

  public static getInstance(): WebSocketManager {
    // Check if we have a global instance on window first (for browser environment)
    if (typeof window !== 'undefined') {
      if (!(window as any).__wsManager) {
        (window as any).__wsManager = new WebSocketManager();
        console.log('[WSManager] Created global singleton instance');
      }
      return (window as any).__wsManager;
    }
    
    // Fallback for server-side rendering
    if (!WebSocketManager._instance) {
      WebSocketManager._instance = new WebSocketManager();
    }
    return WebSocketManager._instance;
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
    const wsUrl = this.getWebSocketUrl(url);
    if (!wsUrl) {
      console.warn(`[WSManager] Cannot create WebSocket URL for: ${url}`);
      return null;
    }

    console.log(`[WSManager] Creating connection to: ${url}`);
    const ws = new WebSocket(wsUrl);
    
    return ws;
  }

  private setupWebSocketHandlers(url: string, connectionInfo: ConnectionInfo) {
    const { ws } = connectionInfo;

    ws.onopen = () => {
      console.log(`[WSManager] Connected to: ${url}`);
      connectionInfo.isConnecting = false;
      connectionInfo.reconnectCount = 0;
      
      // Notify all subscribers
      connectionInfo.subscribers.forEach(subscriber => {
        subscriber.onConnect?.();
      });

      // Send initial ping
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'ping', timestamp: new Date().toISOString() }));
      }
    };

    ws.onmessage = (event) => {
      try {
        const data: WebSocketMessage = JSON.parse(event.data);
        
        // Handle pong messages
        if (data.type === 'pong') {
          console.debug(`[WSManager] Received pong from: ${url}`);
          return;
        }
        
        // Check for auth error messages
        if (data.type === 'error' && data.message) {
          const message = data.message.toLowerCase();
          if (message.includes('unauthorized') || 
              message.includes('invalid token') || 
              message.includes('token expired') ||
              message.includes('could not validate credentials')) {
            console.log(`[WSManager] Auth error message received: ${data.message}`);
            handleTokenExpiration();
            return;
          }
        }
        
        // Notify all subscribers
        connectionInfo.subscribers.forEach(subscriber => {
          subscriber.onMessage?.(data);
        });
      } catch (error) {
        console.error(`[WSManager] Error parsing message from ${url}:`, error);
      }
    };

    ws.onclose = (event) => {
      console.log(`[WSManager] Disconnected from: ${url} (code: ${event.code})`);
      
      // Check if close code indicates authentication issues
      if (event.code === 1008 || event.code === 4001 || event.code === 4003) {
        console.log(`[WSManager] Authentication error detected (code: ${event.code})`);
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
        console.log(`[WSManager] Reconnecting to ${url} in ${delay}ms (attempt ${connectionInfo.reconnectCount + 1})`);

        connectionInfo.reconnectTimeout = setTimeout(() => {
          if (connectionInfo.subscribers.size > 0) {
            this.reconnect(url);
          }
        }, delay);

        connectionInfo.reconnectCount++;
      } else {
        // No more subscribers or max attempts reached - cleanup
        this.connections.delete(url);
      }
    };

    ws.onerror = (error) => {
      console.error(`[WSManager] Error on: ${url}`, error);
      connectionInfo.isConnecting = false;
      
      // Check if error might be auth-related (this is harder to detect in WebSocket errors)
      // We'll rely more on close codes and backend error messages
      
      // Notify all subscribers
      connectionInfo.subscribers.forEach(subscriber => {
        subscriber.onError?.(error);
      });
    };
  }

  private reconnect(url: string) {
    const connectionInfo = this.connections.get(url);
    if (!connectionInfo || connectionInfo.isConnecting) return;

    console.log(`[WSManager] Reconnecting to: ${url}`);
    connectionInfo.isConnecting = true;
    
    const newWs = this.createConnection(url);
    if (newWs) {
      connectionInfo.ws = newWs;
      this.setupWebSocketHandlers(url, connectionInfo);
    }
  }

  /**
   * Subscribe to WebSocket channel
   */
  subscribe(url: string, subscriber: WebSocketSubscriber): () => void {
    console.log(`[WSManager] Subscribing to: ${url}`);
    
    let connectionInfo = this.connections.get(url);
    
    if (!connectionInfo) {
      // Create new connection
      const ws = this.createConnection(url);
      if (!ws) {
        console.error(`[WSManager] Failed to create connection to: ${url}`);
        return () => {}; // Return no-op unsubscribe
      }

      connectionInfo = {
        ws,
        subscribers: new Set(),
        isConnecting: true,
        reconnectCount: 0
      };
      
      this.connections.set(url, connectionInfo);
      this.setupWebSocketHandlers(url, connectionInfo);
    }

    // Add subscriber
    connectionInfo.subscribers.add(subscriber);
    console.log(`[WSManager] Subscribers for ${url}: ${connectionInfo.subscribers.size}`);

    // If connection is already open, notify immediately
    if (connectionInfo.ws.readyState === WebSocket.OPEN) {
      subscriber.onConnect?.();
    }

    // Return unsubscribe function
    return () => {
      console.log(`[WSManager] Unsubscribing from: ${url}`);
      const info = this.connections.get(url);
      if (info) {
        info.subscribers.delete(subscriber);
        console.log(`[WSManager] Subscribers for ${url}: ${info.subscribers.size}`);
        
        // If no more subscribers, close connection
        if (info.subscribers.size === 0) {
          console.log(`[WSManager] No more subscribers, closing connection to: ${url}`);
          if (info.reconnectTimeout) {
            clearTimeout(info.reconnectTimeout);
          }
          info.ws.close(1000, 'No subscribers');
          this.connections.delete(url);
        }
      }
    };
  }

  /**
   * Send message through WebSocket
   */
  sendMessage(url: string, data: any): boolean {
    const connectionInfo = this.connections.get(url);
    if (connectionInfo?.ws.readyState === WebSocket.OPEN) {
      connectionInfo.ws.send(JSON.stringify(data));
      return true;
    }
    console.warn(`[WSManager] Cannot send message to ${url} - connection not ready`);
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

    if (connectionInfo.reconnectTimeout) {
      clearTimeout(connectionInfo.reconnectTimeout);
      connectionInfo.reconnectTimeout = undefined;
    }

    connectionInfo.reconnectCount = 0;
    connectionInfo.manualClose = true;
    connectionInfo.ws.close(1012, 'Manual reconnect');
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

    // Notify subscribers before clearing
    connectionInfo.subscribers.forEach(sub => sub.onDisconnect?.());
    connectionInfo.subscribers.clear();
    connectionInfo.ws.close(1000, 'Manual disconnect');
    this.connections.delete(url);
  }
}

// Global singleton instance
export const wsManager = WebSocketManager.getInstance();

// Debug helper - the instance is already available on window via getInstance()
console.log('[WSManager] Singleton instance ready');
