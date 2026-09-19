import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Use standalone output for Docker containers; Vercel automatically manages serverless output
  ...(process.env.VERCEL ? {} : { output: "standalone" }),
  turbopack: {
    root: __dirname,
  },
  async rewrites() {
    const backendUrl = process.env.BACKEND_URL || 'http://127.0.0.1:4000';
    return [
      {
        source: "/socket.io/:path*",
        destination: `${backendUrl}/socket.io/:path*`,
      },
    ];
  },
};

export default nextConfig;
