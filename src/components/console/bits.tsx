import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { PlatformError } from "@/lib/platform/http";

/** Monospace resource id, truncated with the full value on hover. */
export function IdCode({ id }: { id: string }) {
  return (
    <span className="font-mono text-[13px] text-muted-foreground" title={id}>
      {id.length > 18 ? `${id.slice(0, 15)}…` : id}
    </span>
  );
}

/** Deterministic short UTC timestamp, e.g. "Aug 2, 2026, 09:12". */
export function Time({ iso }: { iso: string | null | undefined }) {
  if (!iso) return <span className="text-muted-foreground">—</span>;
  const formatted = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).format(new Date(iso));
  return <span title={iso}>{formatted}</span>;
}

/**
 * Warning surface, one definition for every approval-related callout so the
 * palette stays consistent and keeps contrast in dark mode.
 */
export const WARNING_BOX =
  "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200";
export const WARNING_MUTED = "text-amber-700 dark:text-amber-300";

const SESSION_STATUS_STYLE: Record<string, string> = {
  running: "bg-emerald-50 text-emerald-700 border-emerald-200",
  idle: "bg-secondary text-secondary-foreground border-transparent",
  rescheduling: "bg-amber-50 text-amber-700 border-amber-200",
  terminated: "bg-red-50 text-red-700 border-red-200",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge
      variant="outline"
      className={cn("font-normal", SESSION_STATUS_STYLE[status])}
    >
      {status}
    </Badge>
  );
}

export function ArchivedBadge({ archivedAt }: { archivedAt?: string | null }) {
  if (!archivedAt) return null;
  return (
    <Badge variant="outline" className="font-normal text-muted-foreground">
      archived
    </Badge>
  );
}

export function ErrorState({ error }: { error: unknown }) {
  const platformError = error instanceof PlatformError ? error : null;
  return (
    <div className="flex h-40 flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-sm">
      <span className="text-destructive">
        {platformError?.message ??
          (error instanceof Error ? error.message : "Something went wrong")}
      </span>
      {platformError?.requestId && (
        <span className="font-mono text-[11px] text-muted-foreground">
          request-id: {platformError.requestId}
        </span>
      )}
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex h-56 flex-col items-center justify-center gap-1">
      <p className="text-sm">{title}</p>
      {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
    </div>
  );
}
