"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { WARNING_BOX, WARNING_MUTED } from "@/components/console/bits";
import { useSendEvents } from "@/lib/platform/queries";
import type { SessionEvent } from "@/lib/platform/types";

function PendingTool({
  event,
  sessionId,
}: {
  event: SessionEvent;
  sessionId: string;
}) {
  const send = useSendEvents(sessionId);
  const [denying, setDenying] = useState(false);
  const [denyMessage, setDenyMessage] = useState("");

  const confirm = (result: "allow" | "deny") =>
    send.mutate([
      {
        type: "user.tool_confirmation",
        tool_use_id: event.id,
        result,
        ...(result === "deny" && denyMessage
          ? { deny_message: denyMessage }
          : {}),
      },
    ]);

  return (
    <li className="flex flex-wrap items-center gap-2 text-[13px]">
      <span className="font-mono">{event.name}</span>
      <span className={cn("min-w-0 flex-1 truncate", WARNING_MUTED)}>
        {JSON.stringify(event.input)}
      </span>
      {denying ? (
        <span className="flex items-center gap-1.5">
          <Input
            aria-label="Deny reason"
            value={denyMessage}
            onChange={(e) => setDenyMessage(e.target.value)}
            placeholder="Reason (optional)"
            className="h-7 w-56 bg-background text-[13px]"
          />
          <Button
            size="sm"
            variant="destructive"
            className="h-7"
            disabled={send.isPending}
            onClick={() => confirm("deny")}
          >
            Deny
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7"
            onClick={() => setDenying(false)}
          >
            Cancel
          </Button>
        </span>
      ) : (
        <span className="flex items-center gap-1.5">
          <Button
            size="sm"
            className="h-7"
            disabled={send.isPending}
            onClick={() => confirm("allow")}
          >
            Allow
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7"
            disabled={send.isPending}
            onClick={() => setDenying(true)}
          >
            Deny…
          </Button>
        </span>
      )}
      {send.error && (
        <span className="w-full text-destructive">
          {send.error instanceof Error ? send.error.message : "failed"}
        </span>
      )}
    </li>
  );
}

export function ApprovalBanner({
  pending,
  sessionId,
}: {
  pending: SessionEvent[];
  sessionId: string;
}) {
  if (pending.length === 0) return null;
  return (
    <div
      data-testid="approval-banner"
      className={cn("mb-6 rounded-lg border p-4", WARNING_BOX)}
    >
      <p className="text-sm font-medium">
        Waiting on {pending.length} tool approval
        {pending.length === 1 ? "" : "s"}
      </p>
      <ul className="mt-2 space-y-2">
        {pending.map((event) => (
          <PendingTool key={event.id} event={event} sessionId={sessionId} />
        ))}
      </ul>
    </div>
  );
}
