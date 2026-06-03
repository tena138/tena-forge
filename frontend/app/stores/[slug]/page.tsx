"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { CreatorProfile, MarketplaceListing, contentTypeLabels, getStore, getStoreListings } from "@/lib/marketplace";

export default function StoreDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const resolvedParams = use(params);
  const [store, setStore] = useState<CreatorProfile | null>(null);
  const [listings, setListings] = useState<MarketplaceListing[]>([]);

  useEffect(() => {
    getStore(resolvedParams.slug).then(setStore).catch(() => setStore(null));
    getStoreListings(resolvedParams.slug).then(setListings).catch(() => setListings([]));
  }, [resolvedParams.slug]);

  if (!store) return <div className="py-20 text-center text-sm text-slate-400">스토어를 불러오는 중입니다.</div>;

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[12px] border border-white/10 bg-black/45">
        <div className="h-44 bg-[radial-gradient(circle_at_top_left,rgba(124,58,237,0.28),transparent_34%),rgba(255,255,255,0.04)]" />
        <div className="p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-3xl font-bold text-white">{store.display_name}</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">{store.bio || "스토어 소개가 준비 중입니다."}</p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-400">
                {store.specialties?.map((item) => <span key={item} className="rounded-md border border-white/10 px-2 py-1">{item}</span>)}
              </div>
            </div>
            {store.verified_status !== "unverified" && <span className="rounded-md border border-violet-300/20 bg-violet-300/10 px-3 py-2 text-sm font-semibold text-violet-100">공식 파트너</span>}
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-bold text-white">등록 콘텐츠</h2>
        {listings.length ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {listings.map((listing) => (
              <Link key={listing.id} href={`/marketplace/listings/${listing.id}`} className="rounded-[10px] border border-white/10 bg-white/[0.045] p-4 transition hover:border-violet-300/40 hover:bg-white/[0.065]">
                <p className="text-xs text-violet-200">{contentTypeLabels[listing.content_type]}</p>
                <h3 className="mt-2 text-lg font-bold text-white">{listing.title}</h3>
                <p className="mt-2 line-clamp-2 text-sm text-slate-400">{listing.description || "등록된 설명이 없습니다."}</p>
              </Link>
            ))}
          </div>
        ) : (
          <div className="rounded-[10px] border border-white/10 bg-white/[0.045] p-12 text-center text-sm text-slate-400">
            아직 공개된 콘텐츠가 없습니다.
            <div className="mt-4"><Link href="/marketplace"><Button variant="outline">마켓플레이스 보기</Button></Link></div>
          </div>
        )}
      </section>
    </div>
  );
}
