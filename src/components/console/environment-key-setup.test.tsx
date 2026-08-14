import "@testing-library/jest-dom/vitest";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  onTestFinished,
  vi,
} from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EnvironmentKeySetup } from "./environment-key-setup";

const ENV = "env_byoc0000000000000001";

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("EnvironmentKeySetup", () => {
  it("renders the four steps in order", async () => {
    render(<EnvironmentKeySetup environmentId={ENV} />);
    const steps = screen.getAllByRole("listitem");
    expect(steps).toHaveLength(4);
    expect(steps[0]).toHaveTextContent("Register an environment key");
    expect(steps[3]).toHaveTextContent("Run the worker");
  });

  /**
   * The three substitutions the reference's guide cannot make for us, each
   * recorded in docs/design-reference.md. Asserting them here means a copy
   * edit that quietly reintroduces an Anthropic-shaped key or drops the base
   * URL turns this red.
   */
  it("uses our key prefix, our base URL placeholder, and this environment's id", () => {
    render(<EnvironmentKeySetup environmentId={ENV} />);
    const text = document.body.textContent ?? "";

    expect(text).toContain("sk-map-env01-");
    // Never an Anthropic look-alike: the platform mints its own prefix
    // precisely so a leaked key cannot be mistaken for one of theirs.
    expect(text).not.toContain("sk-ant-oat01-");

    // The worker needs to be told where this platform is; the console cannot
    // fill the value in, because PLATFORM_BASE_URL is server-side config that
    // /api/health withholds on purpose.
    expect(text).toContain("ANTHROPIC_BASE_URL");
    expect(text).toContain("$PLATFORM_BASE_URL");

    expect(text).toContain(`--environment-id "${ENV}"`);
  });

  it("copies a step's command to the clipboard", async () => {
    // Stub the clipboard after setup — user-event installs its own stub —
    // and restore the descriptor so the mock cannot leak into later tests.
    const user = userEvent.setup();
    const writeText = vi.fn<(text: string) => Promise<void>>(async () => {});
    const original = Object.getOwnPropertyDescriptor(
      window.navigator,
      "clipboard",
    );
    Object.defineProperty(window.navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    onTestFinished(() => {
      if (original) {
        Object.defineProperty(window.navigator, "clipboard", original);
      } else {
        delete (window.navigator as { clipboard?: unknown }).clipboard;
      }
    });
    render(<EnvironmentKeySetup environmentId={ENV} />);

    await user.click(
      screen.getByRole("button", { name: "Copy the worker command" }),
    );
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("ant beta:worker poll"),
    );
  });

  it("stays dismissed across mounts", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<EnvironmentKeySetup environmentId={ENV} />);
    await user.click(
      screen.getByRole("button", { name: "Dismiss setup instructions" }),
    );
    expect(screen.queryByTestId("environment-key-setup")).toBeNull();

    unmount();
    render(<EnvironmentKeySetup environmentId={ENV} />);
    await waitFor(() =>
      expect(screen.queryByTestId("environment-key-setup")).toBeNull(),
    );
  });

  it("still renders when storage is unavailable", async () => {
    // Private browsing throws on access rather than returning null.
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    });
    render(<EnvironmentKeySetup environmentId={ENV} />);
    expect(screen.getByTestId("environment-key-setup")).toBeInTheDocument();
  });
});
