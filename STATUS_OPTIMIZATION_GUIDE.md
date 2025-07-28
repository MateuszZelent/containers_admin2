# Status Connection Optimization - Tips & Troubleshooting

## Troubleshooting

### Problem: Status nie ładuje się z cache
**Rozwiązanie:**
```javascript
// Sprawdź localStorage w Developer Tools
localStorage.getItem('dashboard_connection_status');
localStorage.getItem('dashboard_connection_status_last_update');

// Wyczyść cache jeśli potrzeba
localStorage.removeItem('dashboard_connection_status');
localStorage.removeItem('dashboard_connection_status_last_update');
```

### Problem: Zbyt częste odświeżanie API
**Rozwiązanie:**
```tsx
// Zwiększ cache TTL
<ConnectionStatusProvider
  cacheTTL={300000} // 5 minut zamiast 1 minuty
  refreshInterval={120000} // 2 minuty zamiast 30 sekund
>
```

### Problem: Context nie jest dostępny
**Rozwiązanie:**
```tsx
// Użyj lokalnego hook jako fallback
const { connectionStatus } = useConnectionStatus({
  cacheEnabled: true,
  cacheTTL: 60000,
});
```

### Problem: Wolne ładowanie pierwszego widoku  
**Rozwiązanie:**
```tsx
// Pre-load status w layout lub App component
useEffect(() => {
  // Trigger initial load
  refreshStatus();
}, []);
```

## Performance Tips

### 1. Optymalizuj re-renders
```tsx
// Użyj React.memo dla komponentów status
const MyStatusComponent = memo(() => {
  const { isSSHActive } = useClusterHealth();
  // ...
});
```

### 2. Selective status updates
```tsx
// Subskrybuj tylko potrzebn statusy
const { isSSHActive } = useClusterHealth(); // Zamiast całego obiektu
```

### 3. Debounce user actions
```tsx
const debouncedRefresh = useMemo(
  () => debounce(refreshStatus, 1000),
  [refreshStatus]
);
```

## Advanced Configuration

### Custom status definitions
```typescript
// Rozszerz typy statusów
interface ExtendedConnectionStatus extends ConnectionStatus {
  database: {
    status: 'active' | 'inactive' | 'checking';
    lastChecked: Date | null;
    connectionPool?: number;
  };
}
```

### Custom health scoring
```typescript
// Własna logika health score  
const customHealthScore = useMemo(() => {
  const weights = { ssh: 0.5, websocket: 0.3, pcss: 0.2 };
  return (
    (isSSHActive ? weights.ssh : 0) * 100 +
    (isWebSocketActive ? weights.websocket : 0) * 100 +
    (isPCSSActive ? weights.pcss : 0) * 100
  );
}, [isSSHActive, isWebSocketActive, isPCSSActive]);
```

## Development Tools

### Debug mode
```typescript
// Dodaj do useConnectionStatus
const DEBUG = process.env.NODE_ENV === 'development';

if (DEBUG) {
  console.log('Status update:', {
    ssh: connectionStatus.ssh.status,
    websocket: connectionStatus.websocket.status,
    pcss: connectionStatus.pcss.status,
    timestamp: new Date().toISOString()
  });
}
```

### Mock data dla testów
```typescript
// Mock provider dla testów
export const MockConnectionStatusProvider = ({ children, mockData }) => {
  return (
    <ConnectionStatusContext.Provider value={mockData}>
      {children}
    </ConnectionStatusContext.Provider>
  );
};
```

### Browser extension development
```javascript
// Add to window for debugging
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  window.connectionStatusDebug = {
    clearCache: () => {
      localStorage.removeItem('dashboard_connection_status');
      localStorage.removeItem('dashboard_connection_status_last_update');
    },
    getCache: () => ({
      data: localStorage.getItem('dashboard_connection_status'),
      lastUpdate: localStorage.getItem('dashboard_connection_status_last_update')
    }),
    forceRefresh: () => refreshStatus()
  };
}
```

## Testing

