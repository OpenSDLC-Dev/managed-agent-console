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

const STATUS_LABELS = {
  checking: "Checking Platform…",
  up: "Platform Connected",
  denied: "Platform Access Denied",
  down: "Platform Unreachable",
};

export function useConnectionStatus() {
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
  return {
    state,
    label: STATUS_LABELS[state],
    error: data && !data.ok ? data : undefined,
  } as const;
}

export function ConnectionIndicator({
  state,
  label,
}: ReturnType<typeof useConnectionStatus>) {
  return (
    <span
      aria-hidden
      title={label}
      data-testid="connection-dot"
      data-state={state}
      className={cn(
        "absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full border-2 border-sidebar",
        state === "up" && "bg-emerald-500",
        state === "down" && "bg-red-500",
        state === "checking" && "bg-muted-foreground/40",
        state === "denied" && "bg-muted-foreground",
      )}
    />
  );
}

export function ConnectionStatus({
  label,
  error,
}: ReturnType<typeof useConnectionStatus>) {
  return (
    <div className="min-w-0 text-xs text-muted-foreground">
      <div>{label}</div>
      {error && (
        <div className="mt-1 wrap-anywhere">
          {error.message}
          {error.requestId && (
            <span className="block font-mono text-[11px]">
              request-id: {error.requestId}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
