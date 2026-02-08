import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "16mb",
    },
  },
  // Root redirect / → /home is handled in middleware so admin host can rewrite / → control-centre instead.
  async redirects() {
    return [];
  },
};

export default nextConfig;
