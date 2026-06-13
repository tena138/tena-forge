import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: appDir,
  async redirects() {
    return [
      {
        source: "/upload",
        destination: "/archive/new",
        permanent: true
      },
      {
        source: "/settings",
        destination: "/account/profile",
        permanent: true
      },
      {
        source: "/templates/editor",
        destination: "/templates/studio",
        permanent: true
      },
      {
        source: "/templates/editor/",
        destination: "/templates/studio",
        permanent: true
      },
      {
        source: "/templates/editor/:id",
        destination: "/templates/studio?id=:id",
        permanent: true
      },
      {
        source: "/templates/legacy/new",
        destination: "/templates/studio?new=1",
        permanent: true
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
