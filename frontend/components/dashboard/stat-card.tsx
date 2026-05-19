import type { LucideIcon } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  icon: Icon,
  detail,
  tone = "neutral",
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  detail?: string;
  tone?: "neutral" | "violet" | "warning" | "success";
}) {
  return (
    <Card className="group overflow-hidden border-white/10 bg-white/[0.045] shadow-[0_18px_52px_rgba(0,0,0,0.28)] transition-all duration-150 hover:-translate-y-0.5 hover:border-white/16 hover:bg-white/[0.06] hover:shadow-[0_24px_64px_rgba(0,0,0,0.36)]">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-sm text-slate-400">
          <span>{label}</span>
          <span
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-[7px] border",
              tone === "neutral" && "border-white/10 bg-white/[0.08] text-slate-200",
              tone === "violet" && "border-violet-400/30 bg-violet-400/18 text-violet-100",
              tone === "warning" && "border-amber-400/25 bg-amber-400/10 text-amber-200",
              tone === "success" && "border-emerald-400/25 bg-emerald-400/10 text-emerald-200"
            )}
          >
            <Icon className="h-4 w-4" />
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold tracking-tight text-white">{value.toLocaleString("ko-KR")}</div>
        {detail && <div className="mt-2 text-xs font-medium text-slate-400">{detail}</div>}
      </CardContent>
    </Card>
  );
}
