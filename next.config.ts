import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* The desk is local-only. Both loopback spellings are allowed for dev assets. */
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
