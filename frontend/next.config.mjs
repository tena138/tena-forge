import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: rootDir,
  async redirects() {
    return [
      {
        source: "/templates/editor/",
        destination: "/templates/editor",
        permanent: false
      }
    ];
  },
  images: {
    remotePatterns: [
      { protocol: "http", hostname: "localhost", port: "8000", pathname: "/static/**" },
      { protocol: "https", hostname: "**.s3.amazonaws.com", pathname: "/**" }
    ]
  }
};

export default nextConfig;
