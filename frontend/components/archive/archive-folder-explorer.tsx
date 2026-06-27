"use client";

import { useMemo, useState, type DragEvent } from "react";
import { Check, ChevronLeft, Folder, Pencil, Plus, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ArchiveFolder, Batch } from "@/lib/api";
import {
  archiveFolderBatchIds,
  archiveFolderChildren,
  archiveFolderDescendantIds,
  archiveFolderPath,
  archiveFolderPathLabel,
  defaultArchiveFolderColor,
} from "@/lib/archiveFolders";
import { cn } from "@/lib/utils";

type DragItem = { kind: "folder" | "batch"; id: string } | null;

type ArchiveFolderExplorerProps = {
  folders: ArchiveFolder[];
  batches?: Batch[];
  currentFolderId: string | null;
  selectedFolderId?: string | null;
  selectedBatchId?: string | null;
  mode?: "browse" | "select";
  title?: string;
  kicker?: string;
  compactCreateFolder?: boolean;
  showBatches?: boolean;
  destinationPicker?: boolean;
  loading?: boolean;
  onOpenFolder: (folderId: string | null) => void;
  onSelectFolder?: (folderId: string | null) => void;
  onSelectBatch?: (batchId: string) => void;
  onCreateFolder: (payload: { name: string; parent_id: string | null; color: string }) => Promise<void> | void;
  onUpdateFolder: (folderId: string, payload: { name?: string; parent_id?: string | null; color?: string | null; order?: number }) => Promise<void> | void;
  onDeleteFolder: (folderId: string) => Promise<void> | void;
  onMoveBatch?: (batchId: string, folderId: string | null) => Promise<void> | void;
};

function formatCount(value: number) {
  return value.toLocaleString("ko-KR");
}

function normalizeHexColor(value?: string | null) {
  return value && /^#[0-9a-f]{6}$/i.test(value) ? value : null;
}

