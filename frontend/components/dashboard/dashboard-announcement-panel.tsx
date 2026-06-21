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
  product: "bg-[linear-gradient(135deg,#fafafa,#e5e5e5)]",
  update: "bg-[linear-gradient(135deg,#f4f4f5,#d4d4d8)]",
  event: "bg-[linear-gradient(135deg,#ffffff,#e4e4e7)]",
  system: "bg-[linear-gradient(135deg,#f5f5f5,#d6d3d1)]",
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
    <section className="relative min-h-[250px] overflow-hidden rounded-[14px] bg-white shadow-sm">
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

      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.94),rgba(255,255,255,0.82)_52%,rgba(255,255,255,0.48)),linear-gradient(0deg,rgba(255,255,255,0.78),transparent_58%)]" />

      <div className="relative flex min-h-[250px] flex-col justify-end p-6 lg:p-7">
        {canManage && (
          <div className="absolute right-4 top-4">
            <Link href="/admin/announcements">
              <Button size="sm">
                소식 변경하기
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        )}

        <div className="max-w-3xl">
          <h1 className="text-3xl font-bold tracking-normal text-zinc-950 lg:text-4xl">{item.title}</h1>
          {item.body && <p className="mt-3 max-w-2xl text-sm font-medium leading-6 text-zinc-600">{item.body}</p>}
        </div>

        {items.length > 1 && (
          <div className="mt-6 flex gap-2" aria-label="뉴스 슬라이드">
            {items.map((entry, index) => (
              <button
                key={entry.id}
                type="button"
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  index === activeIndex ? "w-8 bg-black" : "w-3 bg-zinc-300 hover:bg-zinc-500"
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
