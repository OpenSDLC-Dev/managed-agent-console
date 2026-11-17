"use client";

import { useQuery } from "@tanstack/react-query";
import { bounceToLogin, isSignedOut } from "@/lib/identity/signed-out";
import { cn } from "@/lib/utils";
import { resourceURL } from "@/lib/platform/http";

type ProbeResult =
  | { ok: true }
  | { ok: false; message: string; requestId?: string; denied?: boolean };

async function probe(): Promise<ProbeResult> {
  let response: Response;
  try {
    response = await fetch(`${resourceURL("v1/agents")}?limit=1`);
  } catch {
    return { ok: false, message: "console server unreachable" };
  }
  // This idle poll must observe session loss too. A marked refusal leaves the
  // old document; an ordinary role refusal only changes the status below.
  if (isSignedOut(response)) bounceToLogin();
  if (response.ok) return { ok: true };
  const requestId = response.headers.get("request-id") ?? undefined;
  try {
    const body = (await response.json()) as {
      error?: { type?: string; message?: string };
    };
    return {
      ok: false,
      message: body.error?.message ?? `HTTP ${response.status}`,
      requestId,
      // The agents read also refuses a signed-in user with no resource access.
      // That is not an outage; a bare intermediary 403 remains a fault.
      denied:
        response.status === 403 && body.error?.type === "permission_error",
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

  const state =
    data === undefined
      ? "checking"
      : data.ok
        ? "up"
        : data.denied
          ? "denied"
          : "down";
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
            state === "denied" && "bg-muted-foreground",
          )}
        />
        <span className="text-sidebar-foreground">
          {state === "up" && "Platform Connected"}
          {state === "down" && "Platform Unreachable"}
          {state === "denied" && "Platform Access Denied"}
          {state === "checking" && "Checking Platform…"}
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
