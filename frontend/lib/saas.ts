import { api } from "@/lib/api";

export type CreatorApplication = {
  id: string;
  user_id: string;
  legal_name: string;
  display_name: string;
  email: string;
  business_type: string;
  status: string;
  rejection_reason?: string | null;
  admin_notes?: string | null;
  created_at: string;
};

export type Product = {
  id: string;
  creator_id: string;
  title: string;
  slug: string;
  description?: string | null;
  subject?: string | null;
  grade_level?: string | null;
  curriculum?: string | null;
  unit_tags: string[];
  difficulty?: string | null;
  question_count: number;
  exam_type?: string | null;
  thumbnail_url?: string | null;
  price: number;
  currency: string;
  status: string;
  rights_declared: boolean;
  created_at: string;
  updated_at: string;
};

export type Plan = {
  code: string;
  name: string;
  monthly_price: number;
  currency: string;
  monthly_upload_count: number;
  monthly_processed_pages: number;
  storage_quota_mb: number;
  monthly_ai_tokens: number;
  enabled_subject_engines: string[];
  subject_engine_count: number;
  subject_multiplier: number;
  final_monthly_price: number;
  final_annual_price: number;
};

export type UsageSummary = {
  plan: Plan;
  subscription: {
    status: string;
    plan_code: string;
    enabled_subject_engines?: string[];
    subject_engine_count?: number;
    subject_multiplier?: number;
    final_monthly_price?: number;
    final_annual_price?: number;
  } | null;
  monthly_uploads_used: number;
  monthly_pages_used: number;
  monthly_ai_tokens_used: number;
  storage_mb_used: number;
  monthly_cost_cap_krw: number;
  estimated_cost_used_krw: number;
  available_cost_krw: number;
  monthly_credit_limit: number;
  extraction_credits_used: number;
  extraction_credits_remaining: number;
  monthly_upload_mb_limit: number;
  uploaded_mb_this_month: number;
  max_file_size_mb: number;
  max_pages_per_job: number;
  max_jobs_per_day: number;
  max_concurrent_jobs: number;
};

export type Order = {
  id: string;
  status: string;
  gross_amount: number;
  platform_commission_amount: number;
  creator_net_amount: number;
  currency: string;
  created_at: string;
};

export type ProductLicense = {
  id: string;
  product_id: string;
  product_version_id?: string | null;
  creator_id: string;
  license_tier_id: string;
  order_id: string;
  terms_snapshot: string;
  status: string;
  starts_at: string;
};

export function getRoles() {
  return api<{ roles: string[] }>("/api/saas/roles");
}

export function getUsageSummary() {
  return api<UsageSummary>("/api/saas/billing/summary");
}

export function listPlans() {
  return api<Plan[]>("/api/saas/plans");
}

export function mockCheckout(plan_code: string, enabled_subject_engines: string[] = ["math"]) {
  return api<{ provider: string; checkout_url: string; message: string }>("/api/saas/billing/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ plan_code, enabled_subject_engines }),
  });
}

export function getCreatorApplication() {
  return api<CreatorApplication | null>("/api/creators/application");
}

export function submitCreatorApplication(payload: Record<string, unknown>) {
  return api<CreatorApplication>("/api/creators/application", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function listCreatorProducts() {
  return api<Product[]>("/api/creator/products");
}

export function createCreatorProduct(payload: Record<string, unknown>) {
  return api<Product>("/api/creator/products", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function submitProductForReview(id: string) {
  return api<Product>(`/api/creator/products/${id}/submit`, { method: "POST" });
}

export function listCuratedProducts() {
  return api<Product[]>("/api/market/products");
}

export function purchaseProduct(productId: string, license_tier_id: string) {
  return api<Order>(`/api/market/products/${productId}/purchase`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ license_tier_id }),
  });
}

export function getBuyerLibrary() {
  return api<ProductLicense[]>("/api/market/library");
}

export function adminOverview() {
  return api<Record<string, number>>("/api/admin/saas/overview");
}

export function adminCreatorApplications() {
  return api<CreatorApplication[]>("/api/admin/saas/creator-applications");
}

export function adminApproveApplication(id: string) {
  return api<CreatorApplication>(`/api/admin/saas/creator-applications/${id}/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ admin_notes: "승인됨" }),
  });
}

export function adminRejectApplication(id: string, reason: string) {
  return api<CreatorApplication>(`/api/admin/saas/creator-applications/${id}/reject`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason }),
  });
}

export function adminProductQueue() {
  return api<Product[]>("/api/admin/saas/product-review-queue");
}

export function adminApproveProduct(id: string) {
  return api<Product>(`/api/admin/saas/products/${id}/approve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
}

export function adminRejectProduct(id: string, reason: string) {
  return api<Product>(`/api/admin/saas/products/${id}/reject`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason }),
  });
}
