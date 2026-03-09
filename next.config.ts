import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'export',
  images: { unoptimized: true },
  // Exclude library source from Next.js compilation in production,
  // but allow importing from src/ during dev
  typescript: {
    // Library has its own build step via vite
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
