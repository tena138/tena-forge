"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, BookOpen, LayoutTemplate, Store } from "lucide-react";

import { Button } from "@/components/ui/button";
import { MarketplaceListing, contentTypeLabels, licenseTypeLabels, listMarketplaceListings, pricingTypeLabels } from "@/lib/marketplace";

function ListingCard({ listing }: { listing: MarketplaceListing }) {
  return (
    <Link href={`/marketplace/listings/${listing.id}`} className="block rounded-[10px] border border-white/10 bg-white/[0.045] p-4 transition hover:border-zinc-300/40 hover:bg-white/[0.065]">
      <div className="mb-4 flex h-32 items-center justify-center rounded-md border border-white/10 bg-black/35 text-sm font-semibold text-slate-500">
        {contentTypeLabels[listing.content_type]}
      </div>
      <div className="flex items-center gap-2 text-xs text-zinc-200">
        <span>{contentTypeLabels[listing.content_type]}</span>
        <span>·</span>
        <span>{pricingTypeLabels[listing.pricing_type]}</span>
      </div>
      <h2 className="mt-2 line-clamp-1 text-lg font-bold text-white">{listing.title}</h2>
      <p className="mt-2 line-clamp-2 min-h-10 text-sm leading-5 text-slate-400">{listing.description || listing.subtitle || "등록된 설명이 없습니다."}</p>
      <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-400">
        {listing.subject && <span className="rounded-md border border-white/10 px-2 py-1">{listing.subject}</span>}
        {listing.grade && <span className="rounded-md border border-white/10 px-2 py-1">{listing.grade}</span>}
        <span className="rounded-md border border-white/10 px-2 py-1">{licenseTypeLabels[listing.license_type]}</span>
      </div>
    </Link>
  );
}

export default function MarketplacePage() {
  const [listings, setListings] = useState<MarketplaceListing[]>([]);

  useEffect(() => {
    listMarketplaceListings({ sort: "recent" }).then(setListings).catch(() => setListings([]));
  }, []);

  return (
    <div className="space-y-6">
      <section className="rounded-[14px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(124,58,237,0.24),transparent_34%),rgba(0,0,0,0.46)] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.34)]">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-200">Marketplace</p>
        <h1 className="mt-3 text-3xl font-bold text-white">마켓플레이스</h1>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link href="/marketplace/problem-sets"><Button>문항 세트 마켓</Button></Link>
          <Link href="/templates"><Button variant="outline">인기 템플릿</Button></Link>
          <Link href="/stores"><Button variant="outline">스토어 둘러보기</Button></Link>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        {[
          { href: "/marketplace/problem-sets", label: "추천 문항 세트", icon: Store },
          { href: "/templates", label: "인기 템플릿", icon: LayoutTemplate },
          { href: "/marketplace/books", label: "교재 마켓", icon: BookOpen },
        ].map((item) => (
          <Link key={item.href} href={item.href} className="group flex items-center justify-between rounded-[10px] border border-white/10 bg-white/[0.045] p-4 transition hover:border-zinc-300/40 hover:bg-white/[0.065]">
            <span className="flex items-center gap-3 text-sm font-semibold text-white"><item.icon className="h-4 w-4 text-zinc-200" />{item.label}</span>
            <ArrowRight className="h-4 w-4 text-slate-500 transition group-hover:translate-x-0.5 group-hover:text-zinc-200" />
          </Link>
        ))}
      </section>

      <section className="space-y-3">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-xl font-bold text-white">신규 등록 콘텐츠</h2>
            <p className="text-sm text-slate-400">권리 확인을 거쳐 공개된 마켓 콘텐츠입니다.</p>
          </div>
        </div>
        {listings.length ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{listings.slice(0, 6).map((listing) => <ListingCard key={listing.id} listing={listing} />)}</div>
        ) : (
          <div className="rounded-[10px] border border-white/10 bg-white/[0.045] p-10 text-center text-sm text-slate-400">
            콘텐츠 없음
          </div>
        )}
      </section>
    </div>
  );
}
