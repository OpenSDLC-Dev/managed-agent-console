import type { Session, SessionEvent } from "@/lib/platform/types";
import { useNow } from "@/lib/session-trace/use-now";
import { durationLabel } from "@/lib/session-trace/timing";
import { tokenAttr, tokenCount } from "@/lib/utils";

export function SessionTokenSummary({
  usage,
  compact = false,
}: {
  usage: Session["usage"] | undefined;
  compact?: boolean;
}) {
  const read = tokenAttr(usage?.cache_read_input_tokens);
  const uncached = tokenAttr(usage?.input_tokens);
  const oneHour = tokenAttr(usage?.cache_creation?.ephemeral_1h_input_tokens);
  const fiveMinutes = tokenAttr(
    usage?.cache_creation?.ephemeral_5m_input_tokens,
  );
  const input =
    uncached !== undefined &&
    read !== undefined &&
    oneHour !== undefined &&
    fiveMinutes !== undefined
      ? uncached + read + oneHour + fiveMinutes
      : undefined;
  return (
    <span
      data-testid={compact ? "tokens-cell" : "usage-chip"}
      data-input-tokens={uncached}
      data-total-input-tokens={tokenAttr(input)}
      data-output-tokens={tokenAttr(usage?.output_tokens)}
      data-cache-read-tokens={read}
      title={`Uncached input ${tokenCount(uncached)} · Cache read ${tokenCount(read)} · Cache write (5m) ${tokenCount(fiveMinutes)} · Cache write (1h) ${tokenCount(oneHour)}`}
    >
      {compact
        ? `${tokenCount(input)} / ${tokenCount(usage?.output_tokens)}`
        : `${tokenCount(input)} in · ${tokenCount(usage?.output_tokens)} out`}
    </span>
  );
}

export function activeTimeLabel(seconds: number | undefined) {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds < 0)
    return undefined;
  return seconds === 0 ? "0s" : durationLabel(seconds * 1000);
}

export function lastSessionActivity(session: Session, events: SessionEvent[]) {
  let last = session.updated_at || session.created_at;
  for (const event of events) {
    if (event.processed_at && Date.parse(event.processed_at) > Date.parse(last))
      last = event.processed_at;
  }
  if (session.archived_at && Date.parse(session.archived_at) > Date.parse(last))
    last = session.archived_at;
  return last;
}

export function SessionElapsed({
  session,
  events,
}: {
  session: Session;
  events: SessionEvent[];
}) {
  const now = useNow();
  const terminal = events.find(
    (event) => event.type === "session.status_terminated" && event.processed_at,
  )?.processed_at;
  const end = terminal ?? session.archived_at;
  if (!end && session.status === "terminated") return null;
  const elapsedMs =
    (end ? Date.parse(end) : now) - Date.parse(session.created_at);
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return null;
  return (
    <span data-session-elapsed-ms={elapsedMs}>
      Elapsed {durationLabel(elapsedMs)}
    </span>
  );
}
