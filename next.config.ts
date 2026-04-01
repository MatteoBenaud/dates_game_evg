import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow access from network IP for testing on mobile devices
  allowedDevOrigins: ['192.168.1.55'],
};

export default nextConfig;
