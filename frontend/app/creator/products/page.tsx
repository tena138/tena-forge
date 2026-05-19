"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createCreatorProduct, listCreatorProducts, Product, submitProductForReview } from "@/lib/saas";

export default function CreatorProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState("");

  async function refresh() {
    try {
      setProducts(await listCreatorProducts());
      setError("");
    } catch (err: any) {
      setError(err?.response?.data?.detail || "승인된 크리에이터만 접근할 수 있습니다.");
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await createCreatorProduct({
      title: String(form.get("title") || ""),
      slug: String(form.get("slug") || ""),
      description: String(form.get("description") || ""),
      subject: String(form.get("subject") || ""),
      grade_level: String(form.get("grade_level") || ""),
      price: Number(form.get("price") || 0),
      rights_declared: true,
    });
    event.currentTarget.reset();
    refresh();
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[14px] border border-white/10 bg-white/[0.045] p-6">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-violet-200">Creator Products</p>
        <h1 className="mt-2 text-3xl font-bold text-white">크리에이터 상품 관리</h1>
        <p className="mt-2 text-sm text-slate-400">초안 생성 후 라이선스 티어와 파일을 붙이고 관리자 심사를 거쳐 게시합니다.</p>
      </section>
      {error ? (
        <div className="rounded-[10px] border border-red-400/20 bg-red-500/10 p-5 text-sm text-red-100">{error}</div>
      ) : (
        <>
          <form onSubmit={create} className="grid gap-3 rounded-[10px] border border-white/10 bg-black/25 p-4 md:grid-cols-3">
            <Input name="title" placeholder="상품명" required />
            <Input name="slug" placeholder="slug" required />
            <Input name="subject" placeholder="과목" />
            <Input name="grade_level" placeholder="학년" />
            <Input name="price" type="number" placeholder="기본 가격" defaultValue={0} />
            <Input name="description" placeholder="설명" />
            <Button type="submit">초안 만들기</Button>
          </form>
          <div className="grid gap-3">
            {products.map((product) => (
              <div key={product.id} className="flex items-center justify-between rounded-[10px] border border-white/10 bg-white/[0.045] p-4">
                <div>
                  <h2 className="font-bold text-white">{product.title}</h2>
                  <p className="text-sm text-slate-400">{product.status} · {product.subject || "과목 없음"} · {product.price.toLocaleString()}원</p>
                </div>
                <Button variant="outline" onClick={() => submitProductForReview(product.id).then(refresh)}>심사 제출</Button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