export function ArchiveFolderExplorer({
  folders,
  batches = [],
  currentFolderId,
  selectedFolderId,
  selectedBatchId,
  mode = "browse",
  title = "문항 아카이브 폴더",
  kicker = "Batch folders",
  compactCreateFolder = false,
  showBatches = true,
  destinationPicker = false,
  loading = false,
  onOpenFolder,
  onSelectFolder,
  onSelectBatch,
  onCreateFolder,
  onUpdateFolder,
  onDeleteFolder,
  onMoveBatch,
}: ArchiveFolderExplorerProps) {
  const [draft, setDraft] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [dragItem, setDragItem] = useState<DragItem>(null);

  const currentPath = useMemo(() => archiveFolderPath(currentFolderId, folders), [currentFolderId, folders]);
  const childFolders = useMemo(() => archiveFolderChildren(folders, currentFolderId), [currentFolderId, folders]);
  const parentFolderId = currentPath.at(-2)?.id || null;
  const parentIdsWithChildren = useMemo(() => {
    const parentIds = new Set<string>();
    for (const folder of folders) {
      if (folder.parent_id) parentIds.add(folder.parent_id);
    }
    return parentIds;
  }, [folders]);
  const visibleBatches = useMemo(
    () => showBatches ? batches.filter((batch) => (batch.archive_folder_id || null) === (currentFolderId || null)) : [],
    [batches, currentFolderId, showBatches],
  );
  const selectedPathLabel = useMemo(() => archiveFolderPathLabel(selectedFolderId || null, folders), [folders, selectedFolderId]);
  const showGridCreateFolder = destinationPicker || compactCreateFolder;

  async function createFolder() {
    const name = draft.replace(/\s+/g, " ").trim();
    if (!name) return;
    await onCreateFolder({ name, parent_id: currentFolderId, color: defaultArchiveFolderColor(`${archiveFolderPathLabel(currentFolderId, folders)} > ${name}`) });
    setDraft("");
    setCreatingFolder(false);
  }

  async function commitRename(folder: ArchiveFolder) {
    const name = editingName.replace(/\s+/g, " ").trim();
    if (!name) return;
    await onUpdateFolder(folder.id, { name });
    setEditingId(null);
    setEditingName("");
  }

  function openRename(folder: ArchiveFolder) {
    setEditingId(folder.id);
    setEditingName(folder.name);
  }

  async function deleteFolder(folder: ArchiveFolder) {
    if (!window.confirm(`${folder.name} 폴더를 삭제할까요? 배치와 문항은 삭제되지 않습니다.`)) return;
    await onDeleteFolder(folder.id);
  }

  function onDragStart(kind: "folder" | "batch", id: string) {
    setDragItem({ kind, id });
  }

  function allowDrop(event: DragEvent) {
    if (!dragItem) return;
    event.preventDefault();
  }

  async function dropTo(folderId: string | null) {
    if (!dragItem) return;
    if (dragItem.kind === "folder") {
      if (dragItem.id === folderId || (folderId && archiveFolderDescendantIds(dragItem.id, folders).includes(folderId))) {
        setDragItem(null);
        return;
      }
      await onUpdateFolder(dragItem.id, { parent_id: folderId });
    } else {
      await onMoveBatch?.(dragItem.id, folderId);
    }
    setDragItem(null);
  }

  return (
    <section className="rounded-[12px] bg-white p-3">
      {!destinationPicker && !compactCreateFolder ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{kicker}</div>
            <h2 className="mt-1 text-sm font-bold text-foreground">{title}</h2>
          </div>
          <div className="flex min-w-[16rem] flex-1 items-center gap-2 sm:flex-none">
            <Input
              className="h-9 min-w-0 border-0 bg-zinc-100 text-sm text-zinc-950 placeholder:text-zinc-500 focus-visible:ring-2 focus-visible:ring-black/15"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  createFolder();
                }
              }}
              placeholder="새 폴더 이름"
            />
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="h-9 w-9 shrink-0 border-0 bg-black text-white hover:bg-zinc-800"
              onClick={createFolder}
              aria-label="새 폴더 만들기"
              title="새 폴더 만들기"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : null}

      {!destinationPicker ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-[10px] bg-zinc-100 px-3 py-2">
          <div className="flex min-w-0 flex-wrap items-center gap-1 text-xs font-semibold text-zinc-700">
            <button type="button" className="rounded-[7px] px-2 py-1 transition hover:bg-white hover:text-zinc-950" onClick={() => onOpenFolder(null)}>
              전체 문항
            </button>
            {currentPath.map((folder, index) => (
              <span key={folder.id} className="inline-flex items-center gap-1">
                <span className="text-zinc-400">/</span>
                <button
                  type="button"
                  className="rounded-[7px] px-2 py-1 transition hover:bg-white hover:text-zinc-950"
                  onClick={() => onOpenFolder(folder.id)}
                >
                  {folder.name}
                </button>
                {index === currentPath.length - 1 ? null : null}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-2">
            {currentFolderId ? (
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="h-8 w-8 border-0 bg-white text-zinc-900 hover:bg-zinc-200"
                onClick={() => onOpenFolder(currentPath.at(-2)?.id || null)}
                aria-label="상위 폴더로 이동"
                title="상위 폴더로 이동"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
            ) : null}
            {mode === "select" ? (
              <Button type="button" size="sm" className="h-8 bg-black text-white hover:bg-zinc-800" disabled={!currentFolderId} onClick={() => onSelectFolder?.(currentFolderId)}>
                <Check className="h-4 w-4" />
                이 위치에 저장
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {mode === "select" && !destinationPicker ? (
        <div className="mt-2 rounded-[10px] bg-zinc-100 px-3 py-2 text-xs font-semibold text-zinc-700">
          선택 위치: {selectedFolderId ? selectedPathLabel : "아직 선택되지 않음"}
        </div>
      ) : null}

      <div className={cn("gap-2", destinationPicker ? "mt-0 flex flex-wrap items-start" : "mt-3 grid [grid-template-columns:repeat(auto-fill,minmax(180px,1fr))]")} onDragOver={allowDrop}>
        {destinationPicker && currentFolderId ? (
          <button
            type="button"
            className="grid h-10 w-10 min-h-0 max-w-[40px] flex-none basis-[40px] place-items-center self-start rounded-[10px] bg-zinc-50 p-0 text-zinc-800 transition-colors hover:bg-zinc-100"
            onClick={() => onOpenFolder(parentFolderId)}
            aria-label="상위 폴더로 이동"
            title="상위 폴더로 이동"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        ) : null}

        {childFolders.map((folder) => {
          const selected = selectedFolderId === folder.id || currentFolderId === folder.id;
          const hasChildFolders = parentIdsWithChildren.has(folder.id);
          const folderBatchIds = archiveFolderBatchIds(folder.id, folders, batches);
          const problemCount = batches.filter((batch) => folderBatchIds.includes(batch.id)).reduce((sum, batch) => sum + (batch.problem_count || 0), 0);
          const color = normalizeHexColor(folder.color) || defaultArchiveFolderColor(folder.name);
          return (
            <div
              key={folder.id}
              draggable
              onDragStart={() => onDragStart("folder", folder.id)}
              onDragEnd={() => setDragItem(null)}
              onDragOver={allowDrop}
              onDrop={(event) => {
                event.preventDefault();
                dropTo(folder.id);
              }}
              className={cn(
                "group relative flex min-h-[82px] cursor-grab items-start gap-3 rounded-[10px] p-3 text-left transition-colors active:cursor-grabbing",
                destinationPicker && "min-w-[180px] flex-[1_1_180px]",
                selected ? "bg-black text-white" : "bg-zinc-50 text-zinc-800 hover:bg-zinc-100"
              )}
              role="button"
              tabIndex={0}
              onClick={() => {
                if (mode === "select") {
                  onOpenFolder(folder.id);
                  return;
                }
                if (hasChildFolders) {
                  onOpenFolder(folder.id);
                  return;
                }
                onSelectFolder?.(folder.id);
              }}
              onDoubleClick={() => {
                if (mode === "select" || hasChildFolders) onOpenFolder(folder.id);
              }}
            >
              <span className="flex w-11 shrink-0 flex-col items-center gap-1 pt-0.5">
                <span className="relative">
                  <Folder className="h-5 w-5" style={{ color }} />
                  <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-[#101010]" style={{ backgroundColor: color }} />
                </span>
                <span className="max-w-full text-center text-[11px] font-semibold leading-none text-muted-foreground" title={`${formatCount(problemCount)}문항`}>
                  {formatCount(problemCount)}
                </span>
              </span>
              <span className="min-w-0 flex-1">
                {editingId === folder.id ? (
                  <span className="flex gap-1">
                    <Input
                      className="h-7 min-w-0 border-0 bg-white text-xs text-zinc-950 focus-visible:ring-2 focus-visible:ring-black/15"
                      value={editingName}
                      onChange={(event) => setEditingName(event.target.value)}
                      onClick={(event) => event.stopPropagation()}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          commitRename(folder);
                        }
                        if (event.key === "Escape") {
                          setEditingId(null);
                          setEditingName("");
                        }
                      }}
                      autoFocus
                    />
                    <button type="button" className="grid h-7 w-7 place-items-center rounded-[7px] bg-black text-white transition hover:bg-zinc-800" onClick={(event) => { event.stopPropagation(); commitRename(folder); }}>
                      <Check className="h-3.5 w-3.5" />
                    </button>
                  </span>
                ) : (
                  <>
                    <span className="block whitespace-normal break-words pr-8 text-sm font-bold leading-5" title={folder.name}>{folder.name}</span>
                  </>
                )}
              </span>
              <span className={cn("absolute right-2 top-2 flex shrink-0 flex-col items-center gap-1 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100", editingId === folder.id && "hidden")}>
                <button type="button" className="grid h-7 w-7 place-items-center rounded-[7px] bg-white text-zinc-600 transition hover:bg-zinc-200 hover:text-zinc-950" onClick={(event) => { event.stopPropagation(); openRename(folder); }}>
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button type="button" className="grid h-7 w-7 place-items-center rounded-[7px] bg-white text-zinc-600 transition hover:bg-zinc-200 hover:text-zinc-950" onClick={(event) => { event.stopPropagation(); deleteFolder(folder); }}>
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </span>
            </div>
          );
        })}

        {showGridCreateFolder ? (
          creatingFolder ? (
            <div className={cn("flex h-11 min-h-0 items-center gap-1.5 self-start rounded-[10px] bg-zinc-50 px-2", destinationPicker && "w-[min(100%,220px)] flex-none")}>
              <Input
                className="h-8 min-w-0 flex-1 border-0 bg-white text-xs font-semibold text-zinc-950 placeholder:text-zinc-500 focus-visible:ring-2 focus-visible:ring-black/15"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    createFolder();
                  }
                  if (event.key === "Escape") {
                    setDraft("");
                    setCreatingFolder(false);
                  }
                }}
                placeholder="폴더명"
                autoFocus
              />
              <Button
                type="button"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={createFolder}
                disabled={!draft.trim()}
                aria-label="새 폴더 만들기"
                title="새 폴더 만들기"
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8 shrink-0 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-950"
                onClick={() => {
                  setDraft("");
                  setCreatingFolder(false);
                }}
                aria-label="새 폴더 입력 닫기"
                title="닫기"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="h-11 w-11 self-start border-0 bg-zinc-50 text-zinc-900 hover:bg-zinc-100"
              onClick={() => setCreatingFolder(true)}
              aria-label="새 폴더 만들기"
              title="새 폴더 만들기"
            >
              <Plus className="h-4 w-4" />
            </Button>
          )
        ) : null}

        {visibleBatches.map((batch) => {
          const selected = selectedBatchId === batch.id;
          const color = normalizeHexColor(batch.accent_color) || "#64748b";
          return (
            <button
              key={batch.id}
              type="button"
              draggable={Boolean(onMoveBatch)}
              className={cn(
                "group flex min-h-[82px] cursor-grab items-start gap-3 rounded-[10px] p-3 text-left transition-colors active:cursor-grabbing",
                selected ? "bg-black text-white" : "bg-zinc-50 text-zinc-800 hover:bg-zinc-100"
              )}
              onClick={() => onSelectBatch?.(batch.id)}
              onDragStart={() => onDragStart("batch", batch.id)}
              onDragEnd={() => setDragItem(null)}
            >
              <span className="flex w-11 shrink-0 flex-col items-center gap-1 pt-0.5">
                <span className="relative">
                  <Folder className="h-5 w-5" style={{ color }} />
                  <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-[#101010]" style={{ backgroundColor: color }} />
                </span>
                <span className="max-w-full text-center text-[11px] font-semibold leading-none text-muted-foreground" title={`${formatCount(batch.problem_count || 0)}문항`}>
                  {formatCount(batch.problem_count || 0)}
                </span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block whitespace-normal break-words pr-9 text-sm font-bold leading-5" title={batch.name}>{batch.name}</span>
              </span>
              {onMoveBatch && batch.archive_folder_id ? (
                <span
                  role="button"
                  tabIndex={0}
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-[7px] bg-white text-zinc-600 opacity-100 transition hover:bg-zinc-200 hover:text-zinc-950 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
                  onClick={(event) => {
                    event.stopPropagation();
                    onMoveBatch(batch.id, null);
                  }}
                  aria-label={`${batch.name} 루트로 이동`}
                >
                  <X className="h-3.5 w-3.5" />
                </span>
              ) : null}
            </button>
          );
        })}

        {!destinationPicker && !loading && !childFolders.length && !visibleBatches.length ? (
          <div className="flex min-h-[82px] items-center rounded-[10px] bg-zinc-50 px-4 text-sm font-semibold text-zinc-500">
            이 위치에는 아직 폴더나 배치가 없습니다.
          </div>
        ) : null}
      </div>
    </section>
  );
}
