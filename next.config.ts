import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Upload des photos compressées (limite Vercel : 4,5 Mo par requête)
      bodySizeLimit: "4mb",
    },
  },
};

export default nextConfig;
