import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { copyText } from "@/lib/copy-text";
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
});
