"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { adminApproveApplication, adminApproveProduct, adminCreatorApplications, adminOverview, adminProductQueue, CreatorApplication, Product } from "@/lib/saas";

export default function AdminSaasPage() {
  const [overview, setOverview] = useState<Record<string, number>>({});
  const [applications, setApplications] = useState<CreatorApplication[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  async function refresh() {
    setOverview(await adminOverview());
    setApplications(await adminCreatorApplications());
    setProducts(await adminProductQueue());
  }

  useEffect(() => {
    refresh().catch(() => {});
  }, []);

  return (
    <div className="space-y-6">
      <section className="rounded-[14px] border border-white/10 bg-white/[0.045] p-6">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-200">Admin</p>
        <h1 className="mt-2 text-3xl font-bold text-white">SaaS / Marketplace 관리</h1>
      </section>
      <section className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        {Object.entries(overview).map(([key, value]) => (
          <div key={key} className="rounded-[10px] border border-white/10 bg-black/30 p-4">
            <p className="text-xs text-slate-500">{key}</p>
            <p className="mt-2 text-2xl font-bold text-white">{value}</p>
          </div>
        ))}
      </section>
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-[10px] border border-white/10 bg-white/[0.045] p-4">
          <h2 className="font-bold text-white">크리에이터 신청</h2>
          <div className="mt-3 space-y-2">
            {applications.map((application) => (
              <div key={application.id} className="flex items-center justify-between rounded-md border border-white/10 p-3">
                <span className="text-sm text-slate-300">{application.display_name} · {application.status}</span>
                {application.status !== "approved" && <Button size="sm" onClick={() => adminApproveApplication(application.id).then(refresh)}>승인</Button>}
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-[10px] border border-white/10 bg-white/[0.045] p-4">
          <h2 className="font-bold text-white">제품 심사 대기</h2>
          <div className="mt-3 space-y-2">
            {products.map((product) => (
              <div key={product.id} className="flex items-center justify-between rounded-md border border-white/10 p-3">
                <span className="text-sm text-slate-300">{product.title} · {product.status}</span>
                <Button size="sm" onClick={() => adminApproveProduct(product.id).then(refresh)}>승인</Button>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
