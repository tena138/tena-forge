import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: join(appDir, ".."),
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
