"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Copy, Megaphone, Pencil, Plus, Save, Trash2, UploadCloud } from "lucide-react";

import { DashboardAnnouncementPanel } from "@/components/dashboard/dashboard-announcement-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createDashboardAnnouncement,
  assetUrl,
  DashboardAnnouncement,
  DashboardAnnouncementPayload,
  deleteDashboardAnnouncement,
  listDashboardAnnouncements,
  uploadDashboardAnnouncementMedia,
  updateDashboardAnnouncement,
} from "@/lib/api";

type Draft = {
  id?: string;
  eyebrow: string;
  title: string;
  body: string;
  badge: string;
  cta_label: string;
  cta_href: string;
  secondary_label: string;
  secondary_href: string;
  media_type: "none" | "image" | "video";
  media_url: string;
  media_alt: string;
  theme: "product" | "update" | "event" | "system";
  priority: number;
  is_active: boolean;
  starts_at: string;
  ends_at: string;
};

const emptyDraft: Draft = {
  eyebrow: "",
  title: "",
  body: "",
  badge: "",
  cta_label: "",
  cta_href: "",
  secondary_label: "",
  secondary_href: "",
  media_type: "none",
  media_url: "",
  media_alt: "",
  theme: "product",
  priority: 0,
  is_active: true,
  starts_at: "",
  ends_at: "",
};

