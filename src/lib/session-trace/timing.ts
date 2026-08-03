import type { SessionEvent } from "@/lib/platform/types";

/**
 * Presentation-time derivations over the served event log (plan 03,
 * decision 1): pure functions, framework-free, null-safe on `processed_at`
 * (the platform stamps inbound tool results at settlement, so events can be
 * unstamped mid-turn). Nothing here recomputes session state.
 */

const parse = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
};

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Elapsed clock position since the session's `created_at` — "0:09",
 * "21:45:00" — clamped at zero for skewed stamps. Null when either side is
 * missing or unparsable.
 */
export function offsetLabel(
  originIso: string | null | undefined,
  iso: string | null | undefined,
): string | null {
  const origin = parse(originIso);
  const at = parse(iso);
  if (origin === null || at === null) return null;
  const total = Math.max(0, Math.floor((at - origin) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** Compact duration — "<1s", "3s", "1m 04s", "2h 15m", "3d 2h". */
export function durationLabel(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 1) return "<1s";
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${pad(s % 60)}s`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${pad(m % 60)}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

/**
 * Model-call durations keyed by the end event's id, pairing
 * `span.model_request_end.model_request_start_id` with its start event.
 * Unpaired or unstamped spans are skipped, never guessed.
 */
export function modelSpanDurations(
  events: SessionEvent[],
): Map<string, number> {
  const starts = new Map<string, number>();
  for (const event of events) {
    if (event.type !== "span.model_request_start") continue;
    const at = parse(event.processed_at);
    if (at !== null) starts.set(event.id, at);
  }
  const durations = new Map<string, number>();
  for (const event of events) {
    if (event.type !== "span.model_request_end") continue;
    const startId = event.model_request_start_id;
    const end = parse(event.processed_at);
    if (typeof startId !== "string" || end === null) continue;
    const start = starts.get(startId);
    if (start === undefined || end < start) continue;
    durations.set(event.id, end - start);
  }
  return durations;
}

/** Gaps shorter than this are churn, not a story beat worth a band. */
export const IDLE_BAND_THRESHOLD_MS = 5_000;

/**
 * Idle intervals worth rendering as bands, keyed by the `session.status_idle`
 * event's id, valued in milliseconds to the next `session.status_running`.
 */
export function idleGaps(
  events: SessionEvent[],
  thresholdMs = IDLE_BAND_THRESHOLD_MS,
): Map<string, number> {
  const gaps = new Map<string, number>();
  for (let i = 0; i < events.length; i++) {
    const idle = events[i];
    if (idle.type !== "session.status_idle") continue;
    const idleAt = parse(idle.processed_at);
    if (idleAt === null) continue;
    for (let j = i + 1; j < events.length; j++) {
      if (events[j].type !== "session.status_running") continue;
      const runningAt = parse(events[j].processed_at);
      if (runningAt !== null && runningAt - idleAt >= thresholdMs) {
        gaps.set(idle.id, runningAt - idleAt);
      }
      break;
    }
  }
  return gaps;
}

/** Relative age — "22 hours ago" — for the created chip. */
export function ageLabel(
  iso: string | null | undefined,
  nowMs = Date.now(),
): string | null {
  const at = parse(iso);
  if (at === null) return null;
  const s = Math.max(0, Math.floor((nowMs - at) / 1000));
  if (s < 60) return "just now";
  const unit = (value: number, name: string) =>
    `${value} ${name}${value === 1 ? "" : "s"} ago`;
  const minutes = Math.floor(s / 60);
  if (minutes < 60) return unit(minutes, "minute");
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return unit(hours, "hour");
  return unit(Math.floor(hours / 24), "day");
}
