import { authHttp } from "@/lib/auth-client";

export type MarketplaceContentType = "problem_set" | "template" | "book" | "worksheet_pack" | "exam_pack";
export type PricingType = "free" | "subscription" | "permanent" | "inquiry";
export type LicenseType = "free_use" | "subscription_use" | "permanent_use" | "editable_permanent" | "institutional";

export type MarketplaceListing = {
  id: string;
  seller_id: string;
  academy_id: string | null;
  content_type: MarketplaceContentType;
  content_id: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  category: string | null;
  subject: string | null;
  grade: string | null;
  unit: string | null;
  thumbnail_url: string | null;
  pricing_type: PricingType;
  price_amount: number | null;
  price_currency: string;
  subscription_period: string | null;
  license_type: LicenseType;
  status: "draft" | "pending_review" | "published" | "suspended" | "archived";
  rights_confirmed: boolean;
  rights_confirmed_at: string | null;
  view_count: number;
  save_count: number;
  use_count: number;
  created_at: string;
  updated_at: string;
};

export type LicenseEntitlement = {
  id: string;
  buyer_id: string;
  buyer_academy_id: string | null;
  seller_id: string;
  listing_id: string;
  content_type: MarketplaceContentType;
  content_id: string;
  license_type: LicenseType;
  status: "active" | "expired" | "canceled" | "revoked";
  starts_at: string;
  ends_at: string | null;
  can_view: boolean;
  can_export: boolean;
  can_edit: boolean;
  can_publish: boolean;
  can_permanently_save: boolean;
  created_at: string;
  updated_at: string;
  listing?: MarketplaceListing | null;
};

export type CreatorProfile = {
  id: string;
  owner_id: string;
  display_name: string;
  slug: string;
  bio: string | null;
  profile_image_url: string | null;
  cover_image_url: string | null;
  specialties: string[];
  verified_status: "unverified" | "verified" | "official_partner";
  follower_count: number;
  listing_count: number;
  created_at: string;
  updated_at: string;
};

export const contentTypeLabels: Record<string, string> = {
  problem_set: "문항 세트",
  template: "템플릿",
  book: "교재",
  worksheet_pack: "워크시트 팩",
  exam_pack: "시험지 팩",
};

export const pricingTypeLabels: Record<string, string> = {
  free: "무료",
  subscription: "구독",
  permanent: "영구 이용권",
  inquiry: "문의",
};

export const licenseTypeLabels: Record<string, string> = {
  free_use: "무료 이용",
  subscription_use: "구독 이용",
  permanent_use: "영구 이용",
  editable_permanent: "편집 가능 영구 이용",
  institutional: "기관 라이선스",
};

export async function listMarketplaceListings(params?: Record<string, string | undefined>) {
  const response = await authHttp.get<MarketplaceListing[]>("/marketplace/listings", { params });
  return response.data;
}

export async function getMarketplaceListing(id: string) {
  const response = await authHttp.get<MarketplaceListing>(`/marketplace/listings/${id}`);
  return response.data;
}

export async function claimFreeListing(id: string) {
  const response = await authHttp.post<LicenseEntitlement>(`/marketplace/listings/${id}/claim-free`);
  return response.data;
}

export async function simulateSubscribeListing(id: string) {
  const response = await authHttp.post<LicenseEntitlement>(`/marketplace/listings/${id}/simulate-subscribe`);
  return response.data;
}

export async function simulatePermanentLicenseListing(id: string) {
  const response = await authHttp.post<LicenseEntitlement>(`/marketplace/listings/${id}/simulate-permanent-license`);
  return response.data;
}

export async function listLicensedLibrary(status?: "active" | "expired") {
  const path = status ? `/licensed-library/${status}` : "/licensed-library";
  const response = await authHttp.get<LicenseEntitlement[]>(path);
  return response.data;
}

export async function listStores() {
  const response = await authHttp.get<CreatorProfile[]>("/stores");
  return response.data;
}

export async function getStore(slug: string) {
  const response = await authHttp.get<CreatorProfile>(`/stores/${slug}`);
  return response.data;
}

export async function getStoreListings(slug: string) {
  const response = await authHttp.get<MarketplaceListing[]>(`/stores/${slug}/listings`);
  return response.data;
}