function toLocalInput(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function fromLocalInput(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toDraft(item: DashboardAnnouncement): Draft {
  return {
    id: item.id,
    eyebrow: item.eyebrow || "",
    title: item.title,
    body: item.body || "",
    badge: item.badge || "",
    cta_label: item.cta_label || "",
    cta_href: item.cta_href || "",
    secondary_label: item.secondary_label || "",
    secondary_href: item.secondary_href || "",
    media_type: item.media_type,
    media_url: item.media_url || "",
    media_alt: item.media_alt || "",
    theme: item.theme,
    priority: item.priority,
    is_active: item.is_active,
    starts_at: toLocalInput(item.starts_at),
    ends_at: toLocalInput(item.ends_at),
  };
}

function toPayload(draft: Draft): DashboardAnnouncementPayload {
  return {
    eyebrow: null,
    title: draft.title.trim(),
    body: draft.body.trim() || null,
    badge: null,
    cta_label: null,
    cta_href: null,
    secondary_label: null,
    secondary_href: null,
    media_type: draft.media_type,
    media_url: draft.media_url.trim() || null,
    media_alt: draft.media_alt.trim() || null,
    theme: draft.theme,
    priority: Number(draft.priority) || 0,
    is_active: draft.is_active,
    starts_at: fromLocalInput(draft.starts_at),
    ends_at: fromLocalInput(draft.ends_at),
  };
}

export default function AdminAnnouncementsPage() {
  const [items, setItems] = useState<DashboardAnnouncement[]>([]);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const next = await listDashboardAnnouncements();
      setItems(next);
      if (next[0]) {
        setDraft(toDraft(next[0]));
        setSelectedId(next[0].id);
      }
    } catch (err: any) {
      setError(err.response?.status === 403 ? "관리자 권한이 필요합니다." : "소식 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const activeItems = useMemo(() => items.filter((item) => item.is_active), [items]);

  const preview = useMemo(() => {
    if (!draft.title.trim()) return null;
    return {
      id: draft.id || "preview",
      created_at: "",
      updated_at: "",
      created_by: null,
      ...toPayload(draft),
    } as DashboardAnnouncement;
  }, [draft]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.title.trim()) {
      setError("제목을 입력해주세요.");
      return;
    }
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const payload = toPayload(draft);
      const saved = draft.id ? await updateDashboardAnnouncement(draft.id, payload) : await createDashboardAnnouncement(payload);
      setMessage("소식이 저장되었습니다.");
      const next = await listDashboardAnnouncements();
      setItems(next);
      setDraft(toDraft(saved));
      setSelectedId(saved.id);
    } catch {
      setError("저장하지 못했습니다. 입력값과 관리자 권한을 확인해주세요.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(item: DashboardAnnouncement) {
    if (!window.confirm(`'${item.title}' 소식을 삭제할까요?`)) return;
    await deleteDashboardAnnouncement(item.id);
    setMessage("삭제되었습니다.");
    const next = await listDashboardAnnouncements();
    setItems(next);
    if (next[0]) {
      setDraft(toDraft(next[0]));
      setSelectedId(next[0].id);
    } else {
      setDraft(emptyDraft);
      setSelectedId(null);
    }
  }

  function startNew() {
    const nextPriority = items.length > 0 ? Math.max(...items.map((item) => item.priority)) + 1 : 0;
    setDraft({ ...emptyDraft, priority: nextPriority });
    setSelectedId(null);
    setMessage("");
    setError("");
  }

  function editItem(item: DashboardAnnouncement) {
    setDraft(toDraft(item));
    setSelectedId(item.id);
    setMessage("");
    setError("");
  }

  async function toggleActive(item: DashboardAnnouncement) {
    setMessage("");
    setError("");
    try {
      const updated = await updateDashboardAnnouncement(item.id, { is_active: !item.is_active });
      const next = await listDashboardAnnouncements();
      setItems(next);
      if (selectedId === item.id) setDraft(toDraft(updated));
      setMessage(updated.is_active ? "소식이 활성화되었습니다." : "소식이 비활성화되었습니다.");
    } catch {
      setError("활성 상태를 변경하지 못했습니다.");
    }
  }

  async function duplicateItem(item: DashboardAnnouncement) {
    setMessage("");
    setError("");
    try {
      const payload = {
        ...toPayload(toDraft(item)),
        title: `${item.title} (복사본)`,
        is_active: false,
        priority: item.priority,
      };
      const created = await createDashboardAnnouncement(payload);
      const next = await listDashboardAnnouncements();
      setItems(next);
      setDraft(toDraft(created));
      setSelectedId(created.id);
      setMessage("소식이 복제되었습니다. 내용을 확인한 뒤 활성화하세요.");
    } catch {
      setError("소식을 복제하지 못했습니다.");
    }
  }

  async function uploadMedia(file: File | null) {
    if (!file) return;
    setUploadingMedia(true);
    setUploadProgress(0);
    setMessage("");
    setError("");
    try {
      const uploaded = await uploadDashboardAnnouncementMedia(file, setUploadProgress);
      setDraft((current) => ({
        ...current,
        media_type: uploaded.media_type,
        media_url: uploaded.url,
        media_alt: current.media_alt || uploaded.filename,
      }));
      setMessage("미디어가 업로드되었습니다. 저장을 누르면 소식에 반영됩니다.");
    } catch (err: any) {
      setError(err.message || "미디어 업로드에 실패했습니다.");
    } finally {
      setUploadingMedia(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <section className="rounded-[14px] border border-white/10 bg-black/45 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.32)]">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-md border border-zinc-400/20 bg-zinc-400/10 px-2.5 py-1 text-xs font-semibold text-zinc-100">
              <Megaphone className="h-4 w-4" />
              Operations News
            </div>
            <h1 className="mt-4 text-3xl font-bold text-white">소식 관리</h1>
          </div>
          <Button type="button" variant="outline" onClick={startNew}>
            <Plus className="h-4 w-4" />
            새 운영 소식
          </Button>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        <aside className="space-y-3">
          <div className="rounded-[12px] border border-white/10 bg-white/[0.04] p-3">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Operations News</div>
                <div className="mt-1 text-xs text-slate-400">전체 {items.length}개 · 활성 {activeItems.length}개</div>
              </div>
              <Button type="button" size="sm" variant="outline" onClick={startNew}>
                <Plus className="h-4 w-4" />
                추가
              </Button>
            </div>
            {loading && <p className="text-sm text-slate-400">불러오는 중...</p>}
            {!loading && items.length === 0 && <p className="text-sm text-slate-400">등록된 소식이 없습니다.</p>}
            <div className="space-y-2">
              {items.map((item) => (
                <article
                  key={item.id}
                  className={`rounded-[10px] border p-3 transition ${
                    selectedId === item.id
                      ? "border-zinc-300/45 bg-zinc-400/10 shadow-[0_14px_36px_rgba(109,40,217,0.16)]"
                      : "border-white/10 bg-black/25 hover:border-zinc-300/30 hover:bg-white/[0.06]"
                  }`}
                >
                  <div className="flex gap-3">
                    <button
                      type="button"
                      className="relative h-14 w-16 shrink-0 overflow-hidden rounded-md border border-white/10 bg-white/[0.04]"
                      onClick={() => editItem(item)}
                      aria-label={`${item.title} 편집`}
                    >
                      {item.media_type === "image" && item.media_url ? (
                        <img src={assetUrl(item.media_url)} alt="" className="h-full w-full object-cover" />
                      ) : item.media_type === "video" && item.media_url ? (
                        <div className="flex h-full w-full items-center justify-center bg-zinc-400/10 text-[10px] font-semibold text-zinc-100">VIDEO</div>
                      ) : (
                        <div className="h-full w-full bg-[radial-gradient(circle_at_30%_25%,rgba(255,255,255,0.26),transparent_36%),linear-gradient(135deg,#080914,#151027)]" />
                      )}
                    </button>
                    <button type="button" className="min-w-0 flex-1 text-left" onClick={() => editItem(item)}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="line-clamp-1 text-sm font-semibold text-white">{item.title}</span>
                        <span className={item.is_active ? "shrink-0 text-xs text-zinc-300" : "shrink-0 text-xs text-slate-500"}>{item.is_active ? "활성" : "비활성"}</span>
                      </div>
                      <div className="mt-1 text-xs text-slate-500">우선순위 {item.priority} · {item.media_type}</div>
                    </button>
                  </div>
                  <div className="mt-3 grid grid-cols-4 gap-1.5">
                    <button type="button" className="rounded-md bg-white/[0.06] px-2 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-white/[0.1]" onClick={() => editItem(item)}>
                      <Pencil className="mx-auto h-3.5 w-3.5" />
                    </button>
                    <button type="button" className="rounded-md bg-white/[0.06] px-2 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-white/[0.1]" onClick={() => toggleActive(item)}>
                      {item.is_active ? "끄기" : "켜기"}
                    </button>
                    <button type="button" className="rounded-md bg-white/[0.06] px-2 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-white/[0.1]" onClick={() => duplicateItem(item)}>
                      <Copy className="mx-auto h-3.5 w-3.5" />
                    </button>
                    <button type="button" className="rounded-md bg-zinc-400/10 px-2 py-1.5 text-xs font-semibold text-zinc-200 transition hover:bg-zinc-400/20" onClick={() => remove(item)}>
                      <Trash2 className="mx-auto h-3.5 w-3.5" />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </aside>

        <main className="space-y-5">
          <form className="rounded-[12px] border border-white/10 bg-white/[0.04] p-5" onSubmit={save}>
            <div className="mb-5 flex flex-col gap-2 border-b border-white/10 pb-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                  {draft.id ? "Edit News Item" : "New News Item"}
                </div>
                <h2 className="mt-1 text-lg font-bold text-white">{draft.id ? "선택한 운영 소식 편집" : "새 운영 소식 작성"}</h2>
              </div>
              <div className="text-xs text-slate-500">
                {draft.id ? `ID ${draft.id.slice(0, 8)}` : "저장하면 목록에 새 소식으로 추가됩니다."}
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-1.5 text-sm font-semibold text-slate-200 md:col-span-2">
                제목
                <Input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="예: Tena Forge 5월 업데이트" />
              </label>
              <label className="space-y-1.5 text-sm font-semibold text-slate-200 md:col-span-2">
                본문
                <textarea
                  className="min-h-28 w-full rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-zinc-400"
                  value={draft.body}
                  onChange={(event) => setDraft({ ...draft, body: event.target.value })}
                />
              </label>
              <label className="space-y-1.5 text-sm font-semibold text-slate-200">
                미디어 유형
                <select className="h-10 w-full rounded-md border border-white/10 bg-white/[0.04] px-3 text-sm text-white outline-none" value={draft.media_type} onChange={(event) => setDraft({ ...draft, media_type: event.target.value as Draft["media_type"] })}>
                  <option value="none">없음</option>
                  <option value="image">이미지</option>
                  <option value="video">영상</option>
                </select>
              </label>
              <label className="space-y-1.5 text-sm font-semibold text-slate-200">
                테마
                <select className="h-10 w-full rounded-md border border-white/10 bg-white/[0.04] px-3 text-sm text-white outline-none" value={draft.theme} onChange={(event) => setDraft({ ...draft, theme: event.target.value as Draft["theme"] })}>
                  <option value="product">제품</option>
                  <option value="update">업데이트</option>
                  <option value="event">이벤트</option>
                  <option value="system">시스템</option>
                </select>
              </label>
              <div className="space-y-2 text-sm font-semibold text-slate-200 md:col-span-2">
                미디어 파일 업로드
                <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-white/15 bg-black/25 px-4 py-4 text-center transition hover:border-zinc-300/50 hover:bg-zinc-400/10">
                  <UploadCloud className="h-5 w-5 text-zinc-200" />
                  <span className="text-sm text-white">{uploadingMedia ? `업로드 중... ${uploadProgress}%` : "사진 또는 짧은 동영상 선택"}</span>
                  <span className="text-xs font-normal text-slate-500">PNG, JPG, WebP, GIF, MP4, WebM, MOV · 최대 50MB</span>
                  <input
                    type="file"
                    className="sr-only"
                    accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
                    disabled={uploadingMedia}
                    onChange={(event) => {
                      const file = event.target.files?.[0] || null;
                      event.currentTarget.value = "";
                      uploadMedia(file);
                    }}
                  />
                </label>
                {uploadingMedia && (
                  <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full bg-zinc-300 transition-all" style={{ width: `${uploadProgress}%` }} />
                  </div>
                )}
              </div>
              <label className="space-y-1.5 text-sm font-semibold text-slate-200 md:col-span-2">
                미디어 URL
                <Input value={draft.media_url} onChange={(event) => setDraft({ ...draft, media_url: event.target.value })} placeholder="/static/... 또는 https://..." />
              </label>
              <label className="space-y-1.5 text-sm font-semibold text-slate-200 md:col-span-2">
                미디어 설명
                <Input value={draft.media_alt} onChange={(event) => setDraft({ ...draft, media_alt: event.target.value })} />
              </label>
              <label className="space-y-1.5 text-sm font-semibold text-slate-200">
                시작일
                <Input type="datetime-local" value={draft.starts_at} onChange={(event) => setDraft({ ...draft, starts_at: event.target.value })} />
              </label>
              <label className="space-y-1.5 text-sm font-semibold text-slate-200">
                종료일
                <Input type="datetime-local" value={draft.ends_at} onChange={(event) => setDraft({ ...draft, ends_at: event.target.value })} />
              </label>
              <label className="space-y-1.5 text-sm font-semibold text-slate-200">
                우선순위
                <Input type="number" value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: Number(event.target.value) })} />
              </label>
              <label className="flex items-center gap-2 pt-7 text-sm font-semibold text-slate-200">
                <input type="checkbox" checked={draft.is_active} onChange={(event) => setDraft({ ...draft, is_active: event.target.checked })} />
                활성화
              </label>
            </div>

            {message && <p className="mt-4 rounded-md border border-zinc-400/20 bg-zinc-400/10 px-3 py-2 text-sm text-zinc-100">{message}</p>}
            {error && <p className="mt-4 rounded-md border border-zinc-400/20 bg-zinc-400/10 px-3 py-2 text-sm text-zinc-100">{error}</p>}

            <div className="mt-5 flex flex-wrap justify-between gap-2">
              <Button type="submit" disabled={saving}>
                <Save className="h-4 w-4" />
                {saving ? "저장 중..." : "저장"}
              </Button>
              {draft.id && (
                <Button type="button" variant="outline" onClick={() => items.find((item) => item.id === draft.id) && remove(items.find((item) => item.id === draft.id)!)}>
                  <Trash2 className="h-4 w-4" />
                  삭제
                </Button>
              )}
            </div>
          </form>

          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Selected News Preview</div>
            <DashboardAnnouncementPanel announcement={preview} />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Live Dashboard Rotation</div>
              <div className="text-xs text-slate-500">활성 소식 {activeItems.length}개</div>
            </div>
            <DashboardAnnouncementPanel announcements={activeItems.length > 0 ? activeItems : preview ? [preview] : []} />
          </div>
        </main>
      </div>
    </div>
  );
}
