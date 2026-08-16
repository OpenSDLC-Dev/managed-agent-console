"use client";

import { useQuery } from "@tanstack/react-query";
import { bounceToLogin, isSignedOut } from "@/lib/identity/signed-out";
import { cn } from "@/lib/utils";

type ProbeResult =
  { ok: true } | { ok: false; message: string; requestId?: string };

async function probe(): Promise<ProbeResult> {
  let response: Response;
  try {
    response = await fetch("/api/platform/v1/agents?limit=1");
  } catch {
    return { ok: false, message: "console server unreachable" };
  }
  // This poll is the **third** direct consumer of the BFF, and on an idle page
  // it is the only one still running — so if it treated a sign-out as an outage,
  // an operator whose token was revoked would sit in front of "Platform
  // unreachable" indefinitely, with an SSE trace still streaming beside it,
  // because nothing else was left to notice (found in review, PR #95).
  if (isSignedOut(response)) bounceToLogin();
  if (response.ok) return { ok: true };
  const requestId = response.headers.get("request-id") ?? undefined;
  try {
    const body = (await response.json()) as {
      error?: { message?: string };
    };
    return {
      ok: false,
      message: body.error?.message ?? `HTTP ${response.status}`,
      requestId,
    };
  } catch {
    return { ok: false, message: `HTTP ${response.status}`, requestId };
  }
}

export function ConnectionStatus() {
  const { data } = useQuery({
    queryKey: ["connection-probe"],
    queryFn: probe,
    refetchInterval: 30_000,
    refetchOnWindowFocus: false,
  });

  const state = data === undefined ? "checking" : data.ok ? "up" : "down";
  return (
    <div className="px-4 py-3 text-[13px]">
      <div className="flex items-center gap-2">
        <span
          data-testid="connection-dot"
          data-state={state}
          className={cn(
            "size-2 rounded-full",
            state === "up" && "bg-emerald-500",
            state === "down" && "bg-red-500",
            state === "checking" && "bg-muted-foreground/40",
          )}
        />
        <span className="text-sidebar-foreground">
          {state === "up" && "Platform connected"}
          {state === "down" && "Platform unreachable"}
          {state === "checking" && "Checking platform…"}
        </span>
      </div>
      {data && !data.ok && (
        <div className="mt-1 break-words text-muted-foreground">
          {data.message}
          {data.requestId && (
            <span className="block font-mono text-[11px]">
              request-id: {data.requestId}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
