/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: '/favicon.ico',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
    ];
  },

  // Wyłączenie sprawdzania typów podczas budowania
  typescript: {
    // Ignorowanie błędów TS podczas produkcji
    ignoreBuildErrors: true,
  },
  
  // Wyłączenie sprawdzania ESLint podczas budowania
  eslint: {
    // Ignoruj błędy ESLint podczas produkcji
    ignoreDuringBuilds: true,
  }
}
