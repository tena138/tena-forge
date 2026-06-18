import { Badge } from "@/components/ui/badge";
import { BatchStatus, statusLabel } from "@/lib/api";

const statusStyles: Record<BatchStatus, string> = {
  pending: "bg-white/[0.06] text-slate-300 ring-1 ring-white/12",
  processing: "bg-white/[0.10] text-zinc-100 ring-1 ring-white/20",
  done: "bg-white text-black ring-1 ring-white/50 shadow-sm",
  error: "bg-black text-white ring-2 ring-white/35",
};

export function StatusBadge({ status }: { status: BatchStatus }) {
  return <Badge variant="outline" className={statusStyles[status]}>{statusLabel(status)}</Badge>;
}
