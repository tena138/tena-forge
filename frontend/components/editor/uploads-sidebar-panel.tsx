"use client";

import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ExternalLink, ImageIcon, Loader2, Search, UploadCloud } from "lucide-react";
import { useDraggable } from "@dnd-kit/core";
import { nanoid } from "nanoid";
import * as ContextMenu from "@radix-ui/react-context-menu";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { API_URL, AssetItem, assetUrl, deleteAsset, listAssets, renameAsset, uploadAsset } from "@/lib/api";
import { CanvasElement } from "@/lib/editorTypes";
import { useEditorStore } from "@/store/editorStore";

type SortKey = "latest" | "name" | "size";
type TypeFilter = "all" | "image" | "logo" | "other";

type UploadProgress = {
  id: string;
  filename: string;
  progress: number;
  error?: string;
};

const allowedTypes = new Set(["image/png", "image/jpeg", "image/webp", "image/svg+xml"]);
const allowedExt = /\.(png|jpe?g|webp|svg)$/i;
const maxSize = 10 * 1024 * 1024;

function centerFor(page: { width: number; height: number }, width: number, height: number) {
  return {
    x: Math.max(0, Math.round((page.width - width) / 2)),
    y: Math.max(0, Math.round((page.height - height) / 2)),
  };
}

function createImageElement(asset: Pick<AssetItem, "url" | "filename" | "id">, x: number, y: number, width = 220, height = 150): CanvasElement {
  return {
    id: nanoid(),
    type: "image",
    name: asset.filename,
    x,
    y,
    width,
    height,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 0,
    fill: "#ffffff",
    stroke: "#cbd5e1",
    strokeWidth: 0,
    color: "#111827",
    fontFamily: "NanumGothic",
    fontSize: 14,
    fontWeight: "normal",
    fontStyle: "normal",
    textAlign: "left",
    lineHeight: 1.25,
    letterSpacing: 0,
    src: asset.url,
    assetId: asset.id,
    objectFit: "contain",
  };
}

