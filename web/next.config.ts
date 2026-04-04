import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const projectDir = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  outputFileTracingRoot: projectDir,
  turbopack: {
    root: projectDir,
  },
};

export default nextConfig;
