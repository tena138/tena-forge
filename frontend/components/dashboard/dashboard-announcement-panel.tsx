"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import type { DashboardAnnouncement } from "@/lib/api";
import { assetUrl } from "@/lib/api";
import { cn } from "@/lib/utils";

const fallbackAnnouncement: Omit<DashboardAnnouncement, "id" | "created_at" | "updated_at" | "created_by"> = {
  eyebrow: null,
  title: "운영 소식",
  body: "Tena Forge의 최신 업데이트, 제품 소식, 이벤트 안내를 이곳에서 확인할 수 있습니다.",
  badge: null,
  cta_label: null,
  cta_href: null,
  secondary_label: null,
  secondary_href: null,
  media_type: "none",
  media_url: null,
  media_alt: null,
  theme: "product",
  priority: 0,
  is_active: true,
  starts_at: null,
  ends_at: null,
};

const fallbackVisuals: Record<DashboardAnnouncement["theme"], string> = {
  product:
    "bg-[radial-gradient(circle_at_18%_20%,rgba(167,139,250,0.36),transparent_28%),radial-gradient(circle_at_80%_70%,rgba(34,211,238,0.18),transparent_34%),linear-gradient(135deg,#080914,#151027_52%,#071018)]",
  update:
    "bg-[radial-gradient(circle_at_22%_24%,rgba(34,211,238,0.26),transparent_28%),radial-gradient(circle_at_78%_68%,rgba(124,58,237,0.24),transparent_34%),linear-gradient(135deg,#050816,#0b1724_50%,#120a26)]",
  event:
    "bg-[radial-gradient(circle_at_20%_20%,rgba(16,185,129,0.22),transparent_30%),radial-gradient(circle_at_78%_70%,rgba(167,139,250,0.22),transparent_34%),linear-gradient(135deg,#06110e,#101421_54%,#150d25)]",
  system:
    "bg-[radial-gradient(circle_at_25%_22%,rgba(148,163,184,0.22),transparent_30%),radial-gradient(circle_at_74%_74%,rgba(124,58,237,0.18),transparent_34%),linear-gradient(135deg,#050505,#111827_52%,#09090b)]",
};

function normalizeItems(announcements?: DashboardAnnouncement[], announcement?: DashboardAnnouncement | null) {
  const raw = announcements && announcements.length > 0 ? announcements : announcement ? [announcement] : [];
  if (raw.length > 0) return raw;
  return [{ id: "fallback", created_at: "", updated_at: "", created_by: null, ...fallbackAnnouncement } as DashboardAnnouncement];
}

function BackgroundMedia({ item }: { item: DashboardAnnouncement }) {
  const url = item.media_url ? assetUrl(item.media_url) : "";

  if (item.media_type === "image" && url) {
    return <img className="absolute inset-0 h-full w-full object-cover" src={url} alt={item.media_alt || item.title} />;
  }

  if (item.media_type === "video" && url) {
    return (
      <video
        key={url}
        className="absolute inset-0 h-full w-full object-cover"
        src={url}
        muted
        loop
        playsInline
        autoPlay
        controls={false}
        aria-label={item.media_alt || item.title}
      />
    );
  }

  return <div className={cn("absolute inset-0", fallbackVisuals[item.theme])} />;
}

export function DashboardAnnouncementPanel({
  announcement,
  announcements,
  canManage = false,
  intervalMs = 6500,
}: {
  announcement?: DashboardAnnouncement | null;
  announcements?: DashboardAnnouncement[];
  canManage?: boolean;
  intervalMs?: number;
}) {
  const items = useMemo(() => normalizeItems(announcements, announcement), [announcements, announcement]);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    setActiveIndex(0);
  }, [items.length]);

  useEffect(() => {
    if (items.length <= 1) return;
    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % items.length);
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs, items.length]);

  const item = items[Math.min(activeIndex, items.length - 1)];

  return (
    <section className="relative min-h-[250px] overflow-hidden rounded-[14px] border border-white/10 bg-black shadow-[0_24px_80px_rgba(0,0,0,0.34)]">
      {items.map((entry, index) => (
        <div
          key={entry.id}
          className={cn(
            "absolute inset-0 transition-opacity duration-700 ease-out",
            index === activeIndex ? "opacity-100" : "opacity-0"
          )}
          aria-hidden={index !== activeIndex}
        >
          <BackgroundMedia item={entry} />
        </div>
      ))}

      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.78),rgba(0,0,0,0.46)_48%,rgba(0,0,0,0.18)),linear-gradient(0deg,rgba(0,0,0,0.45),transparent_56%)]" />
      <div className="absolute inset-0 ring-1 ring-inset ring-white/10" />

      <div className="relative flex min-h-[250px] flex-col justify-end p-6 lg:p-7">
        {canManage && (
          <div className="absolute right-4 top-4">
            <Link href="/admin/announcements">
              <Button size="sm" className="border border-white/15 bg-black/45 text-white shadow-lg backdrop-blur hover:bg-black/65">
                소식 변경하기
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        )}

        <div className="max-w-3xl">
          <h1 className="text-3xl font-bold tracking-tight text-white drop-shadow lg:text-4xl">{item.title}</h1>
          {item.body && <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-200 drop-shadow">{item.body}</p>}
        </div>

        {items.length > 1 && (
          <div className="mt-6 flex gap-2" aria-label="뉴스 슬라이드">
            {items.map((entry, index) => (
              <button
                key={entry.id}
                type="button"
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  index === activeIndex ? "w-8 bg-white" : "w-3 bg-white/35 hover:bg-white/60"
                )}
                aria-label={`${index + 1}번째 소식 보기`}
                onClick={() => setActiveIndex(index)}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
