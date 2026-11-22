"use client";

import { useState } from "react";
import { Check, Copy, X } from "lucide-react";
import { copyText } from "@/lib/copy-text";
import { cn } from "@/lib/utils";
import { IdCode } from "@/components/console/bits";

/** One-click copy; the full id is the clipboard payload, never the shortened form. */
export function CopyIdButton({
  id,
  showValue,
}: {
  id: string;
  showValue?: boolean;
}) {
  const [copied, setCopied] = useState<"ok" | "fail" | null>(null);
  return (
    <button
      type="button"
      aria-label={`Copy ${id}`}
      title="Copy id"
      className={cn(
        "rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground",
        showValue &&
          "group/copy inline-flex min-w-0 items-center gap-1 text-left font-mono text-xs",
      )}
      onClick={(event) => {
        event.stopPropagation();
        void copyText(id).then((ok) => {
          setCopied(ok ? "ok" : "fail");
          window.setTimeout(() => setCopied(null), 1500);
        });
      }}
    >
      {showValue && <span className="min-w-0 break-all">{id}</span>}
      {copied === "ok" ? (
        <Check className="size-3" />
      ) : copied === "fail" ? (
        <X className="size-3 text-destructive" />
      ) : (
        <Copy
          className={cn(
            "size-3",
            showValue &&
              "shrink-0 opacity-0 group-hover/copy:opacity-100 group-focus-visible/copy:opacity-100 [@media(hover:none)]:opacity-100",
          )}
        />
      )}
    </button>
  );
}

/** List-cell id: shortened display plus a copy control. */
export function IdCell({ id }: { id: string }) {
  return (
    <span
      className="inline-flex items-center gap-0.5"
      data-testid="id-cell"
      data-id={id}
    >
      <IdCode id={id} />
      <CopyIdButton id={id} />
    </span>
  );
}
