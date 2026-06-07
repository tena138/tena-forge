"use client";

import { useMemo, useState, type DragEvent } from "react";
import { Check, ChevronLeft, Folder, FolderPlus, Pencil, Trash2, X } from "lucide-react";

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
  showBatches?: boolean;
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
  showBatches = true,
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [dragItem, setDragItem] = useState<DragItem>(null);

  const currentPath = useMemo(() => archiveFolderPath(currentFolderId, folders), [currentFolderId, folders]);
  const childFolders = useMemo(() => archiveFolderChildren(folders, currentFolderId), [currentFolderId, folders]);
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

  async function createFolder() {
    const name = draft.replace(/\s+/g, " ").trim();
    if (!name) return;
    await onCreateFolder({ name, parent_id: currentFolderId, color: defaultArchiveFolderColor(`${archiveFolderPathLabel(currentFolderId, folders)} > ${name}`) });
    setDraft("");
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
    <section className="rounded-lg border border-white/10 bg-card/60 p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{kicker}</div>
          <h2 className="mt-1 text-sm font-bold text-foreground">{title}</h2>
        </div>
        <div className="flex min-w-[16rem] flex-1 items-center gap-2 sm:flex-none">
          <Input
            className="h-9 min-w-0 border-white/10 bg-black/20 text-sm"
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
          <Button type="button" size="sm" variant="outline" className="h-9 shrink-0" onClick={createFolder}>
            <FolderPlus className="h-4 w-4" />
            새 폴더
          </Button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-white/10 bg-black/15 px-3 py-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1 text-xs font-semibold text-slate-300">
          <button type="button" className="rounded px-2 py-1 transition hover:bg-white/[0.06] hover:text-white" onClick={() => onOpenFolder(null)}>
            전체 문항
          </button>
          {currentPath.map((folder, index) => (
            <span key={folder.id} className="inline-flex items-center gap-1">
              <span className="text-slate-600">/</span>
              <button
                type="button"
                className="rounded px-2 py-1 transition hover:bg-white/[0.06] hover:text-white"
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
            <Button type="button" size="sm" variant="outline" className="h-8" onClick={() => onOpenFolder(currentPath.at(-2)?.id || null)}>
              <ChevronLeft className="h-4 w-4" />
              상위
            </Button>
          ) : null}
          {mode === "select" ? (
            <Button type="button" size="sm" className="h-8" disabled={!currentFolderId} onClick={() => onSelectFolder?.(currentFolderId)}>
              <Check className="h-4 w-4" />
              이 위치에 저장
            </Button>
          ) : null}
        </div>
      </div>

      {mode === "select" ? (
        <div className="mt-2 rounded-md border border-violet-300/20 bg-violet-400/10 px-3 py-2 text-xs font-semibold text-violet-100">
          선택 위치: {selectedFolderId ? selectedPathLabel : "아직 선택되지 않음"}
        </div>
      ) : null}

      <div className="mt-3 grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(180px,1fr))]" onDragOver={allowDrop}>
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
                "group relative flex min-h-[82px] cursor-grab items-start gap-3 rounded-lg border p-3 text-left transition-colors active:cursor-grabbing",
                selected ? "border-[#7F77DD]/70 bg-[#7F77DD]/16 text-white" : "border-white/10 bg-black/15 text-slate-300 hover:border-white/20 hover:bg-white/[0.06]"
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
                  <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-[#111022]" style={{ backgroundColor: color }} />
                </span>
                <span className="max-w-full text-center text-[11px] font-semibold leading-none text-muted-foreground" title={`${formatCount(problemCount)}문항`}>
                  {formatCount(problemCount)}
                </span>
              </span>
              <span className="min-w-0 flex-1">
                {editingId === folder.id ? (
                  <span className="flex gap-1">
                    <Input
                      className="h-7 min-w-0 border-white/10 bg-black/25 text-xs"
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
                    <button type="button" className="grid h-7 w-7 place-items-center rounded border border-white/10 bg-black/30 text-slate-200" onClick={(event) => { event.stopPropagation(); commitRename(folder); }}>
                      <Check className="h-3.5 w-3.5" />
                    </button>
                  </span>
                ) : (
                  <>
                    <span className="block whitespace-normal break-words pr-1 text-sm font-bold leading-5" title={folder.name}>{folder.name}</span>
                  </>
                )}
              </span>
              <span className={cn("absolute right-2 top-2 flex shrink-0 items-center gap-1 opacity-0 transition group-hover:opacity-100", editingId === folder.id && "hidden")}>
                <button type="button" className="grid h-7 w-7 place-items-center rounded-md border border-white/10 bg-black/20 text-slate-300 hover:text-white" onClick={(event) => { event.stopPropagation(); openRename(folder); }}>
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button type="button" className="grid h-7 w-7 place-items-center rounded-md border border-white/10 bg-black/20 text-rose-200 hover:text-rose-50" onClick={(event) => { event.stopPropagation(); deleteFolder(folder); }}>
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </span>
            </div>
          );
        })}

        {visibleBatches.map((batch) => {
          const selected = selectedBatchId === batch.id;
          const color = normalizeHexColor(batch.accent_color) || "#64748b";
          return (
            <button
              key={batch.id}
              type="button"
              draggable={Boolean(onMoveBatch)}
              className={cn(
                "group flex min-h-[82px] cursor-grab items-start gap-3 rounded-lg border p-3 text-left transition-colors active:cursor-grabbing",
                selected ? "border-[#7F77DD]/70 bg-[#7F77DD]/16 text-white" : "border-white/10 bg-black/15 text-slate-300 hover:border-white/20 hover:bg-white/[0.06]"
              )}
              onClick={() => onSelectBatch?.(batch.id)}
              onDragStart={() => onDragStart("batch", batch.id)}
              onDragEnd={() => setDragItem(null)}
            >
              <span className="flex w-11 shrink-0 flex-col items-center gap-1 pt-0.5">
                <span className="relative">
                  <Folder className="h-5 w-5" style={{ color }} />
                  <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-[#111022]" style={{ backgroundColor: color }} />
                </span>
                <span className="max-w-full text-center text-[11px] font-semibold leading-none text-muted-foreground" title={`${formatCount(batch.problem_count || 0)}문항`}>
                  {formatCount(batch.problem_count || 0)}
                </span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block whitespace-normal break-words text-sm font-bold leading-5" title={batch.name}>{batch.name}</span>
              </span>
              {onMoveBatch && batch.archive_folder_id ? (
                <span
                  role="button"
                  tabIndex={0}
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-white/10 bg-black/20 text-slate-400 opacity-0 transition hover:text-white group-hover:opacity-100"
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

        {!loading && !childFolders.length && !visibleBatches.length ? (
          <div className="flex min-h-[82px] items-center rounded-lg border border-dashed border-white/10 bg-black/10 px-4 text-sm font-semibold text-slate-500">
            이 위치에는 아직 폴더나 배치가 없습니다.
          </div>
        ) : null}
      </div>
    </section>
  );
}
