import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  // Avoid bundling heavy deps in dev – reduces compilation time.
  serverExternalPackages: ["playwright", "firebase-admin"],
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
