import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { clsx } from "clsx";

export function Button({
  href,
  variant = "primary",
  children,
  className
}: {
  href?: string;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  children: React.ReactNode;
  className?: string;
}) {
  const styles = clsx(
    "inline-flex h-10 items-center justify-center gap-2 rounded-[8px] px-4 text-sm font-semibold transition",
    variant === "primary" && "bg-violet-500 text-white hover:bg-violet-400",
    variant === "secondary" && "border border-white/10 bg-white/[0.055] text-slate-100 hover:bg-white/[0.08]",
    variant === "ghost" && "text-slate-300 hover:bg-white/[0.06] hover:text-white",
    variant === "danger" && "border border-rose-400/30 bg-rose-400/10 text-rose-100 hover:bg-rose-400/15",
    className
  );
  if (href) return <Link className={styles} href={href}>{children}</Link>;
  return <button className={styles}>{children}</button>;
}

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={clsx("forge-panel rounded-[12px] p-5", className)}>{children}</div>;
}

export function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "violet" | "green" | "amber" | "red" }) {
  return (
    <span className={clsx(
      "inline-flex items-center rounded-[6px] border px-2 py-0.5 text-xs font-semibold",
      tone === "neutral" && "border-white/10 bg-white/[0.05] text-slate-300",
      tone === "violet" && "border-violet-300/20 bg-violet-400/10 text-violet-100",
      tone === "green" && "border-emerald-300/20 bg-emerald-400/10 text-emerald-100",
      tone === "amber" && "border-amber-300/20 bg-amber-400/10 text-amber-100",
      tone === "red" && "border-rose-300/20 bg-rose-400/10 text-rose-100"
    )}>{children}</span>
  );
}

export function Stat({ icon: Icon, label, value, detail }: { icon: LucideIcon; label: string; value: string; detail: string }) {
  return (
    <Card>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-slate-400">{label}</p>
          <p className="mt-2 text-2xl font-bold text-white">{value}</p>
          <p className="mt-1 text-xs text-slate-500">{detail}</p>
        </div>
        <div className="rounded-[8px] border border-white/10 bg-white/[0.05] p-2 text-violet-200"><Icon className="h-4 w-4" /></div>
      </div>
    </Card>
  );
}
