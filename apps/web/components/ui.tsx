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
    "inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-[8px] px-4 text-sm font-semibold transition",
    variant === "primary" && "border border-white/80 bg-white text-black shadow-[0_14px_36px_rgba(255,255,255,0.10)] hover:bg-neutral-200",
    variant === "secondary" && "border border-white/15 bg-white/[0.065] text-white hover:border-white/25 hover:bg-white/[0.10]",
    variant === "ghost" && "border border-transparent text-neutral-300 hover:border-white/10 hover:bg-white/[0.06] hover:text-white",
    variant === "danger" && "border border-white/25 bg-white/[0.10] text-white hover:border-white/35 hover:bg-white/[0.14]",
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
      "inline-flex items-center rounded-[6px] border px-2 py-0.5 text-xs font-semibold uppercase",
      tone === "neutral" && "border-white/10 bg-white/[0.045] text-neutral-300",
      tone === "violet" && "border-white/20 bg-white/[0.10] text-white",
      tone === "green" && "border-white/25 bg-white/[0.13] text-white",
      tone === "amber" && "border-dashed border-white/30 bg-white/[0.075] text-neutral-100",
      tone === "red" && "border-2 border-white/30 bg-black text-white"
    )}>{children}</span>
  );
}

export function Stat({ icon: Icon, label, value, detail }: { icon: LucideIcon; label: string; value: string; detail: string }) {
  return (
    <Card>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-neutral-400">{label}</p>
          <p className="mt-2 text-2xl font-bold text-white">{value}</p>
          <p className="mt-1 text-xs text-neutral-500">{detail}</p>
        </div>
        <div className="rounded-[8px] border border-white/15 bg-white/[0.065] p-2 text-white"><Icon className="h-4 w-4" /></div>
      </div>
    </Card>
  );
}
