import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

afterEach(cleanup);
import {
  ArchivedBadge,
  DetailSkeleton,
  EmptyState,
  ErrorState,
  IdCode,
  ListSkeleton,
  RequestId,
  StatusBadge,
  Time,
  UnavailableSurface,
} from "./bits";
import { copyText } from "@/lib/copy-text";
import { ROLE_NOTE } from "@/lib/platform/denied";
import { PlatformError } from "@/lib/platform/http";

vi.mock("@/lib/copy-text", () => ({ copyText: vi.fn() }));
const mockCopyText = vi.mocked(copyText);

describe("IdCode", () => {
  it("renders a short id in full with the full value as title", () => {
    render(<IdCode id="agent_0123456789" />);
    const el = screen.getByText("agent_0123456789");
    expect(el).toHaveAttribute("title", "agent_0123456789");
  });

  it("truncates ids longer than 18 characters to 15 plus ellipsis", () => {
    const id = "session_0123456789abcdef";
    render(<IdCode id={id} />);
    const el = screen.getByText("session_0123456…");
    expect(el).toHaveAttribute("title", id);
  });
});

describe("Time", () => {
  it("renders an em dash for a missing timestamp", () => {
    render(<Time iso={null} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("renders an em dash for undefined", () => {
    render(<Time iso={undefined} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("formats an ISO timestamp as a short UTC date-time with the iso as title", () => {
    render(<Time iso="2026-08-02T09:12:00Z" />);
    const el = screen.getByText("Aug 2, 2026, 09:12");
    expect(el).toHaveAttribute("title", "2026-08-02T09:12:00Z");
  });
});

describe("StatusBadge", () => {
  it.each([
    ["running", "text-emerald-700"],
    ["idle", "bg-secondary"],
    ["rescheduling", "text-amber-700"],
    ["terminated", "text-red-700"],
  ])("styles the %s status", (status, expectedClass) => {
    render(<StatusBadge status={status} />);
    expect(screen.getByText(status).className).toContain(expectedClass);
  });

  it("renders an unknown status without a palette class", () => {
    render(<StatusBadge status="mystery" />);
    const el = screen.getByText("mystery");
    expect(el.className).not.toContain("emerald");
    expect(el.className).not.toContain("amber");
  });
});

describe("ArchivedBadge", () => {
  it("renders nothing when not archived", () => {
    const { container } = render(<ArchivedBadge archivedAt={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when archivedAt is omitted", () => {
    const { container } = render(<ArchivedBadge />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders an archived badge when archivedAt is set", () => {
    render(<ArchivedBadge archivedAt="2026-08-01T00:00:00Z" />);
    expect(screen.getByText("archived")).toBeInTheDocument();
  });
});

describe("RequestId", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("copies the id and shows the check icon, then resets after 1.5s", async () => {
    mockCopyText.mockResolvedValue(true);
    const { container } = render(<RequestId id="req_abc123" />);
    expect(screen.getByText(/request-id: req_abc123/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Copy request-id" }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockCopyText).toHaveBeenCalledWith("req_abc123");
    expect(container.querySelector('[class*="lucide-check"]')).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(container.querySelector('[class*="lucide-check"]')).toBeNull();
    expect(container.querySelector('[class*="lucide-copy"]')).toBeTruthy();
  });

  it("shows the failure icon when the copy fails", async () => {
    mockCopyText.mockResolvedValue(false);
    const { container } = render(<RequestId id="req_fail" />);

    fireEvent.click(screen.getByRole("button", { name: "Copy request-id" }));
    await act(async () => {
      await Promise.resolve();
    });
    const failIcon = container.querySelector('[class*="lucide-x"]');
    expect(failIcon).toBeTruthy();
    expect(failIcon?.getAttribute("class")).toContain("text-destructive");

    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(container.querySelector('[class*="lucide-x"]')).toBeNull();
  });
});

describe("ErrorState", () => {
  it("renders a PlatformError message with its request id", () => {
    const error = new PlatformError(500, {
      type: "error",
      request_id: "req_err1",
      error: { type: "api_error", message: "platform exploded" },
    });
    render(<ErrorState error={error} />);
    expect(screen.getByText("platform exploded")).toBeInTheDocument();
    expect(screen.getByText(/request-id: req_err1/)).toBeInTheDocument();
  });

  it("renders a PlatformError without a request id", () => {
    const error = new PlatformError(404, {
      type: "error",
      error: { type: "not_found_error", message: "no such agent" },
    });
    render(<ErrorState error={error} />);
    expect(screen.getByText("no such agent")).toBeInTheDocument();
    expect(screen.queryByText(/request-id:/)).toBeNull();
  });

  it("renders a plain Error's message", () => {
    render(<ErrorState error={new Error("plain failure")} />);
    expect(screen.getByText("plain failure")).toBeInTheDocument();
  });

  it("falls back to a generic message for non-Error values", () => {
    render(<ErrorState error="nope" />);
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });

  // A denial is not a fault. Rendered in `destructive` red it reads as
  // something to retry or report, and neither will change the answer until an
  // administrator changes the operator's role.
  it("presents a denial calmly, and says whose role the message is about", () => {
    const error = new PlatformError(403, {
      type: "error",
      request_id: "req_denied",
      error: {
        type: "permission_error",
        message: "this route requires the admin role",
      },
    });
    render(<ErrorState error={error} />);
    const message = screen.getByText("this route requires the admin role");
    expect(message.className).not.toContain("destructive");
    expect(screen.getByText(ROLE_NOTE)).toBeInTheDocument();
    // The request id stays: a denial is as worth reporting as a fault.
    expect(screen.getByText(/request-id: req_denied/)).toBeInTheDocument();

    const state = screen.getByTestId("error-state");
    expect(state.getAttribute("data-denied")).toBe("true");
    expect(state.getAttribute("data-error-status")).toBe("403");
  });

  // Our own GKE staging is IAP-fronted, and an identity proxy or WAF refusing a
  // request answers 403 in HTML — which parses to no envelope and so to
  // `api_error`. Blaming the operator's role for that sends them to an
  // administrator who will find nothing wrong with their roles.
  it("probe: a 403 that is not the platform's role check is still a fault", () => {
    render(<ErrorState error={new PlatformError(403, null)} />);
    expect(screen.getByText("HTTP 403").className).toContain("destructive");
    expect(screen.queryByText(ROLE_NOTE)).toBeNull();
    expect(
      screen.getByTestId("error-state").getAttribute("data-denied"),
    ).toBeNull();
  });

  it("probe: every other status keeps the fault treatment", () => {
    const error = new PlatformError(500, {
      type: "error",
      error: { type: "api_error", message: "platform exploded" },
    });
    render(<ErrorState error={error} />);
    expect(screen.getByText("platform exploded").className).toContain(
      "destructive",
    );
    expect(screen.queryByText(ROLE_NOTE)).toBeNull();
    expect(
      screen.getByTestId("error-state").getAttribute("data-denied"),
    ).toBeNull();
  });
});

describe("UnavailableSurface", () => {
  it("names the surface and exposes it machine-readably", () => {
    render(<UnavailableSurface surface="vaults" />);
    const standIn = screen.getByTestId("unavailable-surface");
    expect(standIn.getAttribute("data-surface")).toBe("vaults");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Credential vaults",
    );
    expect(
      screen.getByText(/does not implement credential vaults/),
    ).toBeInTheDocument();
  });

  it("is not an error state — nothing is wrong with the platform", () => {
    render(<UnavailableSurface surface="skills" />);
    expect(screen.queryByTestId("error-state")).toBeNull();
    expect(
      screen.getByText("Not available on this deployment."),
    ).toBeInTheDocument();
  });
});

describe("DetailSkeleton", () => {
  it("renders a busy placeholder with skeleton lines", () => {
    const { container } = render(<DetailSkeleton />);
    expect(container.querySelector('[aria-busy="true"]')).toBeTruthy();
    // 2 heading skeletons + 6 rows of 2.
    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(
      14,
    );
  });
});

describe("ListSkeleton", () => {
  it("renders three rows by default", () => {
    const { container } = render(<ListSkeleton />);
    expect(container.querySelector('[aria-busy="true"]')).toBeTruthy();
    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(
      3,
    );
  });

  it("renders the requested number of rows", () => {
    const { container } = render(<ListSkeleton rows={5} />);
    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(
      5,
    );
  });
});

describe("EmptyState", () => {
  it("renders the title alone", () => {
    render(<EmptyState title="No sessions yet" />);
    expect(screen.getByText("No sessions yet")).toBeInTheDocument();
  });

  it("renders the hint when provided", () => {
    render(<EmptyState title="No agents" hint="Create one to get started" />);
    expect(screen.getByText("No agents")).toBeInTheDocument();
    expect(screen.getByText("Create one to get started")).toBeInTheDocument();
  });

  it("renders the action slot", () => {
    render(
      <EmptyState title="No agents" action={<button>Create agent</button>} />,
    );
    expect(
      screen.getByRole("button", { name: "Create agent" }),
    ).toBeInTheDocument();
  });
});
