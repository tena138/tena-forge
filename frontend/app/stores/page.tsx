"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { CreatorProfile, listStores } from "@/lib/marketplace";

export default function StoresPage() {
  const [stores, setStores] = useState<CreatorProfile[]>([]);

  useEffect(() => {
    listStores().then(setStores).catch(() => setStores([]));
  }, []);

  return (
    <div className="space-y-6">
      <section className="rounded-[12px] border border-white/10 bg-black/45 p-6">
        <h1 className="text-3xl font-bold text-white">학원 · 강사 스토어</h1>
      </section>

      {stores.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {stores.map((store) => (
            <Link key={store.id} href={`/stores/${store.slug}`} className="rounded-[10px] border border-white/10 bg-white/[0.045] p-5 transition hover:border-zinc-300/40 hover:bg-white/[0.065]">
              <div className="mb-4 h-28 rounded-md border border-white/10 bg-black/35" />
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-bold text-white">{store.display_name}</h2>
                {store.verified_status !== "unverified" && <span className="rounded-md border border-zinc-300/20 bg-zinc-300/10 px-2 py-1 text-xs text-zinc-100">공식 파트너</span>}
              </div>
              <p className="mt-2 line-clamp-2 text-sm text-slate-400">{store.bio || "스토어 소개가 준비 중입니다."}</p>
              <p className="mt-4 text-xs text-slate-500">등록 콘텐츠 {store.listing_count}개 · 팔로워 {store.follower_count}명</p>
            </Link>
          ))}
        </div>
      ) : (
        <div className="rounded-[10px] border border-white/10 bg-white/[0.045] p-12 text-center text-sm text-slate-400">
          아직 등록된 스토어가 없습니다.
          <div className="mt-4"><Button variant="outline">내 스토어 준비하기</Button></div>
        </div>
      )}
    </div>
  );
}
