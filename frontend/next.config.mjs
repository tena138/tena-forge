/** @type {import('next').NextConfig} */
const nextConfig = {
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
