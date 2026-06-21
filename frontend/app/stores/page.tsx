"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowUpRight, BadgeCheck, Store } from "lucide-react";

import { CreatorProfile, listStores } from "@/lib/marketplace";

function StoreVisual({ store }: { store: CreatorProfile }) {
  if (store.cover_image_url) {
    return (
      <img
        src={store.cover_image_url}
        alt=""
        className="mb-4 h-28 w-full rounded-[8px] object-cover"
      />
    );
  }

  return (
    <div className="mb-4 flex h-28 items-center justify-center rounded-[8px] bg-zinc-100 text-zinc-500">
      <Store className="h-6 w-6" />
    </div>
  );
}

export default function StoresPage() {
  const [stores, setStores] = useState<CreatorProfile[]>([]);

  useEffect(() => {
    listStores().then(setStores).catch(() => setStores([]));
  }, []);

  return (
    <div className="space-y-6">
      <section className="rounded-[12px] bg-white p-6">
        <h1 className="text-3xl font-bold tracking-normal text-zinc-950">학원 · 강사 스토어</h1>
        <p className="mt-2 text-sm font-medium text-zinc-500">검증된 제작자와 학원 자료를 둘러봅니다.</p>
      </section>

      {stores.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {stores.map((store) => (
            <Link
              key={store.id}
              href={`/stores/${store.slug}`}
              className="group block rounded-[10px] bg-white p-5 transition hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/15"
            >
              <StoreVisual store={store} />
              <div className="flex items-center justify-between gap-3">
                <h2 className="min-w-0 text-lg font-bold leading-snug text-zinc-950">{store.display_name}</h2>
                {store.verified_status !== "unverified" && (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-black px-2.5 py-1 text-[11px] font-bold text-white">
                    <BadgeCheck className="h-3 w-3" />
                    공식
                  </span>
                )}
              </div>
              <p className="mt-2 line-clamp-2 text-sm font-medium leading-6 text-zinc-600">{store.bio || "스토어 소개가 준비 중입니다."}</p>
              <div className="mt-4 flex items-center justify-between gap-3 text-xs font-bold text-zinc-500">
                <span>등록 콘텐츠 {store.listing_count}개 · 팔로워 {store.follower_count}명</span>
                <ArrowUpRight className="h-4 w-4 text-zinc-500 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-zinc-950" />
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="rounded-[10px] bg-white p-12 text-center text-sm font-semibold text-zinc-500">
          아직 등록된 스토어가 없습니다.
          <div className="mt-4">
            <Link
              href="/creator/apply"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-[9px] bg-black px-4 text-sm font-bold text-white transition hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/15"
            >
              내 스토어 준비하기
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
