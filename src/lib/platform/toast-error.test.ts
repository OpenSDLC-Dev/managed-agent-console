import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { copyText } from "@/lib/copy-text";
import { DENIED_TITLE, ROLE_NOTE } from "./denied";
import { PlatformError } from "./http";
import { toastPlatformError } from "./toast-error";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
vi.mock("@/lib/copy-text", () => ({ copyText: vi.fn(async () => true) }));

type ToastOptions = {
  description: string;
  action?: { label: string; onClick: () => void };
};

const lastToast = () => {
  const call = vi.mocked(toast.error).mock.calls.at(-1)!;
  return { title: call[0], options: call[1] as ToastOptions };
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("toastPlatformError", () => {
  it("renders the envelope's type and message with a copyable request id", () => {
    const error = new PlatformError(429, {
      type: "error",
      request_id: "req_rate",
      error: { type: "rate_limit_error", message: "slow down" },
    });
    toastPlatformError(error);
    const { title, options } = lastToast();
    expect(title).toBe("Request failed");
    expect(options.description).toBe("rate_limit_error: slow down");
    expect(options.action?.label).toBe("Copy request-id");
    options.action?.onClick();
    expect(copyText).toHaveBeenCalledWith("req_rate");
  });

  it("omits the copy action when the error has no request id", () => {
    toastPlatformError(new PlatformError(500, null));
    const { options } = lastToast();
    expect(options.description).toBe("api_error: HTTP 500");
    expect(options.action).toBeUndefined();
  });

  it("uses a custom title when provided", () => {
    toastPlatformError(new PlatformError(500, null), "Delete failed");
    expect(lastToast().title).toBe("Delete failed");
  });

  it("shows a plain Error's message without an error type", () => {
    toastPlatformError(new Error("network down"));
    const { options } = lastToast();
    expect(options.description).toBe("network down");
    expect(options.action).toBeUndefined();
  });

  it("falls back to a generic message for non-Error throwables", () => {
    toastPlatformError("boom");
    expect(lastToast().options.description).toBe("Something went wrong");
  });

  // The console shows every control because it cannot know which the operator
  // may use (plan 08 D4), so this toast is where they find out. "Request failed"
  // would invite a retry that answers the same way until somebody changes a role.
  describe("a denial", () => {
    const forbidden = new PlatformError(403, {
      type: "error",
      request_id: "req_denied",
      error: {
        type: "permission_error",
        message: "this route requires the admin role",
      },
    });

    it("is titled as a denial and quotes the platform's own message", () => {
      toastPlatformError(forbidden);
      const { title, options } = lastToast();
      expect(title).toBe(DENIED_TITLE);
      expect(options.description).toContain(
        "this route requires the admin role",
      );
      expect(options.description).toContain(ROLE_NOTE);
    });

    // The message names the role the ROUTE requires, never the caller's
    // (identitylane.go), which is what makes it safe to show and useless to a
    // prober — but on its own it reads as a fact about the route.
    it("says whose role the message is about", () => {
      toastPlatformError(forbidden);
      expect(lastToast().options.description).toContain("not the one you hold");
    });

    it("still yields to a title the call site chose", () => {
      toastPlatformError(forbidden, "Archive failed");
      expect(lastToast().title).toBe("Archive failed");
    });

    it("keeps the request id, which a denial needs as much as a fault", () => {
      toastPlatformError(forbidden);
      expect(lastToast().options.action?.label).toBe("Copy request-id");
    });

    it("probe: a 401 is not a denial — it is a sign-in, and reads as a failure", () => {
      toastPlatformError(
        new PlatformError(401, {
          type: "error",
          error: { type: "authentication_error", message: "nope" },
        }),
      );
      const { title, options } = lastToast();
      expect(title).toBe("Request failed");
      expect(options.description).not.toContain(ROLE_NOTE);
    });
  });
});
