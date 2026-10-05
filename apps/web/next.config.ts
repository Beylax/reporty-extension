import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return ['/invite/:path*', '/guest/:path*'].map(source => ({
      source,
      headers: [
        { key: 'Referrer-Policy', value: 'no-referrer' },
        { key: 'Cache-Control', value: 'private, no-store' },
      ],
    }));
  },
};

export default nextConfig;
