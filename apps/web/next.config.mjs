/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@tena-forge/shared", "@tena-forge/database", "@tena-forge/billing"],
  experimental: {
    serverComponentsExternalPackages: ["@supabase/supabase-js", "bullmq", "ioredis"]
  }
};

export default nextConfig;
