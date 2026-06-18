"use client";

import { useEffect, useState } from "react";
import { getBuyerLibrary, ProductLicense } from "@/lib/saas";

export default function PurchasesPage() {
  const [licenses, setLicenses] = useState<ProductLicense[]>([]);
  useEffect(() => {
    getBuyerLibrary().then(setLicenses).catch(() => setLicenses([]));
  }, []);
  return (
    <div className="space-y-6">
      <section className="rounded-[14px] border border-white/10 bg-white/[0.045] p-6">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-200">Library</p>
        <h1 className="mt-2 text-3xl font-bold text-white">구매한 자료</h1>
      </section>
      {licenses.length ? (
        <div className="grid gap-3">
          {licenses.map((license) => (
            <div key={license.id} className="rounded-[10px] border border-white/10 bg-white/[0.045] p-4">
              <h2 className="font-bold text-white">라이선스 {license.id.slice(0, 8)}</h2>
              <p className="mt-1 text-sm text-slate-400">상태 {license.status} · 제품 {license.product_id}</p>
              <p className="mt-3 text-xs leading-5 text-slate-500">{license.terms_snapshot}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-[10px] border border-white/10 bg-white/[0.045] p-10 text-center text-sm text-slate-400">아직 구매한 자료가 없습니다.</div>
      )}
    </div>
  );
}
