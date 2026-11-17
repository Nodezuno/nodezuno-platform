import type { NextConfig } from "next";
import path from "node:path";

const isContainerBuild = process.env.NODEZUNO_RUNTIME === "container";
const containerWebpack: NonNullable<NextConfig["webpack"]> = (
  config,
  { webpack },
) => {
  config.plugins.push(
    new webpack.NormalModuleReplacementPlugin(
      /^cloudflare:workers$/,
      path.resolve(
        process.cwd(),
        "lib/server/cloudflare-workers-node.ts",
      ),
    ),
    new webpack.NormalModuleReplacementPlugin(
      /^cloudflare:sockets$/,
      path.resolve(
        process.cwd(),
        "lib/server/cloudflare-sockets-node.ts",
      ),
    ),
  );
  return config;
};

const nextConfig: NextConfig = {
  output: isContainerBuild ? "standalone" : undefined,
  poweredByHeader: false,
  images: { unoptimized: true },
  ...(isContainerBuild ? { webpack: containerWebpack } : {}),
};

export default nextConfig;
