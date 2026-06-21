"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { ArrowUpRight, BadgeCheck, PackageOpen, Store } from "lucide-react";

import { CreatorProfile, MarketplaceListing, contentTypeLabels, getStore, getStoreListings } from "@/lib/marketplace";

function StoreCover({ store }: { store: CreatorProfile }) {
  if (store.cover_image_url) {
    return <img src={store.cover_image_url} alt="" className="h-44 w-full object-cover" />;
  }

  return (
    <div className="flex h-44 items-center justify-center bg-zinc-100 text-zinc-500">
      <Store className="h-8 w-8" />
    </div>
  );
}

function ListingVisual({ listing }: { listing: MarketplaceListing }) {
  if (listing.thumbnail_url) {
    return <img src={listing.thumbnail_url} alt="" className="mb-4 h-28 w-full rounded-[8px] object-cover" />;
  }

  return (
    <div className="mb-4 flex h-28 items-center justify-center rounded-[8px] bg-zinc-100 text-zinc-500">
      <PackageOpen className="h-6 w-6" />
    </div>
  );
}

export default function StoreDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const resolvedParams = use(params);
  const [store, setStore] = useState<CreatorProfile | null>(null);
  const [listings, setListings] = useState<MarketplaceListing[]>([]);

  useEffect(() => {
    getStore(resolvedParams.slug).then(setStore).catch(() => setStore(null));
    getStoreListings(resolvedParams.slug).then(setListings).catch(() => setListings([]));
  }, [resolvedParams.slug]);

  if (!store) return <div className="rounded-[10px] bg-white py-20 text-center text-sm font-semibold text-zinc-500">스토어를 불러오는 중입니다.</div>;

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[12px] bg-white">
        <StoreCover store={store} />
        <div className="p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-normal text-zinc-950">{store.display_name}</h1>
              <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-zinc-600">{store.bio || "스토어 소개가 준비 중입니다."}</p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold text-zinc-700">
                {store.specialties?.map((item) => <span key={item} className="rounded-full bg-zinc-100 px-2.5 py-1">{item}</span>)}
              </div>
            </div>
            {store.verified_status !== "unverified" && (
              <span className="inline-flex w-fit items-center gap-2 rounded-full bg-black px-3 py-2 text-sm font-bold text-white">
                <BadgeCheck className="h-4 w-4" />
                공식 파트너
              </span>
            )}
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-bold text-zinc-950">등록 콘텐츠</h2>
        {listings.length ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {listings.map((listing) => (
              <Link
                key={listing.id}
                href={`/marketplace/listings/${listing.id}`}
                className="group block rounded-[10px] bg-white p-4 transition hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/15"
              >
                <ListingVisual listing={listing} />
                <p className="text-xs font-bold text-zinc-500">{contentTypeLabels[listing.content_type]}</p>
                <div className="mt-2 flex items-start justify-between gap-3">
                  <h3 className="min-w-0 text-lg font-bold leading-snug text-zinc-950">{listing.title}</h3>
                  <ArrowUpRight className="mt-1 h-4 w-4 shrink-0 text-zinc-500 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-zinc-950" />
                </div>
                <p className="mt-2 line-clamp-2 text-sm font-medium leading-6 text-zinc-600">{listing.description || "등록된 설명이 없습니다."}</p>
              </Link>
            ))}
          </div>
        ) : (
          <div className="rounded-[10px] bg-white p-12 text-center text-sm font-semibold text-zinc-500">
            아직 공개된 콘텐츠가 없습니다.
            <div className="mt-4">
              <Link href="/marketplace" className="inline-flex h-10 items-center justify-center gap-2 rounded-[9px] bg-black px-4 text-sm font-bold text-white transition hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/15">
                마켓플레이스 보기
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
