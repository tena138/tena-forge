"use client";

export type ProblemSetExportHistoryItem = {
  id: string;
  problemSetId: string | null;
  problemSetName?: string | null;
  source: "set" | "selection";
  examTitle: string;
  templateTitle?: string | null;
  templateKind?: string | null;
  output?: string | null;
  count: number;
  includeSolution: boolean;
  exportedAt: string;
};

export const PROBLEM_SET_EXPORT_HISTORY_EVENT = "tena-forge:problem-set-export-history";

const STORAGE_KEY = "tena-forge-problem-set-export-history-v1";
const HISTORY_LIMIT = 30;

function isHistoryItem(value: unknown): value is ProblemSetExportHistoryItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<ProblemSetExportHistoryItem>;
  return typeof item.id === "string" && typeof item.examTitle === "string" && typeof item.exportedAt === "string";
}

function readAllProblemSetExportHistory() {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter(isHistoryItem) : [];
  } catch {
    return [];
  }
}

function writeAllProblemSetExportHistory(items: ProblemSetExportHistoryItem[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, HISTORY_LIMIT)));
  window.dispatchEvent(new CustomEvent(PROBLEM_SET_EXPORT_HISTORY_EVENT));
}

export function readProblemSetExportHistory(problemSetId?: string | null) {
  const items = readAllProblemSetExportHistory().sort((a, b) => Date.parse(b.exportedAt) - Date.parse(a.exportedAt));
  return problemSetId ? items.filter((item) => item.problemSetId === problemSetId) : items;
}

export function rememberProblemSetExport(item: Omit<ProblemSetExportHistoryItem, "id" | "exportedAt"> & { exportedAt?: string }) {
  const randomId = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  const entry: ProblemSetExportHistoryItem = {
    ...item,
    id: randomId,
    exportedAt: item.exportedAt || new Date().toISOString(),
  };
  writeAllProblemSetExportHistory([entry, ...readAllProblemSetExportHistory()]);
  return entry;
}
