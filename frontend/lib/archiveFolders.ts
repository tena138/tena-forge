import {
  ArchiveFolder,
  Batch,
  createArchiveFolder,
  updateBatchArchiveFolder,
} from "@/lib/api";

export const legacyBatchFoldersStorageKey = "tena.problemBrowser.batchFolders";
export const legacyCustomSubjectsStorageKey = "tena-forge-upload-custom-subjects-v2";
const customSubjectMigrationKey = "tena.archiveFolders.migrated.customSubjects.v1";
const batchFolderMigrationKey = "tena.archiveFolders.migrated.batchFolders.v1";
const palette = ["#8b5cf6", "#0ea5e9", "#14b8a6", "#22c55e", "#eab308", "#f97316", "#ec4899", "#6366f1", "#06b6d4", "#84cc16"];
type SubjectEngineCode = "math" | "korean" | "english";

type LegacyBatchFolder = {
  id: string;
  name: string;
  parentId: string | null;
  batchIds: string[];
  order: number;
};

function hashText(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

export function defaultArchiveFolderColor(value: string) {
  return palette[hashText(value) % palette.length];
}

export function normalizeFolderName(value: string | null | undefined) {
  return (value || "").replace(/\s+/g, " ").trim();
}

export function splitFolderPath(value: string | null | undefined) {
  return normalizeFolderName(value)
    .split(/\s*(?:>|\/|›|→)\s*/g)
    .map(normalizeFolderName)
    .filter(Boolean);
}

export function sortArchiveFolders(folders: ArchiveFolder[]) {
  return [...folders].sort((left, right) => {
    const orderDelta = (left.order || 0) - (right.order || 0);
    if (orderDelta) return orderDelta;
    return left.created_at.localeCompare(right.created_at) || left.name.localeCompare(right.name, "ko-KR");
  });
}

export function archiveFolderChildren(folders: ArchiveFolder[], parentId: string | null) {
  return sortArchiveFolders(folders.filter((folder) => (folder.parent_id || null) === (parentId || null)));
}

export function archiveFolderPath(folderId: string | null | undefined, folders: ArchiveFolder[]) {
  if (!folderId) return [];
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const path: ArchiveFolder[] = [];
  const seen = new Set<string>();
  let current = byId.get(folderId);
  while (current && !seen.has(current.id)) {
    path.unshift(current);
    seen.add(current.id);
    current = current.parent_id ? byId.get(current.parent_id) : undefined;
  }
  return path;
}

export function archiveFolderPathLabel(folderId: string | null | undefined, folders: ArchiveFolder[]) {
  const path = archiveFolderPath(folderId, folders);
  return path.length ? path.map((folder) => folder.name).join(" > ") : "전체 문항";
}

export function archiveFolderDescendantIds(folderId: string, folders: ArchiveFolder[]) {
  const output = new Set<string>([folderId]);
  const visit = (parentId: string) => {
    for (const child of folders.filter((folder) => folder.parent_id === parentId)) {
      if (output.has(child.id)) continue;
      output.add(child.id);
      visit(child.id);
    }
  };
  visit(folderId);
  return [...output];
}

export function archiveFolderBatchIds(folderId: string | null, folders: ArchiveFolder[], batches: Batch[]) {
  if (!folderId) return batches.filter((batch) => !batch.archive_folder_id).map((batch) => batch.id);
  const folderIds = new Set(archiveFolderDescendantIds(folderId, folders));
  return batches.filter((batch) => batch.archive_folder_id && folderIds.has(batch.archive_folder_id)).map((batch) => batch.id);
}

function inferFolderEngine(parts: string[]): SubjectEngineCode {
  const compact = parts.join(" ").replace(/\s+/g, "").toLowerCase();
  if (compact.includes("english") || compact.includes("eng") || compact.includes("영어")) return "english";
  if (compact.includes("korean") || compact.includes("kor") || compact.includes("국어")) return "korean";
  return "math";
}

function readJsonArray(key: string) {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function ensureFolderPath(parts: string[], folders: ArchiveFolder[], subjectEngine: SubjectEngineCode) {
  let parentId: string | null = null;
  let currentFolders = folders;
  let created = false;
  for (const part of parts) {
    const name = normalizeFolderName(part);
    if (!name) continue;
    let folder = currentFolders.find((item) => (item.parent_id || null) === parentId && item.name === name && (item.subject_engine || "math") === subjectEngine);
    if (!folder) {
      folder = await createArchiveFolder({
        name,
        parent_id: parentId,
        subject_engine: subjectEngine,
        color: defaultArchiveFolderColor(parts.join(" > ")),
      });
      currentFolders = [...currentFolders, folder];
      created = true;
    }
    parentId = folder.id;
  }
  return { folderId: parentId, folders: currentFolders, changed: created };
}

export async function migrateCustomSubjectFolders(folders: ArchiveFolder[], subjectEngine: SubjectEngineCode) {
  const migrationKey = `${customSubjectMigrationKey}.${subjectEngine}`;
  if (typeof window === "undefined" || window.localStorage.getItem(migrationKey) === "done") {
    return { folders, changed: false };
  }
  const values = readJsonArray(legacyCustomSubjectsStorageKey).map((value) => String(value || ""));
  let currentFolders = folders;
  let changed = false;
  for (const value of values) {
    const parts = splitFolderPath(value);
    if (!parts.length) continue;
    if (inferFolderEngine(parts) !== subjectEngine) continue;
    const result = await ensureFolderPath(parts, currentFolders, subjectEngine);
    currentFolders = result.folders;
    changed = changed || result.changed;
  }
  window.localStorage.setItem(migrationKey, "done");
  return { folders: currentFolders, changed };
}

function readLegacyBatchFolders(): LegacyBatchFolder[] {
  return readJsonArray(legacyBatchFoldersStorageKey)
    .map((folder, index): LegacyBatchFolder | null => {
      if (!folder || typeof folder !== "object") return null;
      const raw = folder as Partial<LegacyBatchFolder>;
      const id = String(raw.id || "");
      const name = normalizeFolderName(raw.name);
      if (!id || !name) return null;
      return {
        id,
        name,
        parentId: raw.parentId ? String(raw.parentId) : null,
        batchIds: Array.isArray(raw.batchIds) ? raw.batchIds.map(String).filter(Boolean) : [],
        order: Number.isFinite(Number(raw.order)) ? Number(raw.order) : index,
      };
    })
    .filter((folder): folder is LegacyBatchFolder => Boolean(folder));
}

function legacyFolderPath(folder: LegacyBatchFolder, folders: LegacyBatchFolder[]) {
  const byId = new Map(folders.map((item) => [item.id, item]));
  const path: string[] = [];
  const seen = new Set<string>();
  let current: LegacyBatchFolder | undefined = folder;
  while (current && !seen.has(current.id)) {
    path.unshift(current.name);
    seen.add(current.id);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return path;
}

export async function migrateLegacyBatchFolders(folders: ArchiveFolder[], batches: Batch[], subjectEngine: SubjectEngineCode) {
  const migrationKey = `${batchFolderMigrationKey}.${subjectEngine}`;
  if (typeof window === "undefined" || window.localStorage.getItem(migrationKey) === "done") {
    return { folders, changed: false };
  }
  const legacyFolders = readLegacyBatchFolders();
  const batchIds = new Set(batches.map((batch) => batch.id));
  let currentFolders = folders;
  let changed = false;
  const folderIdByLegacyId = new Map<string, string>();

  for (const folder of legacyFolders) {
    const path = legacyFolderPath(folder, legacyFolders);
    const folderBatchEngines = folder.batchIds
      .map((batchId) => batches.find((batch) => batch.id === batchId)?.subject_engine || null)
      .filter(Boolean);
    const inferredEngine = folderBatchEngines[0] || inferFolderEngine(path);
    if (inferredEngine !== subjectEngine) continue;
    const result = await ensureFolderPath(path, currentFolders, subjectEngine);
    currentFolders = result.folders;
    changed = changed || result.changed;
    if (result.folderId) folderIdByLegacyId.set(folder.id, result.folderId);
  }
  for (const folder of legacyFolders) {
    const targetId = folderIdByLegacyId.get(folder.id);
    if (!targetId) continue;
    for (const batchId of folder.batchIds) {
      if (!batchIds.has(batchId)) continue;
      const batch = batches.find((item) => item.id === batchId);
      if ((batch?.subject_engine || "math") !== subjectEngine) continue;
      await updateBatchArchiveFolder(batchId, targetId);
      changed = true;
    }
  }
  window.localStorage.setItem(migrationKey, "done");
  return { folders: currentFolders, changed };
}
