import type { NextConfig } from 'next';

const isProd = process.env.NODE_ENV === 'production';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: isProd ? 'export' : undefined,
  distDir: isProd ? 'dist' : undefined,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
