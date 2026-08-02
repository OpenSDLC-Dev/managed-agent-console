import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

afterEach(cleanup);
import { EventRow } from "./event-row";
import type { SessionEvent } from "@/lib/platform/types";

const ev = (type: string, extra?: object): SessionEvent =>
  ({
    id: "sevt_1",
    type,
    processed_at: "2026-08-02T09:12:00Z",
    ...extra,
  }) as SessionEvent;

const renderEvent = (event: SessionEvent) => render(<EventRow event={event} />);

describe("EventRow", () => {
  it("renders the timestamp, type badge, and data attributes", () => {
    renderEvent(
      ev("user.message", { content: [{ type: "text", text: "hi" }] }),
    );
    const row = screen.getByTestId("event-row");
    expect(row).toHaveAttribute("data-event-type", "user.message");
    expect(screen.getByText("Aug 2, 2026, 09:12")).toBeInTheDocument();
    expect(screen.getByText("user.message")).toBeInTheDocument();
  });

  it("renders an em dash when processed_at is null", () => {
    renderEvent(ev("user.message", { processed_at: null, content: [] }));
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it.each([
    ["agent.message", "bg-secondary"],
    ["session.status_idle", "text-muted-foreground"],
    ["span.model_request_end", "border-dashed"],
  ])("styles the %s type badge by domain", (type, expectedClass) => {
    renderEvent(ev(type));
    expect(screen.getByText(type).className).toContain(expectedClass);
  });

  it("renders user.message text including placeholders for non-text blocks", () => {
    renderEvent(
      ev("user.message", {
        content: [{ type: "text", text: "look: " }, { type: "image" }],
      }),
    );
    expect(screen.getByText("look: [image]")).toBeInTheDocument();
  });

  it("renders agent.message text and treats a text block without text as empty", () => {
    const { container } = renderEvent(
      ev("agent.message", { content: [{ type: "text" }] }),
    );
    expect(container.querySelector("p.whitespace-pre-wrap")).toHaveTextContent(
      "",
    );
  });

  it("renders agent.thinking as italic muted text", () => {
    renderEvent(
      ev("agent.thinking", { content: [{ type: "text", text: "hmm" }] }),
    );
    expect(screen.getByText("hmm").className).toContain("italic");
  });

  it("renders agent.tool_use with its name, input JSON, and approval badge when permission is ask", () => {
    const { container } = renderEvent(
      ev("agent.tool_use", {
        name: "bash",
        input: { command: "ls" },
        evaluated_permission: "ask",
      }),
    );
    expect(screen.getByText("bash")).toBeInTheDocument();
    expect(screen.getByText("needs approval")).toBeInTheDocument();
    expect(screen.getByText("input")).toBeInTheDocument();
    expect(container.querySelector("pre")?.textContent).toContain(
      '"command": "ls"',
    );
  });

  it("renders agent.custom_tool_use without the approval badge when permission is allow", () => {
    renderEvent(
      ev("agent.custom_tool_use", {
        name: "lookup",
        input: {},
        evaluated_permission: "allow",
      }),
    );
    expect(screen.getByText("lookup")).toBeInTheDocument();
    expect(screen.queryByText("needs approval")).toBeNull();
  });

  it.each(["agent.tool_result", "user.tool_result", "user.custom_tool_result"])(
    "renders %s content text",
    (type) => {
      renderEvent(
        ev(type, {
          content: [{ type: "text", text: "42 files" }],
          is_error: null,
        }),
      );
      expect(screen.getByText("42 files")).toBeInTheDocument();
      expect(screen.queryByText("error")).toBeNull();
    },
  );

  it("flags an errored tool result and tolerates null content", () => {
    renderEvent(ev("agent.tool_result", { content: null, is_error: true }));
    expect(screen.getByText("error")).toBeInTheDocument();
  });

  it("renders an approved tool confirmation", () => {
    renderEvent(
      ev("user.tool_confirmation", {
        result: "allow",
        tool_use_id: "toolu_1",
        deny_message: null,
      }),
    );
    expect(screen.getByText(/Approved/)).toBeInTheDocument();
    expect(screen.getByText("toolu_1")).toBeInTheDocument();
  });

  it("renders a denied tool confirmation with its deny message", () => {
    const { container } = renderEvent(
      ev("user.tool_confirmation", {
        result: "deny",
        tool_use_id: "toolu_2",
        deny_message: "not on prod",
      }),
    );
    expect(container.textContent).toContain("Denied");
    expect(container.textContent).toContain("toolu_2");
    expect(container.textContent).toContain("— not on prod");
  });

  it("renders session.status_idle with an end_turn stop reason", () => {
    renderEvent(
      ev("session.status_idle", { stop_reason: { type: "end_turn" } }),
    );
    expect(screen.getByText("stopped: end_turn")).toBeInTheDocument();
  });

  it("renders session.status_idle as unknown without a stop reason", () => {
    renderEvent(ev("session.status_idle"));
    expect(screen.getByText("stopped: unknown")).toBeInTheDocument();
  });

  it("pluralizes pending tool calls on requires_action", () => {
    renderEvent(
      ev("session.status_idle", {
        stop_reason: {
          type: "requires_action",
          event_ids: ["sevt_a", "sevt_b"],
        },
      }),
    );
    expect(
      screen.getByText("stopped: requires_action (2 pending tool calls)"),
    ).toBeInTheDocument();
  });

  it("uses the singular for one pending tool call", () => {
    renderEvent(
      ev("session.status_idle", {
        stop_reason: { type: "requires_action", event_ids: ["sevt_a"] },
      }),
    );
    expect(
      screen.getByText("stopped: requires_action (1 pending tool call)"),
    ).toBeInTheDocument();
  });

  it("renders span.model_request_end token usage", () => {
    renderEvent(
      ev("span.model_request_end", {
        model_usage: {
          input_tokens: 1200,
          output_tokens: 345,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 6789,
          speed: null,
        },
      }),
    );
    const expected = `${(1200).toLocaleString()} in · ${(345).toLocaleString()} out · ${(6789).toLocaleString()} cache read`;
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it("renders no body when model usage is missing", () => {
    const { container } = renderEvent(ev("span.model_request_end"));
    expect(container.querySelector("[data-testid=event-row] p")).toBeNull();
  });

  it("renders no body when a usage counter is not a number", () => {
    const { container } = renderEvent(
      ev("span.model_request_end", {
        model_usage: {
          input_tokens: "1200",
          output_tokens: 345,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 6789,
          speed: null,
        },
      }),
    );
    expect(container.querySelector("[data-testid=event-row] p")).toBeNull();
  });

  it("renders session.error with its message and retry status", () => {
    renderEvent(
      ev("session.error", {
        error: {
          type: "api_error",
          message: "model overloaded",
          retry_status: { type: "retrying" },
        },
      }),
    );
    expect(screen.getByText("model overloaded (retrying)")).toBeInTheDocument();
  });

  it("falls back to a generic session.error label without an envelope", () => {
    renderEvent(ev("session.error"));
    expect(screen.getByText("error")).toBeInTheDocument();
  });

  it("renders session.error without retry status", () => {
    renderEvent(
      ev("session.error", {
        error: { type: "api_error", message: "boom" },
      }),
    );
    expect(screen.getByText("boom")).toBeInTheDocument();
  });

  it("renders no body for an unknown event type", () => {
    const { container } = renderEvent(ev("session.status_running"));
    expect(screen.getByText("session.status_running")).toBeInTheDocument();
    expect(container.querySelector("[data-testid=event-row] p")).toBeNull();
  });
});
