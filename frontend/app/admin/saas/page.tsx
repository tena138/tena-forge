"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  adminApproveApplication,
  adminApproveProduct,
  adminCreatorApplications,
  adminOverview,
  adminProductQueue,
  adminRejectApplication,
  adminRejectProduct,
  CreatorApplication,
  Product,
} from "@/lib/saas";

type ActingState = {
  type: "application" | "product";
  id: string;
  action: "approve" | "reject";
} | null;

const statusLabels: Record<string, string> = {
  pending: "대기",
  pending_review: "심사 중",
  approved: "승인됨",
  rejected: "반려됨",
};

function displayStatus(status: string) {
  return statusLabels[status] || status;
}

export default function AdminSaasPage() {
  const [overview, setOverview] = useState<Record<string, number>>({});
  const [applications, setApplications] = useState<CreatorApplication[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<ActingState>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function refresh() {
    setLoading(true);
    try {
      const [nextOverview, nextApplications, nextProducts] = await Promise.all([
        adminOverview(),
        adminCreatorApplications(),
        adminProductQueue(),
      ]);
      setOverview(nextOverview);
      setApplications(nextApplications);
      setProducts(nextProducts);
      setError("");
    } catch {
      setError("관리 데이터를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function approveApplication(application: CreatorApplication) {
    setActing({ type: "application", id: application.id, action: "approve" });
    setNotice("");
    setError("");
    try {
      await adminApproveApplication(application.id);
      setNotice(`${application.display_name} 신청을 승인했습니다.`);
      await refresh();
    } catch {
      setError("크리에이터 신청을 승인하지 못했습니다.");
    } finally {
      setActing(null);
    }
  }

  async function rejectApplication(application: CreatorApplication) {
    const reason = window.prompt("반려 사유를 입력해주세요.", "판매 권리 또는 정산 정보 확인이 필요합니다.");
    if (!reason) return;
    setActing({ type: "application", id: application.id, action: "reject" });
    setNotice("");
    setError("");
    try {
      await adminRejectApplication(application.id, reason);
      setNotice(`${application.display_name} 신청을 반려했습니다.`);
      await refresh();
    } catch {
      setError("크리에이터 신청을 반려하지 못했습니다.");
    } finally {
      setActing(null);
    }
  }

  async function approveProduct(product: Product) {
    setActing({ type: "product", id: product.id, action: "approve" });
    setNotice("");
    setError("");
    try {
      await adminApproveProduct(product.id);
      setNotice(`${product.title} 제품을 승인했습니다.`);
      await refresh();
    } catch {
      setError("제품을 승인하지 못했습니다.");
    } finally {
      setActing(null);
    }
  }

  async function rejectProduct(product: Product) {
    const reason = window.prompt("반려 사유를 입력해주세요.", "콘텐츠 정보 또는 판매 권리 확인이 필요합니다.");
    if (!reason) return;
    setActing({ type: "product", id: product.id, action: "reject" });
    setNotice("");
    setError("");
    try {
      await adminRejectProduct(product.id, reason);
      setNotice(`${product.title} 제품을 반려했습니다.`);
      await refresh();
    } catch {
      setError("제품을 반려하지 못했습니다.");
    } finally {
      setActing(null);
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-[14px] bg-white p-6">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">Admin</p>
        <h1 className="mt-2 text-3xl font-bold tracking-normal text-zinc-950">SaaS / Marketplace 관리</h1>
        <p className="mt-2 text-sm font-medium text-zinc-500">크리에이터 승인과 제품 심사를 한 화면에서 처리합니다.</p>
      </section>

      {notice ? <p className="rounded-[10px] bg-zinc-100 px-4 py-3 text-sm font-semibold text-zinc-700">{notice}</p> : null}
      {error ? <p className="rounded-[10px] bg-zinc-100 px-4 py-3 text-sm font-semibold text-zinc-950">{error}</p> : null}

      <section className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        {Object.entries(overview).map(([key, value]) => (
          <div key={key} className="rounded-[14px] bg-white p-4">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-zinc-500">{key}</p>
            <p className="mt-2 text-2xl font-bold text-zinc-950">{value}</p>
          </div>
        ))}
        {loading && !Object.keys(overview).length ? (
          <div className="rounded-[14px] bg-white p-4 text-sm font-semibold text-zinc-500 md:col-span-3 xl:col-span-6">
            <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
            관리 데이터를 불러오는 중입니다.
          </div>
        ) : null}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-[14px] bg-white p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-zinc-950">크리에이터 신청</h2>
            <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-bold text-zinc-600">{applications.length}건</span>
          </div>
          <div className="mt-4 space-y-2">
            {applications.length ? applications.map((application) => {
              const approving = acting?.type === "application" && acting.id === application.id && acting.action === "approve";
              const rejecting = acting?.type === "application" && acting.id === application.id && acting.action === "reject";
              const final = application.status === "approved" || application.status === "rejected";
              return (
                <div key={application.id} className="flex flex-col gap-3 rounded-[12px] bg-zinc-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-zinc-950">{application.display_name}</p>
                    <p className="mt-1 text-xs font-semibold text-zinc-500">{application.email} · {displayStatus(application.status)}</p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button size="sm" disabled={final || Boolean(acting)} onClick={() => approveApplication(application)}>
                      {approving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                      승인
                    </Button>
                    <Button size="sm" variant="secondary" disabled={final || Boolean(acting)} onClick={() => rejectApplication(application)}>
                      {rejecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                      반려
                    </Button>
                  </div>
                </div>
              );
            }) : (
              <p className="rounded-[12px] bg-zinc-50 p-6 text-center text-sm font-semibold text-zinc-500">검토할 신청이 없습니다.</p>
            )}
          </div>
        </div>

        <div className="rounded-[14px] bg-white p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-zinc-950">제품 심사 대기</h2>
            <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-bold text-zinc-600">{products.length}건</span>
          </div>
          <div className="mt-4 space-y-2">
            {products.length ? products.map((product) => {
              const approving = acting?.type === "product" && acting.id === product.id && acting.action === "approve";
              const rejecting = acting?.type === "product" && acting.id === product.id && acting.action === "reject";
              const final = product.status === "approved" || product.status === "rejected";
              return (
                <div key={product.id} className="flex flex-col gap-3 rounded-[12px] bg-zinc-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-zinc-950">{product.title}</p>
                    <p className="mt-1 text-xs font-semibold text-zinc-500">{product.subject || "과목 없음"} · {displayStatus(product.status)}</p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button size="sm" disabled={final || Boolean(acting)} onClick={() => approveProduct(product)}>
                      {approving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                      승인
                    </Button>
                    <Button size="sm" variant="secondary" disabled={final || Boolean(acting)} onClick={() => rejectProduct(product)}>
                      {rejecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                      반려
                    </Button>
                  </div>
                </div>
              );
            }) : (
              <p className="rounded-[12px] bg-zinc-50 p-6 text-center text-sm font-semibold text-zinc-500">심사 대기 제품이 없습니다.</p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
