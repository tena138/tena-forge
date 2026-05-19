import { PLAN_LIMITS } from "@tena-forge/shared";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function assertUsageAvailable(supabase: SupabaseClient, workspaceId: string) {
  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("plan,status")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const plan = (subscription?.plan || "free") as keyof typeof PLAN_LIMITS;
  const limit = PLAN_LIMITS[plan] || PLAN_LIMITS.free;

  const since = new Date();
  since.setUTCDate(1);
  since.setUTCHours(0, 0, 0, 0);
  const { count } = await supabase
    .from("jobs")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .gte("created_at", since.toISOString());

  if ((count || 0) >= limit.monthlyJobs) {
    throw Object.assign(new Error("Monthly job limit exceeded. Upgrade your plan to continue."), { status: 402 });
  }
  return { plan, limit, jobsUsed: count || 0 };
}