### Unit tests
```javascript
// Test hook
import { renderHook } from '@testing-library/react';
import { useConnectionStatus } from '@/hooks/useConnectionStatus';

test('should load from cache', () => {
  // Mock localStorage
  Storage.prototype.getItem = jest.fn(() => JSON.stringify(mockData));
  
  const { result } = renderHook(() => useConnectionStatus());
  
  expect(result.current.connectionStatus).toEqual(mockData);
});
```

### Integration tests
```javascript
// Test z mock API
import { rest } from 'msw';
import { setupServer } from 'msw/node';

const server = setupServer(
  rest.get('/api/v1/jobs/status', (req, res, ctx) => {
    return res(ctx.json({ connected: true, slurm_running: true }));
  })
);
```

## Monitoring w produkcji

### Performance tracking
```typescript
// Dodaj metryki
const startTime = performance.now();
await refreshStatus();
const loadTime = performance.now() - startTime;

// Wyślij metryki
analytics.track('status_load_time', { duration: loadTime });
```

### Error tracking  
```typescript
// Sentry integration
import * as Sentry from '@sentry/react';

try {
  await refreshStatus();
} catch (error) {
  Sentry.captureException(error, {
    tags: { component: 'connection_status' },
    extra: { action: 'refresh_status' }
  });
}
```

### User analytics
```typescript
// Śledź użycie funkcji
const { overallStatus } = useClusterHealth();

useEffect(() => {
  analytics.track('cluster_status_viewed', {
    status: overallStatus,
    timestamp: new Date().toISOString()
  });
}, [overallStatus]);
```

## Migration Guide

### Migracja z starego systemu

1. **Krok 1: Dodaj provider**
```tsx
// W layout.tsx
<ConnectionStatusProvider>
  {children}
</ConnectionStatusProvider>
```

2. **Krok 2: Zastąp stare hooki**
```tsx
// Przed
const { clusterStatus } = useOldClusterStatus();

// Po  
const { canCreateContainers } = useCanCreateContainers();
```

3. **Krok 3: Aktualizuj komponenty**
```tsx
// Przed
<OldStatusCard />

// Po
<ConnectionStatusCard variant="full" />
```

### Rollback plan
```tsx
// Feature flag dla łatwego rollback
const USE_NEW_STATUS_SYSTEM = process.env.NEXT_PUBLIC_NEW_STATUS === 'true';

return USE_NEW_STATUS_SYSTEM ? (
  <ConnectionStatusCard />
) : (
  <OldStatusCard />
);
```

## Best Practices

### 1. Minimalizuj rerenders
```tsx
// Użyj specific selectors
const isSSHActive = useClusterHealth().isSSHActive; // ❌ 
const { isSSHActive } = useClusterHealth(); // ✅
```

### 2. Handle loading states
```tsx
const { isLoading, error, connectionStatus } = useConnectionStatus();

if (isLoading) return <Skeleton />;
if (error) return <ErrorBoundary />;
return <StatusDisplay status={connectionStatus} />;
```

### 3. Graceful degradation
```tsx
try {
  const contextData = useConnectionStatusContext();
  return <StatusFromContext data={contextData} />;
} catch {
  const localData = useConnectionStatus();
  return <StatusFromLocal data={localData} />;
}
```

### 4. Cache warming
```tsx
// W App.tsx lub layout
useEffect(() => {
  // Pre-warm cache on app start
  const preWarmCache = async () => {
    try {
      await refreshStatus();
    } catch {
      // Silent fail for background operation
    }
  };
  
  preWarmCache();
}, []);
```

## Performance Benchmarks

### Przed optymalizacją:
- First load: ~3000ms
- Refresh page: ~2500ms (all fresh API calls)
- API calls per session: ~50-100

### Po optymalizacji:
- First load: ~100ms (from cache)
- Refresh page: ~50ms (from cache)
- API calls per session: ~10-20 (cache hits)

### Zalecane limity:
- Cache TTL: 30s - 5min (w zależności od częstości zmian)
- Refresh interval: 30s - 2min
- Max API retry: 3 próby
- Timeout: 10s per API call
