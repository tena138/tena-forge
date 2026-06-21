"use client";

import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Loader2, PackageOpen, Plus, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createCreatorProduct, listCreatorProducts, Product, submitProductForReview } from "@/lib/saas";

const statusLabels: Record<string, string> = {
  draft: "초안",
  pending_review: "심사 중",
  approved: "판매 가능",
  rejected: "반려됨",
};

function errorMessage(error: unknown, fallback: string) {
  const detail = (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
  return detail || fallback;
}

function formatPrice(value: number) {
  return `${new Intl.NumberFormat("ko-KR").format(value)}원`;
}

export default function CreatorProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [submittingId, setSubmittingId] = useState<string | null>(null);

  async function refresh() {
    try {
      setLoading(true);
      setProducts(await listCreatorProducts());
      setError("");
    } catch (err) {
      setError(errorMessage(err, "승인된 크리에이터만 접근할 수 있습니다."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (creating) return;

    const formElement = event.currentTarget;
    const form = new FormData(formElement);

    setCreating(true);
    setNotice("");
    setError("");
    try {
      await createCreatorProduct({
        title: String(form.get("title") || ""),
        slug: String(form.get("slug") || ""),
        description: String(form.get("description") || ""),
        subject: String(form.get("subject") || ""),
        grade_level: String(form.get("grade_level") || ""),
        price: Number(form.get("price") || 0),
        rights_declared: true,
      });
      formElement.reset();
      setNotice("상품 초안이 만들어졌습니다.");
      await refresh();
    } catch (err) {
      setError(errorMessage(err, "상품 초안을 만들지 못했습니다."));
    } finally {
      setCreating(false);
    }
  }

  async function submitReview(productId: string) {
    if (submittingId) return;

    setSubmittingId(productId);
    setNotice("");
    setError("");
    try {
      await submitProductForReview(productId);
      setNotice("심사 요청이 제출되었습니다.");
      await refresh();
    } catch (err) {
      setError(errorMessage(err, "심사 제출에 실패했습니다."));
    } finally {
      setSubmittingId(null);
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-[14px] bg-white p-6">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">Creator Products</p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-normal text-zinc-950">크리에이터 상품 관리</h1>
            <p className="mt-2 text-sm font-medium text-zinc-500">초안 작성, 심사 제출, 판매 상태를 한 화면에서 관리합니다.</p>
          </div>
          <Link href="/stores" className="inline-flex h-10 items-center gap-2 rounded-[9px] bg-zinc-100 px-4 text-sm font-bold text-zinc-900 transition hover:bg-zinc-200">
            스토어 보기
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {error ? (
        <div className="rounded-[12px] bg-zinc-100 p-5 text-sm font-semibold leading-6 text-zinc-800">
          {error}
          <Link href="/creator/apply" className="mt-3 inline-flex items-center gap-2 font-bold text-zinc-950">
            크리에이터 신청 확인
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
      ) : null}
      {notice ? <p className="rounded-[10px] bg-zinc-100 px-4 py-3 text-sm font-semibold text-zinc-700">{notice}</p> : null}

      <form onSubmit={create} className="grid gap-3 rounded-[14px] bg-white p-5 md:grid-cols-3">
        <Input name="title" placeholder="상품명" required />
        <Input name="slug" placeholder="slug" required />
        <Input name="subject" placeholder="과목" />
        <Input name="grade_level" placeholder="학년" />
        <Input name="price" type="number" placeholder="기본 가격" defaultValue={0} />
        <textarea
          name="description"
          className="min-h-10 rounded-[7px] border-0 bg-zinc-100 px-3 py-2 text-sm font-semibold text-zinc-950 outline-none transition placeholder:text-zinc-500 focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-black/10 md:col-span-1"
          placeholder="설명"
        />
        <Button type="submit" disabled={creating} className="md:col-span-3">
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          {creating ? "초안 생성 중" : "초안 만들기"}
        </Button>
      </form>

      {loading ? (
        <div className="rounded-[14px] bg-white p-10 text-center text-sm font-semibold text-zinc-500">
          <Loader2 className="mx-auto mb-3 h-5 w-5 animate-spin" />
          상품을 불러오는 중입니다.
        </div>
      ) : products.length ? (
        <div className="grid gap-3">
          {products.map((product) => {
            const isSubmitting = submittingId === product.id;
            const canSubmit = product.status === "draft" || product.status === "rejected";
            return (
              <div key={product.id} className="flex flex-col gap-4 rounded-[14px] bg-white p-5 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate text-lg font-bold text-zinc-950">{product.title}</h2>
                    <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-bold text-zinc-700">{statusLabels[product.status] || product.status}</span>
                  </div>
                  <p className="mt-1 text-sm font-medium text-zinc-500">
                    {product.subject || "과목 없음"} · {product.grade_level || "학년 없음"} · {formatPrice(product.price)}
                  </p>
                  {product.description ? <p className="mt-2 line-clamp-2 text-sm leading-6 text-zinc-600">{product.description}</p> : null}
                </div>
                <Button variant={canSubmit ? "default" : "secondary"} disabled={!canSubmit || isSubmitting} onClick={() => submitReview(product.id)}>
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  {isSubmitting ? "제출 중" : canSubmit ? "심사 제출" : statusLabels[product.status] || "처리 중"}
                </Button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-[14px] bg-white p-10 text-center">
          <PackageOpen className="mx-auto h-8 w-8 text-zinc-400" />
          <p className="mt-3 text-sm font-semibold text-zinc-600">아직 등록한 상품이 없습니다.</p>
        </div>
      )}
    </div>
  );
}
