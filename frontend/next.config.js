/** @type {import('next').NextConfig} */
const nextConfig = {

  allowedDevOrigins: ['https://amucontainers.orion.zfns.eu.org', 'amucontainers.orion.zfns.eu.org'],

  eslint: {
    ignoreDuringBuilds: true,
  },
  
  typescript: {
    // This will completely disable TypeScript checks during build
    ignoreBuildErrors: true,
  },
  
  // Add asset prefix and public runtime config for production
  assetPrefix: process.env.NODE_ENV === 'production' ? '' : '',
  
  // Rewrite API calls to backend
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://backend:8000/api/:path*',
      },
      // WebSocket connections should also go through backend
      {
        source: '/ws/:path*',
        destination: 'http://backend:8000/ws/:path*',
      },
    ];
  },

  async headers() {
    return [
      {
        source: '/favicon.ico',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        source: '/_next/static/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        source: '/static/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;