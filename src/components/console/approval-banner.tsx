"use client";

import { useState } from "react";
import { MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { WARNING_BOX, WARNING_MUTED } from "@/components/console/bits";
import { useSendEvents } from "@/lib/platform/queries";
import type { SessionEvent } from "@/lib/platform/types";

function PendingTool({
  event,
  sessionId,
  threadId,
  compact = false,
}: {
  event: SessionEvent;
  sessionId: string;
  threadId?: string;
  compact?: boolean;
}) {
  const send = useSendEvents(sessionId);
  const [denying, setDenying] = useState(false);
  const [denyMessage, setDenyMessage] = useState("");
  const submitted = send.isPending || send.isSuccess;

  const confirm = (result: "allow" | "deny") =>
    send.mutate([
      {
        type: "user.tool_confirmation",
        tool_use_id: event.id,
        result,
        ...((event.session_thread_id ?? threadId)
          ? { session_thread_id: event.session_thread_id ?? threadId }
          : {}),
        ...(result === "deny" && denying && denyMessage
          ? { deny_message: denyMessage }
          : {}),
      },
    ]);

  return (
    <li className="flex flex-wrap items-center gap-2 text-[13px]">
      {!compact && (
        <>
          <span className="font-mono">{event.name}</span>
          <span className={cn("min-w-0 flex-1 truncate", WARNING_MUTED)}>
            {JSON.stringify(event.input)}
          </span>
        </>
      )}
      {denying ? (
        <span className="flex w-full flex-wrap items-center gap-1.5 sm:w-auto">
          <Input
            aria-label="Deny reason"
            autoFocus
            disabled={submitted}
            value={denyMessage}
            onChange={(e) => setDenyMessage(e.target.value)}
            placeholder="Reason (optional)"
            className="h-7 min-w-0 flex-1 bg-background text-[13px] sm:w-56"
          />
          <Button
            size="sm"
            variant="destructive"
            className="h-7"
            disabled={submitted}
            onClick={() => confirm("deny")}
          >
            Deny
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7"
            disabled={submitted}
            onClick={() => {
              setDenying(false);
              setDenyMessage("");
            }}
          >
            Cancel
          </Button>
        </span>
      ) : (
        <span className="flex items-center gap-1.5">
          <Button
            size="sm"
            className="h-7"
            disabled={submitted}
            onClick={() => confirm("allow")}
          >
            Approve
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7"
            disabled={submitted}
            onClick={() => confirm("deny")}
          >
            Deny
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7"
                  aria-label="Approval options"
                  disabled={submitted}
                />
              }
            >
              <MoreHorizontal className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setDenying(true)}>
                Deny with reason…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </span>
      )}
      {send.isSuccess && (
        <span role="status" className="w-full text-muted-foreground">
          Confirmation sent
        </span>
      )}
      {send.error && (
        <span role="alert" className="w-full text-destructive">
          {send.error instanceof Error ? send.error.message : "failed"}
        </span>
      )}
    </li>
  );
}

export function ApprovalBanner({
  pending,
  sessionId,
  threadId,
  inline = false,
}: {
  pending: SessionEvent[];
  sessionId: string;
  threadId?: string;
  inline?: boolean;
}) {
  if (pending.length === 0) return null;
  return (
    <div
      data-testid="approval-banner"
      data-pending-count={pending.length}
      className={
        inline ? undefined : cn("mb-6 rounded-lg border p-4", WARNING_BOX)
      }
    >
      <p className={inline ? "sr-only" : "text-sm font-medium"}>
        Waiting on {pending.length} tool approval
        {pending.length === 1 ? "" : "s"}
      </p>
      <ul className={inline ? "space-y-2" : "mt-2 space-y-2"}>
        {pending.map((event) => (
          <PendingTool
            key={event.id}
            event={event}
            sessionId={sessionId}
            threadId={threadId}
            compact={inline}
          />
        ))}
      </ul>
    </div>
  );
}
