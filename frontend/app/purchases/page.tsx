"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, BookOpenCheck, Library, Loader2 } from "lucide-react";

import { getBuyerLibrary, ProductLicense } from "@/lib/saas";

const licenseStatusLabels: Record<string, string> = {
  active: "사용 가능",
  expired: "만료됨",
  revoked: "회수됨",
};

export default function PurchasesPage() {
  const [licenses, setLicenses] = useState<ProductLicense[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getBuyerLibrary()
      .then(setLicenses)
      .catch(() => setLicenses([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-5">
      <section className="rounded-[14px] bg-white p-6">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">Library</p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-normal text-zinc-950">구매한 자료</h1>
            <p className="mt-2 text-sm font-medium text-zinc-500">구매한 라이선스와 이용 상태를 확인합니다.</p>
          </div>
          <Link href="/stores" className="inline-flex h-10 items-center gap-2 rounded-[9px] bg-black px-4 text-sm font-bold text-white transition hover:bg-zinc-800">
            스토어로 이동
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {loading ? (
        <div className="rounded-[14px] bg-white p-10 text-center text-sm font-semibold text-zinc-500">
          <Loader2 className="mx-auto mb-3 h-5 w-5 animate-spin" />
          구매 자료를 불러오는 중입니다.
        </div>
      ) : licenses.length ? (
        <div className="grid gap-3">
          {licenses.map((license) => (
            <div key={license.id} className="rounded-[14px] bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <BookOpenCheck className="h-5 w-5 text-zinc-600" />
                    <h2 className="truncate text-lg font-bold text-zinc-950">라이선스 {license.id.slice(0, 8)}</h2>
                  </div>
                  <p className="mt-2 text-sm font-medium text-zinc-500">
                    제품 {license.product_id} · 주문 {license.order_id}
                  </p>
                </div>
                <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-bold text-zinc-700">
                  {licenseStatusLabels[license.status] || license.status}
                </span>
              </div>
              <p className="mt-4 rounded-[10px] bg-zinc-100 p-3 text-xs font-medium leading-5 text-zinc-600">{license.terms_snapshot}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-[14px] bg-white p-10 text-center">
          <Library className="mx-auto h-8 w-8 text-zinc-400" />
          <p className="mt-3 text-sm font-semibold text-zinc-600">아직 구매한 자료가 없습니다.</p>
          <Link href="/stores" className="mt-4 inline-flex h-10 items-center justify-center rounded-[9px] bg-zinc-100 px-4 text-sm font-bold text-zinc-900 transition hover:bg-zinc-200">
            스토어 둘러보기
          </Link>
        </div>
      )}
    </div>
  );
}
