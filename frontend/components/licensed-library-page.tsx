"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, LockKeyhole, RefreshCw } from "lucide-react";

import { getDashboardAnnouncementAccess } from "@/lib/api";
import { LicenseEntitlement, contentTypeLabels, licenseTypeLabels, listLicensedLibrary } from "@/lib/marketplace";
import { cn } from "@/lib/utils";

type LibraryFilter = "all" | "subscription" | "purchased" | "expired";

const filters: Array<{ key: LibraryFilter; label: string }> = [
  { key: "all", label: "전체" },
  { key: "subscription", label: "구독 중" },
  { key: "purchased", label: "구매한 자료" },
  { key: "expired", label: "만료된 자료" },
];

function matchesFilter(item: LicenseEntitlement, filter: LibraryFilter) {
  if (filter === "all") return true;
  if (filter === "expired") return item.status !== "active";
  if (filter === "subscription") return item.status === "active" && item.license_type === "subscription_use";
  return item.status === "active" && item.license_type !== "subscription_use";
}

function contentHref(item: LicenseEntitlement) {
  if (item.content_type === "problem_set") return `/problem-sets/${item.content_id}`;
  if (item.content_type === "template") return `/templates/${item.content_id}`;
  return item.listing_id ? `/marketplace/listings/${item.listing_id}` : "/marketplace";
}

function renewalHref(item: LicenseEntitlement) {
  return item.listing_id ? `/marketplace/listings/${item.listing_id}` : "/marketplace";
}

function statusLabel(item: LicenseEntitlement) {
  if (item.status === "expired") return "만료";
  if (item.status === "canceled") return "해지";
  if (item.status === "revoked") return "회수";
  return item.license_type === "subscription_use" ? "구독" : "구매";
}

function unavailableMessage(status: LicenseEntitlement["status"]) {
  if (status === "expired") return "구독 기간이 만료되어 이 자료를 사용할 수 없습니다.";
  if (status === "canceled") return "라이선스가 해지되어 이 자료를 사용할 수 없습니다.";
  if (status === "revoked") return "라이선스가 회수되어 이 자료를 사용할 수 없습니다.";
  return "이 자료를 사용할 수 없습니다.";
}

const actionLinkClassName =
  "license-library-primary-cta inline-flex h-10 w-full items-center justify-center gap-2 rounded-[9px] bg-black px-4 text-sm font-bold text-white transition hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/15";

export function LicensedLibraryPage() {
  const [items, setItems] = useState<LicenseEntitlement[]>([]);
  const [filter, setFilter] = useState<LibraryFilter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [canManageMarketplace, setCanManageMarketplace] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError("");
    listLicensedLibrary()
      .then(setItems)
      .catch(() => {
        setItems([]);
        setError("라이선스 자료를 불러오지 못했습니다.");
      })
      .finally(() => setLoading(false));
    getDashboardAnnouncementAccess()
      .then((access) => setCanManageMarketplace(access.can_manage))
      .catch(() => setCanManageMarketplace(false));
  }, []);

  const counts = useMemo(
    () =>
      filters.reduce<Record<LibraryFilter, number>>((acc, item) => {
        acc[item.key] = items.filter((entry) => matchesFilter(entry, item.key)).length;
        return acc;
      }, { all: 0, subscription: 0, purchased: 0, expired: 0 }),
    [items]
  );

  const visibleItems = useMemo(() => items.filter((item) => matchesFilter(item, filter)), [items, filter]);

  return (
    <div className="space-y-6">
      <section className="rounded-[12px] bg-white p-6 shadow-[0_18px_48px_rgba(0,0,0,0.04)]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-normal text-zinc-950">라이선스 보관함</h1>
            <p className="mt-2 text-sm font-medium text-zinc-500">구독, 구매, 만료 자료를 한 곳에서 확인합니다.</p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            {filters.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setFilter(item.key)}
                aria-pressed={filter === item.key}
                className={`rounded-[8px] px-3 py-2 text-sm font-bold transition ${
                  filter === item.key
                    ? "license-library-primary-cta bg-black text-white"
                    : "license-library-filter-tab bg-zinc-100 text-zinc-950 hover:bg-zinc-200"
                }`}
              >
                {item.label}
                <span className={cn("ml-2 text-xs", filter === item.key ? "text-zinc-200" : "text-zinc-600")}>{counts[item.key]}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded-[10px] bg-zinc-100 p-4 text-sm font-semibold text-zinc-950">
          {error}
        </div>
      )}

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map((item) => (
            <div key={item} className="h-72 animate-pulse rounded-[10px] bg-white shadow-[0_14px_36px_rgba(0,0,0,0.04)]" />
          ))}
        </div>
      ) : visibleItems.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visibleItems.map((item) => {
            const locked = item.status !== "active";
            const isSubscription = item.license_type === "subscription_use";
            return (
              <article
                key={item.id}
                className={cn("flex min-h-72 flex-col rounded-[10px] bg-white p-4 shadow-[0_14px_36px_rgba(0,0,0,0.045)]", locked && "opacity-75")}
              >
                <div className="mb-4 flex h-32 items-center justify-center rounded-[8px] bg-zinc-100 text-sm font-bold text-zinc-600">
                  {locked ? <LockKeyhole className="h-5 w-5 text-zinc-500" /> : contentTypeLabels[item.content_type]}
                </div>
                <div className="flex items-start justify-between gap-3">
                  <h2 className="min-w-0 text-lg font-bold leading-snug text-zinc-950">{item.listing?.title || item.content_id}</h2>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold",
                      locked ? "bg-zinc-200 text-zinc-700" : isSubscription ? "bg-black text-white" : "bg-zinc-100 text-zinc-800"
                    )}
                  >
                    {statusLabel(item)}
                  </span>
                </div>
                <p className="mt-2 text-sm font-semibold text-zinc-600">{licenseTypeLabels[item.license_type]}</p>
                {item.ends_at && <p className="mt-1 text-xs font-medium text-zinc-500">만료일 {new Date(item.ends_at).toLocaleDateString("ko-KR")}</p>}
                {locked ? (
                  <div className="mt-auto rounded-[8px] bg-zinc-100 p-3 text-sm font-medium text-zinc-700">
                    {unavailableMessage(item.status)}
                    <Link href={renewalHref(item)} className="license-library-secondary-cta mt-3 inline-flex h-9 w-full items-center justify-center gap-2 rounded-[8px] bg-white px-3 text-sm font-bold text-zinc-950 transition hover:bg-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/15">
                      <RefreshCw className="h-4 w-4" />
                      갱신하기
                    </Link>
                  </div>
                ) : (
                  <Link href={contentHref(item)} className={cn(actionLinkClassName, "mt-auto")}>
                    열기
                    <ArrowUpRight className="h-4 w-4" />
                  </Link>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <div className="rounded-[10px] bg-white p-12 text-center text-sm font-semibold text-zinc-500 shadow-[0_14px_36px_rgba(0,0,0,0.04)]">
          표시할 라이선스 자료가 없습니다.
          {canManageMarketplace && <div className="mt-4">
            <Link href="/marketplace" className={cn(actionLinkClassName, "mx-auto max-w-xs")}>
              마켓플레이스 둘러보기
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>}
        </div>
      )}
    </div>
  );
}
