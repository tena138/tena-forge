"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, MessageSquareText, RefreshCw, UserX, WalletCards, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatLocalDateTime } from "@/lib/datetime";
import {
  type TuitionDashboard,
  type TuitionPayment,
  confirmTuitionPaid,
  listTuitionPayments,
  sendTuitionReminder,
  updateTuitionEventCount,
  updateTuitionSessionAdjustment,
} from "@/lib/studentManagement";
import { cn } from "@/lib/utils";

const statusLabel: Record<string, string> = {
  pending: "확인 대기",
  reminded: "문자 발송",
  paid: "결제 완료",
  excluded: "회차 제외",
};

const statusClass: Record<string, string> = {
  pending: "border-zinc-200 bg-zinc-100 text-zinc-800",
  reminded: "border-zinc-300 bg-white text-zinc-950",
  paid: "border-zinc-300 bg-black text-white",
  excluded: "border-zinc-200 bg-zinc-50 text-zinc-500",
};

function formatDate(value?: string | null) {
  return formatLocalDateTime(value, {
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  }, "-");
}

function formatAmount(value?: number | null) {
  if (value === null || value === undefined) return "금액 미입력";
  return `${new Intl.NumberFormat("ko-KR").format(value)}원`;
}

function tuitionRange(payment: TuitionPayment) {
  if (payment.cycle_start_session === payment.cycle_end_session) {
    return `${payment.cycle_start_session}회차`;
  }
  return `${payment.cycle_start_session}-${payment.cycle_end_session}회차`;
}

function metricItems(summary: TuitionDashboard["summary"]) {
  return [
    { label: "확인 대기", value: summary.pending_count, tone: "text-zinc-950" },
    { label: "연체", value: summary.overdue_count, tone: "text-zinc-950" },
    { label: "문자 발송", value: summary.reminded_count, tone: "text-zinc-950" },
  ];
}