function formatSize(size: number) {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))}KB`;
  return `${(size / 1024 / 1024).toFixed(1)}MB`;
}

function assetTypeLabel(type: AssetItem["type"]) {
  return type === "logo" ? "로고" : type === "other" ? "기타" : "이미지";
}

function validateFile(file: File) {
  if (!allowedTypes.has(file.type) && !allowedExt.test(file.name)) return "PNG, JPG, JPEG, WebP, SVG만 업로드할 수 있습니다.";
  if (file.size > maxSize) return "파일은 10MB 이하만 업로드할 수 있습니다.";
  return "";
}

function AssetCard({ asset, onInsert, onRename, onDelete }: { asset: AssetItem; onInsert: (asset: AssetItem) => void; onRename: (asset: AssetItem) => void; onDelete: (asset: AssetItem) => void }) {
  const preset = {
    id: `asset-${asset.id}`,
    label: asset.filename,
    type: "image",
    defaultWidth: 220,
    defaultHeight: 150,
    create: (x: number, y: number) => createImageElement(asset, x, y),
  };
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: preset.id, data: { preset } });

  function download() {
    window.open(`${API_URL}/api/assets/${asset.id}/download`, "_blank");
  }

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <article
          ref={setNodeRef}
          {...attributes}
          {...listeners}
          className={`group overflow-hidden rounded-md border bg-white shadow-sm transition hover:border-zinc-300 ${isDragging ? "opacity-45" : ""}`}
        >
          <button type="button" onClick={() => onInsert(asset)} className="block w-full text-left">
            <div className="relative aspect-[4/3] bg-slate-100">
              <img src={assetUrl(asset.url)} alt={asset.filename} className="h-full w-full object-contain" draggable={false} />
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-950/65 p-2 opacity-0 transition group-hover:opacity-100">
                <Button type="button" size="sm" className="w-full bg-white text-slate-950 hover:bg-slate-100" onClick={(event) => { event.stopPropagation(); onInsert(asset); }}>
                  캔버스에 추가
                </Button>
                <Button type="button" size="sm" variant="destructive" className="w-full" onClick={(event) => { event.stopPropagation(); onDelete(asset); }}>
                  삭제
                </Button>
              </div>
            </div>
            <div className="p-2">
              <div className="truncate text-xs font-semibold text-slate-800">{asset.filename}</div>
              <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
                <span>{assetTypeLabel(asset.type)}</span>
                <span>{formatSize(asset.size)}</span>
              </div>
            </div>
          </button>
        </article>
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className="z-[150] min-w-44 rounded-md border bg-white p-1 text-sm shadow-xl">
          <ContextMenu.Item className="rounded px-2 py-1.5 outline-none hover:bg-slate-100" onSelect={() => onInsert(asset)}>캔버스에 삽입</ContextMenu.Item>
          <ContextMenu.Item className="rounded px-2 py-1.5 outline-none hover:bg-slate-100" onSelect={() => onRename(asset)}>이름 변경</ContextMenu.Item>
          <ContextMenu.Item className="rounded px-2 py-1.5 outline-none hover:bg-slate-100" onSelect={download}>다운로드</ContextMenu.Item>
          <ContextMenu.Separator className="my-1 h-px bg-slate-200" />
          <ContextMenu.Item className="rounded px-2 py-1.5 text-zinc-600 outline-none hover:bg-zinc-50" onSelect={() => onDelete(asset)}>삭제</ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

export function UploadsSidebarPanel({ onNotice }: { onNotice?: (message: string) => void }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const page = useEditorStore((state) => state.canvasJson.page);
  const addElement = useEditorStore((state) => state.addElement);
  const [assets, setAssets] = useState<AssetItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploads, setUploads] = useState<UploadProgress[]>([]);
  const [draggingFiles, setDraggingFiles] = useState(false);
  const [sort, setSort] = useState<SortKey>("latest");
  const [type, setType] = useState<TypeFilter>("all");
  const [query, setQuery] = useState("");
  const [urlOpen, setUrlOpen] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [urlLoading, setUrlLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      setAssets(await listAssets());
    } catch (error) {
      onNotice?.(error instanceof Error ? error.message : "이미지를 불러오지 못했습니다.");
      setAssets([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleFiles(files: FileList | File[]) {
    const selected = Array.from(files);
    if (!selected.length) return;
    const nextUploads = selected.map((file) => ({ id: nanoid(), filename: file.name, progress: 0 }));
    setUploads((current) => [...nextUploads, ...current]);

    await Promise.all(
      selected.map(async (file, index) => {
        const uploadId = nextUploads[index].id;
        const validation = validateFile(file);
        if (validation) {
          setUploads((current) => current.map((item) => item.id === uploadId ? { ...item, error: validation } : item));
          return;
        }
        try {
          const uploaded = await uploadAsset(file, (progress) => {
            setUploads((current) => current.map((item) => item.id === uploadId ? { ...item, progress } : item));
          });
          setAssets((current) => [uploaded, ...current.filter((item) => item.id !== uploaded.id)]);
        } catch (error) {
          setUploads((current) => current.map((item) => item.id === uploadId ? { ...item, error: error instanceof Error ? error.message : "업로드 실패" } : item));
        }
      })
    );
    window.setTimeout(() => setUploads((current) => current.filter((item) => item.error || item.progress < 100)), 1200);
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files) handleFiles(event.target.files);
    event.target.value = "";
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDraggingFiles(false);
    handleFiles(event.dataTransfer.files);
  }

  function insertAsset(asset: AssetItem) {
    const center = centerFor(page, 220, 150);
    addElement(createImageElement(asset, center.x, center.y));
  }

  async function removeAsset(asset: AssetItem) {
    if (!window.confirm(`'${asset.filename}' 이미지를 삭제하시겠습니까?`)) return;
    try {
      await deleteAsset(asset.id);
      setAssets((current) => current.filter((item) => item.id !== asset.id));
      onNotice?.("이미지가 삭제되었습니다");
    } catch (error) {
      onNotice?.(error instanceof Error ? error.message : "이미지 삭제에 실패했습니다.");
    }
  }

  async function rename(asset: AssetItem) {
    const filename = window.prompt("새 파일명을 입력하세요.", asset.filename);
    if (!filename || filename === asset.filename) return;
    try {
      const renamed = await renameAsset(asset.id, filename);
      setAssets((current) => current.map((item) => item.id === asset.id ? renamed : item));
    } catch (error) {
      onNotice?.(error instanceof Error ? error.message : "이름 변경에 실패했습니다.");
    }
  }

  async function insertFromUrl() {
    const trimmed = imageUrl.trim();
    if (!trimmed) return;
    setUrlLoading(true);
    try {
      await new Promise<void>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("이미지를 불러올 수 없습니다."));
        image.src = trimmed;
      });
      const center = centerFor(page, 220, 150);
      addElement(createImageElement({ id: `url-${nanoid()}`, filename: "URL 이미지", url: trimmed }, center.x, center.y));
      setImageUrl("");
      setUrlOpen(false);
    } catch (error) {
      onNotice?.(error instanceof Error ? error.message : "이미지 추가에 실패했습니다.");
    } finally {
      setUrlLoading(false);
    }
  }

  const visibleAssets = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return [...assets]
      .filter((asset) => type === "all" || asset.type === type)
      .filter((asset) => !normalizedQuery || asset.filename.toLowerCase().includes(normalizedQuery))
      .sort((a, b) => {
        if (sort === "name") return a.filename.localeCompare(b.filename);
        if (sort === "size") return b.size - a.size;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
  }, [assets, query, sort, type]);

  return (
    <div className="space-y-5">
      <section>
        <div
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onDragOver={(event) => { event.preventDefault(); setDraggingFiles(true); }}
          onDragLeave={() => setDraggingFiles(false)}
          onDrop={onDrop}
          className={`flex h-[120px] w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed bg-white text-center text-sm font-semibold transition ${
            draggingFiles ? "border-zinc-400 bg-zinc-50 text-zinc-800" : "border-slate-300 text-slate-600 hover:border-zinc-300 hover:bg-zinc-50"
          }`}
        >
          <UploadCloud className="h-7 w-7" />
          이미지를 드래그하거나 클릭하여 업로드
          <span className="text-[11px] font-normal text-slate-500">PNG, JPG, JPEG, WebP, SVG · 10MB 이하</span>
        </div>
        <input ref={inputRef} type="file" accept=".png,.jpg,.jpeg,.webp,.svg,image/png,image/jpeg,image/webp,image/svg+xml" multiple className="hidden" onChange={onFileChange} />
        {uploads.length > 0 && (
          <div className="mt-3 space-y-2">
            {uploads.map((item) => (
              <div key={item.id} className="rounded-md border bg-white p-2">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="min-w-0 truncate font-semibold text-slate-700">{item.filename}</span>
                  <span className={item.error ? "text-zinc-600" : "text-slate-500"}>{item.error ? "오류" : `${item.progress}%`}</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded bg-slate-100">
                  <div className={`h-full ${item.error ? "bg-zinc-500" : "bg-zinc-500"}`} style={{ width: `${item.error ? 100 : item.progress}%` }} />
                </div>
                {item.error && <p className="mt-1 text-[11px] text-zinc-600">{item.error}</p>}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-xs font-bold text-slate-600">필터 & 정렬</h3>
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="파일명 검색" className="h-9 bg-white pl-9" aria-label="파일명 검색" />
        </label>
        <div className="grid grid-cols-3 gap-1">
          {[
            ["latest", "최신순"],
            ["name", "이름순"],
            ["size", "크기순"],
          ].map(([key, label]) => (
            <button key={key} type="button" onClick={() => setSort(key as SortKey)} className={`h-8 rounded-md text-xs font-semibold ${sort === key ? "bg-slate-950 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100"}`}>{label}</button>
          ))}
        </div>
        <div className="grid grid-cols-4 gap-1">
          {[
            ["all", "전체"],
            ["image", "이미지"],
            ["logo", "로고"],
            ["other", "기타"],
          ].map(([key, label]) => (
            <button key={key} type="button" onClick={() => setType(key as TypeFilter)} className={`h-8 rounded-md text-xs font-semibold ${type === key ? "bg-zinc-600 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100"}`}>{label}</button>
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-xs font-bold text-slate-600">내 이미지</h3>
        {loading ? (
          <div className="grid grid-cols-2 gap-2">
            {Array.from({ length: 4 }).map((_, index) => <div key={index} className="aspect-[4/3] animate-pulse rounded-md bg-slate-100" />)}
          </div>
        ) : visibleAssets.length ? (
          <div className="grid grid-cols-2 gap-2">
            {visibleAssets.map((asset) => <AssetCard key={asset.id} asset={asset} onInsert={insertAsset} onRename={rename} onDelete={removeAsset} />)}
          </div>
        ) : (
          <div className="rounded-md border border-dashed bg-white p-6 text-center text-xs text-slate-500">
            <ImageIcon className="mx-auto mb-2 h-7 w-7 text-slate-300" />
            업로드된 이미지가 없습니다
          </div>
        )}
      </section>

      <section>
        <Button type="button" variant="outline" className="w-full justify-between" disabled>
          구글 드라이브에서 가져오기
          <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">준비 중</span>
        </Button>
      </section>

      <section className="rounded-md border bg-white">
        <button type="button" onClick={() => setUrlOpen((open) => !open)} className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-bold text-slate-600">
          URL로 이미지 추가
          <ChevronDown className={`h-4 w-4 transition ${urlOpen ? "" : "-rotate-90"}`} />
        </button>
        {urlOpen && (
          <div className="border-t p-3">
            <Input value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} placeholder="이미지 URL 입력" className="bg-white" />
            <Button type="button" className="mt-2 w-full" onClick={insertFromUrl} disabled={urlLoading}>
              {urlLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
              추가
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}
