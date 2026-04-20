import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const projectDir = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  outputFileTracingRoot: projectDir,
  turbopack: {
    root: projectDir,
  },
  allowedDevOrigins: ["*.devtunnels.ms", "*.github.dev"],
  experimental: {
    serverActions: {
      allowedOrigins: ["*.devtunnels.ms", "*.github.dev", "localhost:3000"],
    },
  },
};

export default nextConfig;