export default function TuitionManagementPage() {
  const [dashboard, setDashboard] = useState<TuitionDashboard | null>(null);
  const [daysAhead, setDaysAhead] = useState("14");
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState("");
  const [message, setMessage] = useState("");

  const rawPayments = dashboard?.payments;
  const payments = useMemo(() => rawPayments || [], [rawPayments]);
  const activePayments = useMemo(
    () => payments.filter((payment) => payment.status !== "paid" && payment.status !== "excluded"),
    [payments]
  );

  async function refresh(nextDays = daysAhead) {
    setLoading(true);
    try {
      const parsedDays = Number(nextDays);
      const result = await listTuitionPayments(Number.isFinite(parsedDays) && parsedDays > 0 ? parsedDays : 14);
      setDashboard(result);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "수강료 알림을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function updatePayment(payment: TuitionPayment) {
    setDashboard((current) =>
      current
        ? {
            ...current,
            payments: current.payments.map((row) => (row.id === payment.id ? payment : row)),
          }
        : current
    );
  }

  async function markPaid(payment: TuitionPayment) {
    setBusyKey(`paid:${payment.id}`);
    try {
      const updated = await confirmTuitionPaid(payment.id);
      await updatePayment(updated);
      setMessage(`${payment.student_name} 결제를 확인했습니다.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "결제 확인에 실패했습니다.");
    } finally {
      setBusyKey("");
    }
  }

  async function remind(payment: TuitionPayment) {
    setBusyKey(`remind:${payment.id}`);
    try {
      const result = await sendTuitionReminder(payment.id);
      await updatePayment(result.payment);
      setMessage(`${payment.student_name} 보호자에게 보낼 메시지를 열었습니다.`);
      window.location.href = result.sms_url;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "문자 메시지를 만들지 못했습니다.");
    } finally {
      setBusyKey("");
    }
  }

  async function excludeClassSession(payment: TuitionPayment) {
    if (!payment.due_event_id) return;
    setBusyKey(`event:${payment.id}`);
    try {
      await updateTuitionEventCount(payment.due_event_id, false);
      await refresh();
      setMessage(`${payment.event_title || "수업"}을 수강료 회차에서 제외했습니다.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "수업 회차 제외에 실패했습니다.");
    } finally {
      setBusyKey("");
    }
  }

  async function excludeStudentSession(payment: TuitionPayment) {
    if (!payment.due_event_id) return;
    setBusyKey(`student:${payment.id}`);
    try {
      await updateTuitionSessionAdjustment(payment.due_event_id, payment.student_membership_id, {
        counts_for_tuition: false,
        reason: "excused_absence",
      });
      await refresh();
      setMessage(`${payment.student_name} 인정 결석을 수강료 회차에서 제외했습니다.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "학생별 회차 제외에 실패했습니다.");
    } finally {
      setBusyKey("");
    }
  }

  return (
    <div className="text-zinc-950">
      <div className="mx-auto flex max-w-7xl flex-col gap-5">
        <div className="flex flex-col gap-4 pb-2 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-[7px] bg-zinc-100 text-zinc-950">
                <WalletCards className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-zinc-950">수강료 관리</h1>
                <p className="text-sm text-zinc-500">첫 회차 시작 전 결제 확인</p>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              className="w-28"
              inputMode="numeric"
              value={daysAhead}
              onChange={(event) => setDaysAhead(event.target.value)}
              aria-label="조회 기간"
            />
            <Button type="button" variant="outline" onClick={() => refresh()} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              새로고침
            </Button>
          </div>
        </div>

        {message ? (
          <div className="rounded-[7px] bg-white px-4 py-3 text-sm font-semibold text-zinc-700">
            {message}
          </div>
        ) : null}

        <section className="grid gap-3 md:grid-cols-3">
          {metricItems(dashboard?.summary || { pending_count: 0, overdue_count: 0, reminded_count: 0 }).map((item) => (
            <Card key={item.label} className="bg-white">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-zinc-500">{item.label}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className={cn("text-3xl font-semibold", item.tone)}>{item.value}</p>
              </CardContent>
            </Card>
          ))}
        </section>

        <section className="space-y-3">
          {loading ? (
            <div className="flex min-h-56 items-center justify-center rounded-[7px] bg-white text-sm font-semibold text-zinc-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              불러오는 중
            </div>
          ) : null}

          {!loading && !payments.length ? (
            <div className="flex min-h-56 items-center justify-center rounded-[7px] bg-white text-sm font-semibold text-zinc-500">
              예정된 수강료 알림이 없습니다.
            </div>
          ) : null}

          {!loading && payments.length ? (
            <div className="flex items-center justify-between gap-3 text-sm font-semibold text-zinc-500">
              <span>활성 알림 {activePayments.length}건</span>
              <span>전체 {payments.length}건</span>
            </div>
          ) : null}

          {payments.map((payment) => {
            const inactive = payment.status === "paid" || payment.status === "excluded";
            const canExclude = Boolean(payment.due_event_id) && !inactive;
            return (
              <article key={payment.id} className="rounded-[7px] bg-white p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-semibold text-zinc-950">{payment.student_name}</h2>
                      <Badge variant="outline" className={cn("border", statusClass[payment.status] || statusClass.pending)}>
                        {statusLabel[payment.status] || payment.status}
                      </Badge>
                      {payment.reminder_count ? <Badge variant="outline" className="border border-zinc-200 bg-zinc-100 text-zinc-700">문자 {payment.reminder_count}회</Badge> : null}
                    </div>
                    <div className="grid gap-2 text-sm font-medium text-zinc-700 sm:grid-cols-2 xl:grid-cols-4">
                      <div>
                        <p className="text-xs font-semibold text-zinc-500">클래스</p>
                        <p className="truncate">{payment.class_name || "-"}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-zinc-500">수업</p>
                        <p className="truncate">{payment.event_title || "-"}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-zinc-500">시작</p>
                        <p>{formatDate(payment.due_at)}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-zinc-500">청구</p>
                        <p>{tuitionRange(payment)} · {formatAmount(payment.amount)}</p>
                      </div>
                    </div>
                    <div className="grid gap-2 text-sm font-medium text-zinc-500 sm:grid-cols-2">
                      <p>보호자: {payment.guardian_name || "-"}</p>
                      <p>연락처: {payment.guardian_phone || "-"}</p>
                    </div>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 lg:w-[360px]">
                    <Button type="button" size="sm" onClick={() => markPaid(payment)} disabled={inactive || busyKey === `paid:${payment.id}`}>
                      {busyKey === `paid:${payment.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                      결제 확인
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => remind(payment)} disabled={inactive || busyKey === `remind:${payment.id}`}>
                      {busyKey === `remind:${payment.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquareText className="h-4 w-4" />}
                      문자 보내기
                    </Button>
                    <Button type="button" size="sm" variant="secondary" onClick={() => excludeClassSession(payment)} disabled={!canExclude || busyKey === `event:${payment.id}`}>
                      {busyKey === `event:${payment.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                      수업 제외
                    </Button>
                    <Button type="button" size="sm" variant="secondary" onClick={() => excludeStudentSession(payment)} disabled={!canExclude || busyKey === `student:${payment.id}`}>
                      {busyKey === `student:${payment.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserX className="h-4 w-4" />}
                      인정 결석
                    </Button>
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      </div>
    </div>
  );
}
