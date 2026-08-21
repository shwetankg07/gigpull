import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { NextConfig } from "next";

const here = dirname(fileURLToPath(import.meta.url));

const config: NextConfig = {
  // The scoring, graph and collector code lives in packages/core as
  // TypeScript source rather than as a built package.
  transpilePackages: ["@gigpull/core"],
  experimental: { externalDir: true },
  eslint: { ignoreDuringBuilds: true },

  // There is an unrelated lockfile above this repository; without this Next
  // picks it as the workspace root and traces the wrong file tree.
  outputFileTracingRoot: join(here, "..", ".."),

  webpack: (webpackConfig) => {
    // packages/core is ESM TypeScript, so its imports carry '.js' specifiers
    // that point at '.ts' files on disk. tsc resolves those under bundler
    // module resolution; webpack does not, and reports them as missing.
    webpackConfig.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
    };
    return webpackConfig;
  },
};

export default config;
