import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/v1/:path*',
        destination: 'https://amucontainers.orion.zfns.eu.org/api/v1/:path*',
      },
    ];
  },
};

export default nextConfig;
