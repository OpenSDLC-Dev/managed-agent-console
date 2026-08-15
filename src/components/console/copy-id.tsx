"use client";

import { useState } from "react";
import { Check, Copy, X } from "lucide-react";
import { copyText } from "@/lib/copy-text";
import { IdCode } from "@/components/console/bits";

/** One-click copy; the full id is the clipboard payload, never the shortened form. */
export function CopyIdButton({ id }: { id: string }) {
  const [copied, setCopied] = useState<"ok" | "fail" | null>(null);
  return (
    <button
      type="button"
      aria-label={`Copy ${id}`}
      title="Copy id"
      className="rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
      onClick={(event) => {
        event.stopPropagation();
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
