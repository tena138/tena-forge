"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  MarketplaceListing,
  claimFreeListing,
  contentTypeLabels,
  getMarketplaceListing,
  licenseTypeLabels,
  pricingTypeLabels,
  simulatePermanentLicenseListing,
  simulateSubscribeListing,
} from "@/lib/marketplace";

export default function MarketplaceListingDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [listing, setListing] = useState<MarketplaceListing | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    getMarketplaceListing(params.id).then(setListing).catch(() => setListing(null));
  }, [params.id]);

  async function claim() {
    if (!listing) return;
    if (listing.pricing_type === "subscription") await simulateSubscribeListing(listing.id);
    else if (listing.pricing_type === "permanent") await simulatePermanentLicenseListing(listing.id);
    else await claimFreeListing(listing.id);
    setMessage("라이선스 보관함에 추가되었습니다.");
  }

  if (!listing) return <div className="py-20 text-center text-sm text-slate-400">콘텐츠를 불러오는 중입니다.</div>;

  const actionLabel =
    listing.pricing_type === "subscription" ? "구독하기" :
    listing.pricing_type === "permanent" ? "영구 이용권 받기" :
    listing.pricing_type === "inquiry" ? "문의하기" :
    "무료 이용 시작";

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <section className="space-y-5">
        <div className="rounded-[12px] border border-white/10 bg-black/45 p-6">
          <div className="flex flex-wrap gap-2 text-xs font-semibold text-violet-200">
            <span>{contentTypeLabels[listing.content_type]}</span>
            <span>·</span>
            <span>{pricingTypeLabels[listing.pricing_type]}</span>
          </div>
          <h1 className="mt-3 text-3xl font-bold text-white">{listing.title}</h1>
          {listing.subtitle && <p className="mt-2 text-lg text-slate-300">{listing.subtitle}</p>}
          <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-400">{listing.description || "등록된 상세 설명이 없습니다."}</p>
        </div>

        <div className="rounded-[10px] border border-white/10 bg-white/[0.045] p-6">
          <h2 className="text-lg font-bold text-white">미리보기</h2>
          <div className="mt-4 flex min-h-72 items-center justify-center rounded-md border border-white/10 bg-black/35 text-sm text-slate-500">
            {contentTypeLabels[listing.content_type]} 미리보기 영역
          </div>
        </div>

        <div className="rounded-[10px] border border-violet-300/20 bg-violet-300/10 p-4 text-sm leading-6 text-violet-50">
          <div className="flex items-center gap-2 font-bold"><ShieldCheck className="h-4 w-4" />라이선스 안내</div>
          <p className="mt-2">이 콘텐츠는 구매자에게 소유권이 이전되는 것이 아니라, 표시된 라이선스 조건에 따라 이용 권한이 부여됩니다.</p>
        </div>
      </section>

      <aside className="h-fit rounded-[12px] border border-white/10 bg-white/[0.045] p-5">
        <dl className="space-y-3 text-sm">
          <div className="flex justify-between gap-4"><dt className="text-slate-500">라이선스</dt><dd className="font-semibold text-white">{licenseTypeLabels[listing.license_type]}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-slate-500">가격 유형</dt><dd className="font-semibold text-white">{pricingTypeLabels[listing.pricing_type]}</dd></div>
          {listing.subject && <div className="flex justify-between gap-4"><dt className="text-slate-500">과목</dt><dd className="font-semibold text-white">{listing.subject}</dd></div>}
          {listing.grade && <div className="flex justify-between gap-4"><dt className="text-slate-500">학년</dt><dd className="font-semibold text-white">{listing.grade}</dd></div>}
          {listing.unit && <div className="flex justify-between gap-4"><dt className="text-slate-500">단원</dt><dd className="font-semibold text-white">{listing.unit}</dd></div>}
        </dl>
        <Button className="mt-5 w-full" onClick={claim}>{actionLabel}</Button>
        {message && (
          <div className="mt-3 rounded-md border border-emerald-400/20 bg-emerald-400/10 p-3 text-sm text-emerald-100">
            {message}
            <Button className="mt-3 w-full" size="sm" variant="outline" onClick={() => router.push("/licensed-library")}>라이선스 보관함 보기</Button>
          </div>
        )}
      </aside>
    </div>
  );
}
