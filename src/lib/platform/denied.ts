import { PlatformError } from "./http";

/**
 * A refusal the operator cannot fix by retrying.
 *
 * The console renders every control it has and lets the platform decide — plan
 * 08 D4, because the platform has no route that would tell us what the operator
 * may do, and inferring it here would be a second copy of the authority rules
 * (CLAUDE.md principle 5). The cost of that choice is that a denial arrives as a
 * failed request, so this is the one place that says a 403 is a different kind
 * of answer from a 500: not a fault, not worth a retry, and not the platform's
 * problem to fix.
 */
export function isPermissionDenied(error: unknown): boolean {
  return error instanceof PlatformError && error.status === 403;
}

/**
 * What the platform's denial says, and what it deliberately does not.
 *
 * `requireRole` names **the role the route requires** and never the caller's
 * (`internal/api/identitylane.go`), which is what makes the message actionable —
 * it is exactly what an operator has to ask an administrator for — while telling
 * a prober nothing about who they got in as. This line exists because on its own
 * that message reads as a statement about the route rather than about them.
 */
export const ROLE_NOTE =
  "Your account does not have this role. The message names the role the platform requires, not the one you hold.";

/** The toast's title for a denial: "Request failed" invites a retry that cannot help. */
export const DENIED_TITLE = "Not permitted";
