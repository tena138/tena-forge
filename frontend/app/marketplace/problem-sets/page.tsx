"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MarketplaceListing, licenseTypeLabels, listMarketplaceListings, pricingTypeLabels } from "@/lib/marketplace";

export default function ProblemSetMarketPage() {
  const [listings, setListings] = useState<MarketplaceListing[]>([]);
  const [keyword, setKeyword] = useState("");
  const [pricingType, setPricingType] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      listMarketplaceListings({
        content_type: "problem_set",
        keyword: keyword || undefined,
        pricing_type: pricingType || undefined,
        sort: "recent",
      }).then(setListings).catch(() => setListings([]));
    }, 180);
    return () => window.clearTimeout(timer);
  }, [keyword, pricingType]);

  return (
    <div className="space-y-6">
      <section className="rounded-[12px] border border-white/10 bg-black/45 p-6">
        <h1 className="text-3xl font-bold text-white">문항 세트 마켓</h1>
      </section>

      <section className="grid gap-3 rounded-[10px] border border-white/10 bg-white/[0.045] p-4 md:grid-cols-[1fr_180px]">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-500" />
          <Input className="pl-9" value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="제목, 단원, 설명 검색" />
        </label>
        <select className="h-10 rounded-md border border-white/10 bg-white/[0.04] px-3 text-sm text-white" value={pricingType} onChange={(event) => setPricingType(event.target.value)}>
          <option value="">전체 가격 유형</option>
          <option value="free">무료</option>
          <option value="subscription">구독</option>
          <option value="permanent">영구 이용권</option>
          <option value="inquiry">문의</option>
        </select>
      </section>

      {listings.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {listings.map((listing) => (
            <article key={listing.id} className="rounded-[10px] border border-white/10 bg-white/[0.045] p-4">
              <div className="mb-4 flex h-36 items-center justify-center rounded-md border border-white/10 bg-black/35 text-sm text-slate-500">문항 세트</div>
              <div className="flex flex-wrap gap-2 text-xs text-zinc-200">
                {listing.subject && <span>{listing.subject}</span>}
                {listing.grade && <span>· {listing.grade}</span>}
              </div>
              <h2 className="mt-2 text-lg font-bold text-white">{listing.title}</h2>
              <p className="mt-2 line-clamp-2 min-h-10 text-sm leading-5 text-slate-400">{listing.description || "등록된 설명이 없습니다."}</p>
              <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-400">
                <span className="rounded-md border border-white/10 px-2 py-1">{pricingTypeLabels[listing.pricing_type]}</span>
                <span className="rounded-md border border-white/10 px-2 py-1">{licenseTypeLabels[listing.license_type]}</span>
                <span className="rounded-md border border-white/10 px-2 py-1">{listing.use_count}회 이용</span>
              </div>
              <Link className="mt-4 block" href={`/marketplace/listings/${listing.id}`}>
                <Button className="w-full">자세히 보기</Button>
              </Link>
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-[10px] border border-white/10 bg-white/[0.045] p-12 text-center text-sm text-slate-400">조건에 맞는 문항 세트가 없습니다.</div>
      )}
    </div>
  );
}
