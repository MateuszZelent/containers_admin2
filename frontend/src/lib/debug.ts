/**
 * Debug configuration for development and production environments
 */

// Environment-based debug flag
export const DEBUG_MODE = process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_DEBUG === 'true';

// Feature-specific debug flags
export const DEBUG_FLAGS = {
  API_CALLS: DEBUG_MODE && process.env.NEXT_PUBLIC_DEBUG_API === 'true',
  CHART_DATA: DEBUG_MODE && process.env.NEXT_PUBLIC_DEBUG_CHARTS === 'true',
  WEBSOCKET: DEBUG_MODE && process.env.NEXT_PUBLIC_DEBUG_WS === 'true',
  AUTH: DEBUG_MODE && process.env.NEXT_PUBLIC_DEBUG_AUTH === 'true',
  GENERAL: DEBUG_MODE,
};

/**
 * Debug logger wrapper
 */
export const debugLog = {
  api: (message: string, ...args: any[]) => {
    if (DEBUG_FLAGS.API_CALLS) {
      console.log(`[API] ${message}`, ...args);
    }
  },
  
  chart: (message: string, ...args: any[]) => {
    if (DEBUG_FLAGS.CHART_DATA) {
      console.log(`[CHART] ${message}`, ...args);
    }
  },
  
  ws: (message: string, ...args: any[]) => {
    if (DEBUG_FLAGS.WEBSOCKET) {
      console.log(`[WS] ${message}`, ...args);
    }
  },
  
  auth: (message: string, ...args: any[]) => {
    if (DEBUG_FLAGS.AUTH) {
      console.log(`[AUTH] ${message}`, ...args);
    }
  },
  
  general: (message: string, ...args: any[]) => {
    if (DEBUG_FLAGS.GENERAL) {
      console.log(`[DEBUG] ${message}`, ...args);
    }
  },
  
  error: (message: string, ...args: any[]) => {
    // Errors are always logged regardless of debug mode
    console.error(`[ERROR] ${message}`, ...args);
  },
  
  warn: (message: string, ...args: any[]) => {
    // Warnings are always logged regardless of debug mode
    console.warn(`[WARN] ${message}`, ...args);
  }
};

/**
 * Performance monitoring wrapper
 */
export const perfLog = {
  start: (label: string) => {
    if (DEBUG_FLAGS.GENERAL) {
      console.time(`[PERF] ${label}`);
    }
  },
  
  end: (label: string) => {
    if (DEBUG_FLAGS.GENERAL) {
      console.timeEnd(`[PERF] ${label}`);
    }
  }
};
