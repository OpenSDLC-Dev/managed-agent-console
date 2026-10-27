import { PlatformError } from "./http";

/**
 * A platform refusal, not feature absence or a reason to end the session.
 * Collection-read refusals hide entry points; a successful read says nothing
 * about writes, whose controls still let the platform decide (plan 08 D4).
 *
 * Require the envelope as well as the status. An identity proxy or WAF may
 * answer 403 in HTML; that is not evidence about this account's access.
 * The control plane and gateway both use permission_error for their denials.
 */
export function isPermissionDenied(error: unknown): boolean {
  return (
    error instanceof PlatformError &&
    error.status === 403 &&
    error.errorType === "permission_error"
  );
}

/**
 * Keep guidance independent of roles. The control plane names the required
 * role; the gateway also names the caller's. Neither is a capability response.
 */
export const ROLE_NOTE =
  "The platform refused this request. Ask an administrator to check your access.";

/** The toast's title for a denial: "Request failed" invites a retry that cannot help. */
export const DENIED_TITLE = "Not permitted";
