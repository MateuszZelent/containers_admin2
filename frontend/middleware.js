import { NextResponse } from 'next/server';

export function middleware(request) {
  // Pobierz adres IP klienta
  // Uwaga: W środowisku produkcyjnym, jeśli używasz reverse proxy lub load balancera,
  // możliwe, że będziesz musiał odczytać IP z nagłówka X-Forwarded-For
  const clientIp = request.headers.get('x-forwarded-for') || request.ip || '';
  
  // Sprawdź, czy IP zaczyna się od 150.254
  const allowedIpPrefix = '150.254';
  const isAllowedIp = clientIp.startsWith(allowedIpPrefix);
  
  // Jeśli to jest żądanie API, zawsze przepuść (opcjonalnie)
  const isApiRequest = request.nextUrl.pathname.startsWith('/api');
  
  // Lokalne adresy IP zawsze dopuszczamy (dla developmentu)
  const isLocalhost = clientIp === '127.0.0.1' || clientIp === '::1' || clientIp.startsWith('192.168.') || clientIp.startsWith('10.');
  
  // Przepuść żądanie, jeśli IP jest dozwolone, jest to lokalny adres, lub jest to żądanie API
  if (isAllowedIp || isLocalhost || isApiRequest) {
    return NextResponse.next();
  }
  
  // W przeciwnym razie zwróć błąd 403 Forbidden
  return new NextResponse(
    JSON.stringify({
      success: false,
      message: 'Dostęp zabroniony. Twój adres IP nie jest autoryzowany.',
    }),
    {
      status: 403,
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );
}

// Określ, które ścieżki powinny być sprawdzane przez middleware
export const config = {
  // Zastosuj middleware do wszystkich ścieżek oprócz statycznych zasobów
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|images|fonts).*)',
  ],
};
