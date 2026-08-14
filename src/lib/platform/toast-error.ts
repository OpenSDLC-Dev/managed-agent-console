import { toast } from "sonner";
import { copyText } from "@/lib/copy-text";
import { DENIED_TITLE, ROLE_NOTE, isPermissionDenied } from "./denied";
import { PlatformError } from "./http";

/**
 * The one standardized toast for a failed platform call: the envelope's
 * message and error type, with the request-id one click away for bug
 * reports. Mutations that surface errors inline opt out via
 * `meta: { errorToast: false }` so every failure has exactly one surface.
 *
 * A **403 is titled and worded as a denial** rather than a failure. The console
 * shows every control because it cannot know which the operator may use (plan 08
 * D4), so this toast is where an operator finds out — and "Request failed" would
 * invite them to retry something that will answer the same way until somebody
 * changes their role. An explicit `title` still wins: a call site that already
 * knows what was refused says it better than this can.
 */
export function toastPlatformError(error: unknown, title?: string) {
  const platformError = error instanceof PlatformError ? error : null;
  const denied = isPermissionDenied(error);
  const message =
    platformError?.message ??
    (error instanceof Error ? error.message : "Something went wrong");
  const requestId = platformError?.requestId;
  toast.error(title ?? (denied ? DENIED_TITLE : "Request failed"), {
    description: denied
      ? `${message} ${ROLE_NOTE}`
      : platformError
        ? `${platformError.errorType}: ${message}`
        : message,
    ...(requestId
      ? {
          action: {
            label: "Copy request-id",
            onClick: () => {
              void copyText(requestId);
            },
          },
        }
      : {}),
  });
}
