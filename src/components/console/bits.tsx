"use client";

import { useState } from "react";
import { Check, Copy, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { copyText } from "@/lib/copy-text";
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
  running:
    "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/50",
  idle: "bg-secondary text-secondary-foreground border-transparent",
  rescheduling:
    "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/50",
  terminated:
    "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900/50",
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

/** Request-id from the platform's error envelope, one click to copy. */
export function RequestId({ id }: { id: string }) {
  const [copied, setCopied] = useState<"ok" | "fail" | null>(null);
  return (
    <span className="inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground">
      request-id: {id}
      <button
        type="button"
        aria-label="Copy request-id"
        title="Copy request-id"
        className="rounded p-0.5 hover:bg-secondary hover:text-foreground"
        onClick={() => {
          void copyText(id).then((ok) => {
            setCopied(ok ? "ok" : "fail");
            window.setTimeout(() => setCopied(null), 1500);
          });
        }}
      >
        {copied === "ok" ? (
          <Check className="size-3" />
        ) : copied === "fail" ? (
          <X className="size-3 text-destructive" />
        ) : (
          <Copy className="size-3" />
        )}
      </button>
    </span>
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
      {platformError?.requestId && <RequestId id={platformError.requestId} />}
    </div>
  );
}

/** Placeholder for a detail page while its resource loads. */
export function DetailSkeleton() {
  return (
    <div aria-busy="true" className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-80" />
      </div>
      <div className="space-y-3 pt-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex gap-6">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-64" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Placeholder lines for a loading list or trace pane. */
export function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div aria-busy="true" className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-4 w-full max-w-md" />
      ))}
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
