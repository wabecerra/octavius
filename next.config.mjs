/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Ensure CSS is processed correctly
  experimental: {
    optimizePackageImports: ['tailwindcss'],
  },
};

export default nextConfig;
