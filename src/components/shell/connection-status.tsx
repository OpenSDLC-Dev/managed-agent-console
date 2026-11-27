"use client";

import { useContext, useSyncExternalStore } from "react";
import { onlineManager, useQuery } from "@tanstack/react-query";
import { playgroundOnly } from "@/lib/routes";
import { ConsoleSessionContext } from "./console-session";
import { bounceToLogin, isSignedOut } from "@/lib/identity/signed-out";
import { cn } from "@/lib/utils";
import { selectedOptions } from "@/lib/platform/tenancy";
import { resourceURL } from "@/lib/platform/http";

type ProbeResult =
  | { ok: true }
  | { ok: false; message: string; requestId?: string; denied?: boolean };

async function probe(): Promise<ProbeResult> {
  let response: Response;
  try {
    response = await fetch(`${resourceURL("v1/agents")}?limit=1`, {
      cache: "no-store",
      ...selectedOptions(),
    });
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

const subscribeOnline = (notify: () => void) => onlineManager.subscribe(notify);

export function useConnectionStatus() {
  const session = useContext(ConsoleSessionContext);
  const sessionOnly = playgroundOnly(session?.data);
  const online = useSyncExternalStore(
    subscribeOnline,
    () => onlineManager.isOnline(),
    () => true,
  );
  const { data: probeResult } = useQuery({
    queryKey: ["connection-probe"],
    queryFn: probe,
    enabled: !sessionOnly,
    networkMode: "always",
    refetchInterval: 30_000,
    refetchOnReconnect: "always",
    refetchOnWindowFocus: false,
  });

  let data: ProbeResult | undefined = probeResult;
  if (!online) {
    data = { ok: false, message: "Network offline" };
  } else if (sessionOnly && session) {
    // Playground accounts already poll the native session and cannot read agents.
    data = session.isRefetchError
      ? { ok: false, message: session.error.message }
      : { ok: true };
  }

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
        (state === "up" || state === "denied") && "bg-emerald-500",
        state === "down" && "bg-red-500",
        state === "checking" && "bg-muted-foreground/40",
      )}
    />
  );
}

export function ConnectionStatus({
  label,
  error,
}: ReturnType<typeof useConnectionStatus>) {
  if (!error) return null;
  return (
    <div role="status" className="min-w-0 text-xs text-muted-foreground">
      <div>{label}</div>
      <div className="mt-1 wrap-anywhere">
        {error.message}
        {error.requestId && (
          <span className="block font-mono text-[11px]">
            request-id: {error.requestId}
          </span>
        )}
      </div>
    </div>
  );
}
