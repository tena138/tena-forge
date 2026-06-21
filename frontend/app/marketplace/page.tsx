"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, ArrowUpRight, BookOpen, LayoutTemplate, PackageOpen, Store } from "lucide-react";

import { MarketplaceListing, contentTypeLabels, licenseTypeLabels, listMarketplaceListings, pricingTypeLabels } from "@/lib/marketplace";

function ListingCard({ listing }: { listing: MarketplaceListing }) {
  return (
    <Link
      href={`/marketplace/listings/${listing.id}`}
      className="group block rounded-[10px] bg-white p-4 transition hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/15"
    >
      <div className="mb-4 flex h-32 items-center justify-center rounded-[8px] bg-zinc-100 text-zinc-500">
        <PackageOpen className="h-6 w-6" />
      </div>
      <div className="flex items-center gap-2 text-xs font-bold text-zinc-500">
        <span>{contentTypeLabels[listing.content_type]}</span>
        <span>·</span>
        <span>{pricingTypeLabels[listing.pricing_type]}</span>
      </div>
      <div className="mt-2 flex items-start justify-between gap-3">
        <h2 className="min-w-0 line-clamp-1 text-lg font-bold text-zinc-950">{listing.title}</h2>
        <ArrowUpRight className="mt-1 h-4 w-4 shrink-0 text-zinc-500 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-zinc-950" />
      </div>
      <p className="mt-2 line-clamp-2 min-h-10 text-sm font-medium leading-5 text-zinc-600">{listing.description || listing.subtitle || "등록된 설명이 없습니다."}</p>
      <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold text-zinc-700">
        {listing.subject && <span className="rounded-full bg-zinc-100 px-2.5 py-1">{listing.subject}</span>}
        {listing.grade && <span className="rounded-full bg-zinc-100 px-2.5 py-1">{listing.grade}</span>}
        <span className="rounded-full bg-zinc-100 px-2.5 py-1">{licenseTypeLabels[listing.license_type]}</span>
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
      <section className="rounded-[14px] bg-white p-6">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">Marketplace</p>
        <h1 className="mt-3 text-3xl font-bold tracking-normal text-zinc-950">마켓플레이스</h1>
        <p className="mt-2 text-sm font-medium text-zinc-500">권리 확인을 거친 자료와 템플릿을 둘러봅니다.</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link href="/marketplace/problem-sets" className="inline-flex h-10 items-center justify-center gap-2 rounded-[9px] bg-black px-4 text-sm font-bold text-white transition hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/15">
            문항 세트 마켓
            <ArrowUpRight className="h-4 w-4" />
          </Link>
          <Link href="/templates" className="inline-flex h-10 items-center justify-center gap-2 rounded-[9px] bg-zinc-100 px-4 text-sm font-bold text-zinc-950 transition hover:bg-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/15">
            인기 템플릿
            <ArrowUpRight className="h-4 w-4" />
          </Link>
          <Link href="/stores" className="inline-flex h-10 items-center justify-center gap-2 rounded-[9px] bg-zinc-100 px-4 text-sm font-bold text-zinc-950 transition hover:bg-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/15">
            스토어 둘러보기
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        {[
          { href: "/marketplace/problem-sets", label: "추천 문항 세트", icon: Store },
          { href: "/templates", label: "인기 템플릿", icon: LayoutTemplate },
          { href: "/marketplace/books", label: "교재 마켓", icon: BookOpen },
        ].map((item) => (
          <Link key={item.href} href={item.href} className="group flex items-center justify-between rounded-[10px] bg-white p-4 transition hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/15">
            <span className="flex items-center gap-3 text-sm font-bold text-zinc-950"><item.icon className="h-4 w-4 text-zinc-500" />{item.label}</span>
            <ArrowRight className="h-4 w-4 text-zinc-500 transition group-hover:translate-x-0.5 group-hover:text-zinc-950" />
          </Link>
        ))}
      </section>

      <section className="space-y-3">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-xl font-bold text-zinc-950">신규 등록 콘텐츠</h2>
            <p className="text-sm font-medium text-zinc-500">권리 확인을 거쳐 공개된 마켓 콘텐츠입니다.</p>
          </div>
        </div>
        {listings.length ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{listings.slice(0, 6).map((listing) => <ListingCard key={listing.id} listing={listing} />)}</div>
        ) : (
          <div className="rounded-[10px] bg-white p-10 text-center text-sm font-semibold text-zinc-500">
            콘텐츠 없음
          </div>
        )}
      </section>
    </div>
  );
}
