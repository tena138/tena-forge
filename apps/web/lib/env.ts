import { z } from "zod";

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  REDIS_URL: z.string().optional(),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  WORKER_API_URL: z.string().url().optional(),
  BILLING_PROVIDER: z.enum(["mock", "toss", "portone"]).default("mock"),
  STORAGE_BUCKET_SOURCE: z.string().default("source"),
  STORAGE_BUCKET_OUTPUT: z.string().default("output")
});

export function getEnv() {
  return envSchema.parse(process.env);
}
