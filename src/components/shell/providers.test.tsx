import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Providers, retryUnlessSettled } from "./providers";
import { PlatformError } from "@/lib/platform/http";
import { toastPlatformError } from "@/lib/platform/toast-error";

vi.mock("@/lib/platform/toast-error", () => ({
  toastPlatformError: vi.fn(),
}));

function FailingMutation({
  meta,
}: {
  meta?: { errorToast?: boolean; errorTitle?: string };
}) {
  const mutation = useMutation({
    mutationFn: async () => {
      throw new Error("boom");
    },
    meta,
  });
  return (
    <button type="button" onClick={() => mutation.mutate()}>
      {mutation.isError ? "failed" : "mutate"}
    </button>
  );
}

beforeEach(() => {
  // jsdom has no matchMedia; sonner's <Toaster> needs it for system theme.
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: false,
      media: "",
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

async function fireFailingMutation(meta?: {
  errorToast?: boolean;
  errorTitle?: string;
}) {
  const user = userEvent.setup();
  render(
    <Providers>
      <FailingMutation meta={meta} />
    </Providers>,
  );
  await user.click(screen.getByRole("button", { name: "mutate" }));
  await screen.findByRole("button", { name: "failed" });
}

describe("Providers", () => {
  it("renders its children", () => {
    render(
      <Providers>
        <p>console body</p>
      </Providers>,
    );
    expect(screen.getByText("console body")).toBeDefined();
  });

  it("toasts a failed mutation with the default title", async () => {
    await fireFailingMutation();
    await waitFor(() => expect(toastPlatformError).toHaveBeenCalledOnce());
    expect(toastPlatformError).toHaveBeenCalledWith(
      expect.objectContaining({ message: "boom" }),
      undefined,
    );
  });

  it("toasts with the mutation's errorTitle when set", async () => {
    await fireFailingMutation({ errorTitle: "Archive failed" });
    await waitFor(() =>
      expect(toastPlatformError).toHaveBeenCalledWith(
        expect.objectContaining({ message: "boom" }),
        "Archive failed",
      ),
    );
  });

  it("stays silent when the mutation opts out via errorToast: false", async () => {
    await fireFailingMutation({ errorToast: false });
    expect(toastPlatformError).not.toHaveBeenCalled();
  });

  // A denied query really was fired twice against a live stack before this
  // predicate existed (plan 08 slice 5), which is both a wasted round trip and
  // a backoff the operator waits out in a skeleton before being told no.
  it("asks the platform once when it has already refused", async () => {
    const calls = vi.fn();
    function DeniedQuery() {
      const query = useQuery({
        queryKey: ["denied"],
        queryFn: async () => {
          calls();
          throw new PlatformError(403, {
            type: "error",
            error: { type: "permission_error", message: "nope" },
          });
        },
      });
      return <p>{query.isError ? "denied" : "loading"}</p>;
    }
    render(
      <Providers>
        <DeniedQuery />
      </Providers>,
    );
    await screen.findByText("denied");
    expect(calls).toHaveBeenCalledOnce();
  });
});

describe("retryUnlessSettled", () => {
  const denied = (status: number) =>
    new PlatformError(status, {
      type: "error",
      error: { type: "permission_error", message: "no" },
    });

  it.each([400, 401, 403, 404, 501])(
    "treats %i as the platform's settled answer",
    (status) => {
      expect(retryUnlessSettled(0, denied(status))).toBe(false);
    },
  );

  it.each([408, 429, 500, 502, 503])("retries %i once", (status) => {
    expect(retryUnlessSettled(0, denied(status))).toBe(true);
    expect(retryUnlessSettled(1, denied(status))).toBe(false);
  });

  // A dropped connection never becomes a PlatformError; it is the case retry
  // was added for in the first place.
  it("retries a transport failure that carries no status", () => {
    expect(retryUnlessSettled(0, new TypeError("Failed to fetch"))).toBe(true);
  });
});
