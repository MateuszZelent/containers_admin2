# Debug System

System logowania debug z konfigurowalnymi flagami dla różnych komponentów aplikacji.

## Konfiguracja

Dodaj do `.env.local`:

```bash
# Master debug flag - włącza debugowanie w trybie development
NEXT_PUBLIC_DEBUG=true

# Specyficzne flagi dla różnych komponentów
NEXT_PUBLIC_DEBUG_API=true      # Logi wywołań API
NEXT_PUBLIC_DEBUG_CHARTS=true   # Logi wykresów i danych
NEXT_PUBLIC_DEBUG_WS=true       # Logi WebSocket
NEXT_PUBLIC_DEBUG_AUTH=true     # Logi autoryzacji
```

## Użycie

```typescript
import { debugLog, perfLog } from '@/lib/debug';

// Różne typy logów
debugLog.api('API call started', { endpoint: '/users' });
debugLog.chart('Chart data loaded', dataArray);
debugLog.ws('WebSocket connected');
debugLog.auth('User authenticated', user);
debugLog.general('General debug info');

// Błędy i ostrzeżenia (zawsze wyświetlane)
debugLog.error('Something went wrong', error);
debugLog.warn('Potential issue detected');

// Pomiar wydajności
perfLog.start('data-processing');
// ... kod ...
perfLog.end('data-processing');
```

## Produkcja

W produkcji (`NODE_ENV=production`) wszystkie logi debug są automatycznie wyłączone, niezależnie od flag. Wyświetlane są tylko błędy i ostrzeżenia.

## Flagi domyślne

- `NEXT_PUBLIC_DEBUG=false` - debugowanie wyłączone
- Wszystkie specyficzne flagi domyślnie `false`
- W produkcji flagi są ignorowane
