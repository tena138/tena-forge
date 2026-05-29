"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { LockKeyhole, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getDashboardAnnouncementAccess } from "@/lib/api";
import { LicenseEntitlement, contentTypeLabels, licenseTypeLabels, listLicensedLibrary } from "@/lib/marketplace";

type LibraryFilter = "all" | "subscription" | "purchased" | "expired";

const filters: Array<{ key: LibraryFilter; label: string }> = [
  { key: "all", label: "전체" },
  { key: "subscription", label: "구독 중" },
  { key: "purchased", label: "구매한 자료" },
  { key: "expired", label: "만료된 자료" },
];

function matchesFilter(item: LicenseEntitlement, filter: LibraryFilter) {
  if (filter === "all") return true;
  if (filter === "expired") return item.status === "expired";
  if (filter === "subscription") return item.status === "active" && item.license_type === "subscription_use";
  return item.status !== "expired" && item.license_type !== "subscription_use";
}

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
      <section className="rounded-[12px] border border-white/10 bg-black/45 p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">라이선스 보관함</h1>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            {filters.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setFilter(item.key)}
                className={`rounded-[8px] border px-3 py-2 text-sm font-semibold transition ${
                  filter === item.key
                    ? "border-cyan-300/50 bg-cyan-300/15 text-cyan-100"
                    : "border-white/10 bg-white/[0.04] text-slate-300 hover:border-white/20 hover:bg-white/[0.07]"
                }`}
              >
                {item.label}
                <span className="ml-2 text-xs text-slate-500">{counts[item.key]}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded-[10px] border border-red-400/20 bg-red-400/10 p-4 text-sm font-medium text-red-100">
          {error}
        </div>
      )}

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map((item) => (
            <div key={item} className="h-72 animate-pulse rounded-[10px] border border-white/10 bg-white/[0.045]" />
          ))}
        </div>
      ) : visibleItems.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visibleItems.map((item) => {
            const locked = item.status === "expired";
            const isSubscription = item.license_type === "subscription_use";
            return (
              <article key={item.id} className={`rounded-[10px] border border-white/10 bg-white/[0.045] p-4 ${locked ? "opacity-70" : ""}`}>
                <div className="mb-4 flex h-32 items-center justify-center rounded-md border border-white/10 bg-black/35 text-sm text-slate-500">
                  {locked ? <LockKeyhole className="h-5 w-5" /> : contentTypeLabels[item.content_type]}
                </div>
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-lg font-bold text-white">{item.listing?.title || item.content_id}</h2>
                  <span className="shrink-0 rounded-full border border-white/10 bg-white/[0.06] px-2 py-1 text-[11px] font-semibold text-slate-300">
                    {locked ? "만료" : isSubscription ? "구독" : "구매"}
                  </span>
                </div>
                <p className="mt-2 text-sm text-slate-400">{licenseTypeLabels[item.license_type]}</p>
                {item.ends_at && <p className="mt-1 text-xs text-slate-500">만료일 {new Date(item.ends_at).toLocaleDateString("ko-KR")}</p>}
                {locked ? (
                  <div className="mt-4 rounded-md border border-amber-400/20 bg-amber-400/10 p-3 text-sm text-amber-100">
                    구독 기간이 만료되어 이 자료를 사용할 수 없습니다.
                    <Button className="mt-3 w-full" size="sm" variant="outline">
                      <RefreshCw className="mr-2 h-4 w-4" />
                      갱신하기
                    </Button>
                  </div>
                ) : (
                  <Button className="mt-4 w-full">열기</Button>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <div className="rounded-[10px] border border-white/10 bg-white/[0.045] p-12 text-center text-sm text-slate-400">
          표시할 라이선스 자료가 없습니다.
          {canManageMarketplace && <div className="mt-4">
            <Link href="/marketplace">
              <Button>마켓플레이스 둘러보기</Button>
            </Link>
          </div>}
        </div>
      )}
    </div>
  );
}
