import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * A wire token counter, or an honest dash when one did not arrive. The
 * platform renders all four `usage` counters as non-pointer ints
 * (`internal/domain/session.go:20-31`), so a missing one is a broken wire —
 * but losing a whole page to one absent integer is the worst available
 * failure (plan 04 slice 2). Same posture as `session-trace/summary.ts`'s
 * `tokensLine` and plan 03's null-safe time math: say what is known, never
 * guess the rest.
 *
 * The finiteness check is reachable, not defensive theatre: JSON has no `NaN`
 * literal, but it does parse `1e400` to `Infinity`, which `toLocaleString`
 * renders as `∞` (review finding, PR #35).
 */
export const tokenCount = (n: unknown) =>
  typeof n === "number" && Number.isFinite(n) ? n.toLocaleString() : "—";

/**
 * The same counter as a `data-*` attribute value, and **absent** exactly when
 * `tokenCount` renders a dash — so the machine-readable value and the visible
 * one never tell different stories. Without this, an overflowed counter would
 * show "—" while the attribute read `Infinity`, and a test reading the
 * attribute would assert a number no operator can see.
 */
export const tokenAttr = (n: unknown) =>
  typeof n === "number" && Number.isFinite(n) ? n : undefined;
