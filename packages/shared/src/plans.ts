import type { SubscriptionPlan } from "./types";

export type PlanLimit = {
  plan: SubscriptionPlan;
  monthlyJobs: number;
  monthlyPages: number;
  monthlyStorageMb: number;
  monthlyAiTokens: number;
  maxFileSizeMb: number;
  watermark: boolean;
  teamMembers: number;
};

export const PLAN_LIMITS: Record<SubscriptionPlan, PlanLimit> = {
  free: {
    plan: "free",
    monthlyJobs: 3,
    monthlyPages: 30,
    monthlyStorageMb: 100,
    monthlyAiTokens: 100_000,
    maxFileSizeMb: 20,
    watermark: true,
    teamMembers: 1
  },
  pro: {
    plan: "pro",
    monthlyJobs: 100,
    monthlyPages: 1_000,
    monthlyStorageMb: 5_120,
    monthlyAiTokens: 5_000_000,
    maxFileSizeMb: 100,
    watermark: false,
    teamMembers: 1
  },
  team: {
    plan: "team",
    monthlyJobs: 500,
    monthlyPages: 10_000,
    monthlyStorageMb: 51_200,
    monthlyAiTokens: 30_000_000,
    maxFileSizeMb: 300,
    watermark: false,
    teamMembers: 25
  },
  enterprise: {
    plan: "enterprise",
    monthlyJobs: 10_000,
    monthlyPages: 500_000,
    monthlyStorageMb: 1_024_000,
    monthlyAiTokens: 500_000_000,
    maxFileSizeMb: 2_000,
    watermark: false,
    teamMembers: 1_000
  }
};

export function isPlan(value: string): value is SubscriptionPlan {
  return value === "free" || value === "pro" || value === "team" || value === "enterprise";
}
