import type { NextConfig } from "next";

/** 301 angel-engine.vercel.app so SEO signals stay on ag.akr.moe */
const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "angel-engine.vercel.app" }],
        destination: "https://ag.akr.moe/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
