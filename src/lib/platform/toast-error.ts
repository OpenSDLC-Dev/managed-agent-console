import { toast } from "sonner";
import { PlatformError } from "./http";

/**
 * The one standardized toast for a failed platform call: the envelope's
 * message and error type, with the request-id one click away for bug
 * reports. Mutations that surface errors inline opt out via
 * `meta: { errorToast: false }` so every failure has exactly one surface.
 */
export function toastPlatformError(error: unknown, title?: string) {
  const platformError = error instanceof PlatformError ? error : null;
  const message =
    platformError?.message ??
    (error instanceof Error ? error.message : "Something went wrong");
  const requestId = platformError?.requestId;
  toast.error(title ?? "Request failed", {
    description: platformError
      ? `${platformError.errorType}: ${message}`
      : message,
    ...(requestId
      ? {
          action: {
            label: "Copy request-id",
            onClick: () => {
              void navigator.clipboard.writeText(requestId);
            },
          },
        }
      : {}),
  });
}
