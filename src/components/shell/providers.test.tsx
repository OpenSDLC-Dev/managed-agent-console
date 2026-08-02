import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useMutation } from "@tanstack/react-query";
import { Providers } from "./providers";
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
});
