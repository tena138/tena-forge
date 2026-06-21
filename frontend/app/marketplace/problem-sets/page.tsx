"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowUpRight, PackageOpen, Search } from "lucide-react";

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
      <section className="rounded-[12px] bg-white p-6">
        <h1 className="text-3xl font-bold tracking-normal text-zinc-950">문항 세트 마켓</h1>
        <p className="mt-2 text-sm font-medium text-zinc-500">학원 운영에 바로 쓸 수 있는 문항 세트를 검색합니다.</p>
      </section>

      <section className="grid gap-3 rounded-[10px] bg-white p-4 md:grid-cols-[1fr_180px]">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-zinc-500" />
          <Input className="pl-9" value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="제목, 단원, 설명 검색" />
        </label>
        <select
          className="h-10 rounded-[7px] border-0 bg-zinc-100 px-3 text-sm font-semibold text-zinc-950 outline-none transition focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-black/10"
          value={pricingType}
          onChange={(event) => setPricingType(event.target.value)}
        >
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
            <article key={listing.id} className="rounded-[10px] bg-white p-4">
              <div className="mb-4 flex h-36 items-center justify-center rounded-[8px] bg-zinc-100 text-zinc-500">
                <PackageOpen className="h-6 w-6" />
              </div>
              <div className="flex flex-wrap gap-2 text-xs font-bold text-zinc-500">
                {listing.subject && <span>{listing.subject}</span>}
                {listing.grade && <span>· {listing.grade}</span>}
              </div>
              <h2 className="mt-2 text-lg font-bold leading-snug text-zinc-950">{listing.title}</h2>
              <p className="mt-2 line-clamp-2 min-h-10 text-sm font-medium leading-5 text-zinc-600">{listing.description || "등록된 설명이 없습니다."}</p>
              <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold text-zinc-700">
                <span className="rounded-full bg-zinc-100 px-2.5 py-1">{pricingTypeLabels[listing.pricing_type]}</span>
                <span className="rounded-full bg-zinc-100 px-2.5 py-1">{licenseTypeLabels[listing.license_type]}</span>
                <span className="rounded-full bg-zinc-100 px-2.5 py-1">{listing.use_count}회 이용</span>
              </div>
              <Link className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-[9px] bg-black px-4 text-sm font-bold text-white transition hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/15" href={`/marketplace/listings/${listing.id}`}>
                자세히 보기
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-[10px] bg-white p-12 text-center text-sm font-semibold text-zinc-500">조건에 맞는 문항 세트가 없습니다.</div>
      )}
    </div>
  );
}
