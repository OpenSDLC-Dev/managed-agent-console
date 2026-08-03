import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
import {
  DebugRow,
  EventDetailPanel,
  IdleBand,
  TranscriptRow,
} from "./event-row";
import type { SessionEvent } from "@/lib/platform/types";

const ev = (type: string, extra?: object): SessionEvent =>
  ({
    id: "sevt_1",
    type,
    processed_at: "2026-08-02T09:12:00Z",
    ...extra,
  }) as SessionEvent;

const renderRow = (event: SessionEvent) =>
  render(<TranscriptRow event={event} />);

describe("TranscriptRow", () => {
  it("renders the timestamp, type badge, and data attributes", () => {
    renderRow(ev("user.message", { content: [{ type: "text", text: "hi" }] }));
    const row = screen.getByTestId("event-row");
    expect(row).toHaveAttribute("data-event-type", "user.message");
    expect(screen.getByText("Aug 2, 2026, 09:12")).toBeInTheDocument();
    expect(screen.getByText("user.message")).toBeInTheDocument();
    expect(screen.getByText("hi")).toBeInTheDocument();
  });

  it("renders an em dash when processed_at is null", () => {
    renderRow(ev("user.message", { processed_at: null, content: [] }));
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it.each([
    ["agent.message", "bg-secondary"],
    ["session.status_idle", "text-muted-foreground"],
    ["span.model_request_end", "border-dashed"],
  ])("styles the %s type badge by domain", (type, expectedClass) => {
    renderRow(ev(type));
    expect(screen.getByText(type).className).toContain(expectedClass);
  });

  it("styles agent.thinking summaries as italic muted text", () => {
    renderRow(
      ev("agent.thinking", { content: [{ type: "text", text: "hmm" }] }),
    );
    expect(screen.getByText("hmm").className).toContain("italic");
  });

  it("shows the approval badge when permission is ask, not when allow", () => {
    renderRow(
      ev("agent.tool_use", {
        name: "bash",
        input: {},
        evaluated_permission: "ask",
      }),
    );
    expect(screen.getByText("needs approval")).toBeInTheDocument();
    cleanup();
    renderRow(
      ev("agent.tool_use", {
        name: "bash",
        input: {},
        evaluated_permission: "allow",
      }),
    );
    expect(screen.queryByText("needs approval")).toBeNull();
  });

  it("flags an errored tool result", () => {
    renderRow(ev("agent.tool_result", { content: null, is_error: true }));
    expect(screen.getByText("error")).toBeInTheDocument();
  });

  it("marks an unknown type's summary as the JSON payload preview", () => {
    renderRow(
      ev("user.define_outcome", {
        description: "Produce a survey.",
        max_iterations: 3,
      }),
    );
    const preview = screen.getByTestId("unknown-event-payload");
    expect(preview.textContent).toContain('"description":"Produce a survey."');
    expect(preview.textContent).toContain('"max_iterations":3');
  });

  it("reports selection via aria-expanded and calls onSelect on click", async () => {
    const onSelect = vi.fn();
    render(
      <TranscriptRow
        event={ev("user.message", { content: [] })}
        selected={false}
        onSelect={onSelect}
      />,
    );
    const row = screen.getByTestId("event-row");
    expect(row).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(row);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("renders the offset and paired span duration in the trailing column", () => {
    render(
      <TranscriptRow
        event={ev("span.model_request_end")}
        offset="0:09"
        durationMs={3_000}
      />,
    );
    expect(screen.getByTitle("since session creation")).toHaveTextContent(
      "0:09",
    );
    expect(screen.getByTitle("model request duration")).toHaveTextContent("3s");
  });

  it("omits the trailing column without offset or duration", () => {
    renderRow(ev("user.message", { content: [] }));
    expect(screen.queryByTitle("since session creation")).toBeNull();
    expect(screen.queryByTitle("model request duration")).toBeNull();
  });
});

describe("DebugRow", () => {
  it("renders the event verbatim as JSON", () => {
    const { container } = render(
      <DebugRow
        event={ev("agent.tool_use", { name: "bash", input: { command: "ls" } })}
      />,
    );
    const row = screen.getByTestId("debug-row");
    expect(row).toHaveAttribute("data-event-type", "agent.tool_use");
    const raw = container.querySelector("pre")?.textContent ?? "";
    expect(raw).toContain('"id": "sevt_1"');
    expect(raw).toContain('"command": "ls"');
  });
});

describe("EventDetailPanel", () => {
  const renderPanel = (
    event: SessionEvent,
    over?: { offset?: string; durationMs?: number; onClose?: () => void },
  ) =>
    render(
      <EventDetailPanel
        event={event}
        offset={over?.offset}
        durationMs={over?.durationMs}
        onClose={over?.onClose ?? (() => {})}
      />,
    );

  it("renders full message text without truncation", () => {
    const text = `first line\n${"x".repeat(400)}`;
    renderPanel(ev("agent.message", { content: [{ type: "text", text }] }));
    const panel = screen.getByTestId("event-detail");
    expect(panel).toHaveAttribute("aria-label", "Event details");
    expect(panel.textContent).toContain("x".repeat(400));
  });

  it("renders non-text blocks as labelled JSON", () => {
    renderPanel(
      ev("user.message", {
        content: [{ type: "image", source: { type: "url" } }],
      }),
    );
    expect(screen.getByText("[image]")).toBeInTheDocument();
  });

  it("renders the tool name and input JSON section", () => {
    const { container } = renderPanel(
      ev("agent.tool_use", {
        name: "bash",
        input: { command: "ls" },
        evaluated_permission: "ask",
      }),
    );
    expect(screen.getByText("bash")).toBeInTheDocument();
    expect(screen.getByText("Input")).toBeInTheDocument();
    expect(screen.getByText("needs approval")).toBeInTheDocument();
    expect(container.textContent).toContain('"command": "ls"');
  });

  it("renders the tokens line for a span end", () => {
    renderPanel(
      ev("span.model_request_end", {
        model_usage: {
          input_tokens: 1,
          output_tokens: 2,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 3,
          speed: null,
        },
      }),
    );
    expect(screen.getByText("1 in · 2 out · 3 cache read")).toBeInTheDocument();
  });

  it("falls back to the summary for status-like events and flags errors", () => {
    renderPanel(
      ev("session.error", {
        error: { type: "api_error", message: "boom" },
        is_error: true,
      }),
    );
    // Badge and summary both say error-ish things; the summary is "boom".
    expect(screen.getByText("boom")).toBeInTheDocument();
    expect(screen.getByText("error")).toBeInTheDocument();
  });

  it("shows the timing chips and closes via the close button", async () => {
    const onClose = vi.fn();
    renderPanel(ev("span.model_request_end"), {
      offset: "0:09",
      durationMs: 3000,
      onClose,
    });
    expect(screen.getByTitle("since session creation")).toHaveTextContent(
      "0:09",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Close event details" }),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("always offers the raw event and copies it as JSON", async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(window.navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    renderPanel(ev("session.status_running"));
    expect(screen.getByText("Raw event")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Copy JSON/ }));
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(String(writeText.mock.calls[0][0])).toContain(
      '"type": "session.status_running"',
    );
    expect(await screen.findByText("Copied")).toBeInTheDocument();
  });
});

describe("IdleBand", () => {
  it("labels the idle interval", () => {
    render(<IdleBand ms={25_000} />);
    expect(screen.getByTestId("idle-band")).toHaveTextContent(
      "Session idle · 25s",
    );
  });
});
