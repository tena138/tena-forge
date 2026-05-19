import { Badge } from "@/components/ui/badge";
import { BatchStatus, statusLabel } from "@/lib/api";

const statusStyles: Record<BatchStatus, string> = {
  pending: "bg-white/[0.06] text-slate-300 ring-1 ring-white/12",
  processing: "bg-blue-400/12 text-blue-200 ring-1 ring-blue-400/25",
  done: "bg-violet-500/90 text-white ring-1 ring-violet-400/40 shadow-sm",
  error: "bg-red-400/12 text-red-200 ring-1 ring-red-400/25",
};

export function StatusBadge({ status }: { status: BatchStatus }) {
  return <Badge variant="outline" className={statusStyles[status]}>{statusLabel(status)}</Badge>;
}
