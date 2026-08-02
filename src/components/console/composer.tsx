"use client";

import { useState } from "react";
import { OctagonX, SendHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSendEvents } from "@/lib/platform/queries";

export function Composer({
  sessionId,
  running,
  disabled,
}: {
  sessionId: string;
  running: boolean;
  disabled?: boolean;
}) {
  const send = useSendEvents(sessionId);
  const [text, setText] = useState("");

  const message = { type: "user.message", content: [{ type: "text", text }] };

  const sendMessage = () => {
    if (!text.trim()) return;
    send.mutate([message], { onSuccess: () => setText("") });
  };

  // The documented redirect: interrupt and the new message in one batch.
  const interruptAndSend = () => {
    if (!text.trim()) return;
    send.mutate([{ type: "user.interrupt" }, message], {
      onSuccess: () => setText(""),
    });
  };

  const interrupt = () => send.mutate([{ type: "user.interrupt" }]);

  return (
    <div className="rounded-lg border bg-card p-3">
      <textarea
        aria-label="Message to the session"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (running) return; // choose explicitly while running
            sendMessage();
          }
        }}
        placeholder={
          running
            ? "Session is running — send will queue, or interrupt & redirect."
            : "Send a message to this session…"
        }
        disabled={disabled || send.isPending}
        rows={2}
        className="w-full resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      />
      <div className="flex items-center justify-between pt-2">
        <div className="text-[12px] text-destructive">
          {send.error instanceof Error ? send.error.message : ""}
        </div>
        <div className="flex items-center gap-2">
          {running && (
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              disabled={disabled || send.isPending}
              onClick={interrupt}
            >
              <OctagonX className="size-4" /> Interrupt
            </Button>
          )}
          {running && text.trim() && (
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              disabled={disabled || send.isPending}
              onClick={interruptAndSend}
            >
              Interrupt & send
            </Button>
          )}
          <Button
            size="sm"
            className="h-8"
            disabled={disabled || send.isPending || !text.trim()}
            onClick={sendMessage}
          >
            <SendHorizontal className="size-4" /> Send
          </Button>
        </div>
      </div>
    </div>
  );
}
