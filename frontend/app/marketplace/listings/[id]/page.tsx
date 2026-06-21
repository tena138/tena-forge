"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PackageOpen, ShieldCheck } from "lucide-react";

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

export default function MarketplaceListingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const router = useRouter();
  const [listing, setListing] = useState<MarketplaceListing | null>(null);
  const [message, setMessage] = useState("");
  const [claiming, setClaiming] = useState(false);

  useEffect(() => {
    getMarketplaceListing(resolvedParams.id).then(setListing).catch(() => setListing(null));
  }, [resolvedParams.id]);

  async function claim() {
    if (!listing || claiming) return;
    if (listing.pricing_type === "inquiry") {
      setMessage("문의가 필요한 상품입니다. 스토어 또는 판매자 정보에서 문의 절차를 확인해 주세요.");
      return;
    }
    setClaiming(true);
    setMessage("");
    try {
      if (listing.pricing_type === "subscription") await simulateSubscribeListing(listing.id);
      else if (listing.pricing_type === "permanent") await simulatePermanentLicenseListing(listing.id);
      else await claimFreeListing(listing.id);
      setMessage("라이선스 보관함에 추가되었습니다.");
    } catch {
      setMessage("라이선스를 추가하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setClaiming(false);
    }
  }

  if (!listing) return <div className="rounded-[10px] bg-white py-20 text-center text-sm font-semibold text-zinc-500">콘텐츠를 불러오는 중입니다.</div>;

  const actionLabel =
    listing.pricing_type === "subscription" ? "구독하기" :
    listing.pricing_type === "permanent" ? "영구 이용권 받기" :
    listing.pricing_type === "inquiry" ? "문의하기" :
    "무료 이용 시작";

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <section className="space-y-5">
        <div className="rounded-[12px] bg-white p-6">
          <div className="flex flex-wrap gap-2 text-xs font-bold text-zinc-500">
            <span>{contentTypeLabels[listing.content_type]}</span>
            <span>·</span>
            <span>{pricingTypeLabels[listing.pricing_type]}</span>
          </div>
          <h1 className="mt-3 text-3xl font-bold tracking-normal text-zinc-950">{listing.title}</h1>
          {listing.subtitle && <p className="mt-2 text-lg font-semibold text-zinc-700">{listing.subtitle}</p>}
          <p className="mt-4 max-w-3xl text-sm font-medium leading-6 text-zinc-600">{listing.description || "등록된 상세 설명이 없습니다."}</p>
        </div>

        <div className="rounded-[10px] bg-white p-6">
          <h2 className="text-lg font-bold text-zinc-950">미리보기</h2>
          <div className="mt-4 flex min-h-72 flex-col items-center justify-center gap-3 rounded-[8px] bg-zinc-100 text-sm font-semibold text-zinc-500">
            <PackageOpen className="h-7 w-7" />
            <span>{contentTypeLabels[listing.content_type]} 미리보기 영역</span>
          </div>
        </div>

        <div className="rounded-[10px] bg-zinc-100 p-4 text-sm font-medium leading-6 text-zinc-700">
          <div className="flex items-center gap-2 font-bold text-zinc-950"><ShieldCheck className="h-4 w-4" />라이선스 안내</div>
          <p className="mt-2">이 콘텐츠는 구매자에게 소유권이 이전되는 것이 아니라, 표시된 라이선스 조건에 따라 이용 권한이 부여됩니다.</p>
        </div>
      </section>

      <aside className="h-fit rounded-[12px] bg-white p-5">
        <dl className="space-y-3 text-sm">
          <div className="flex justify-between gap-4"><dt className="font-medium text-zinc-500">라이선스</dt><dd className="font-bold text-zinc-950">{licenseTypeLabels[listing.license_type]}</dd></div>
          <div className="flex justify-between gap-4"><dt className="font-medium text-zinc-500">가격 유형</dt><dd className="font-bold text-zinc-950">{pricingTypeLabels[listing.pricing_type]}</dd></div>
          {listing.subject && <div className="flex justify-between gap-4"><dt className="font-medium text-zinc-500">과목</dt><dd className="font-bold text-zinc-950">{listing.subject}</dd></div>}
          {listing.grade && <div className="flex justify-between gap-4"><dt className="font-medium text-zinc-500">학년</dt><dd className="font-bold text-zinc-950">{listing.grade}</dd></div>}
          {listing.unit && <div className="flex justify-between gap-4"><dt className="font-medium text-zinc-500">단원</dt><dd className="font-bold text-zinc-950">{listing.unit}</dd></div>}
        </dl>
        <Button className="mt-5 w-full" onClick={claim} disabled={claiming}>{claiming ? "처리 중" : actionLabel}</Button>
        {message && (
          <div className="mt-3 rounded-[8px] bg-zinc-100 p-3 text-sm font-semibold text-zinc-700">
            {message}
            <Button className="mt-3 w-full" size="sm" variant="outline" onClick={() => router.push("/licensed-library")}>라이선스 보관함 보기</Button>
          </div>
        )}
      </aside>
    </div>
  );
}
