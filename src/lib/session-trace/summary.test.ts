import { describe, expect, it } from "vitest";
import {
  isKnownEventType,
  payloadOf,
  summaryOf,
  textOf,
  tokensLine,
} from "./summary";
import type { SessionEvent } from "@/lib/platform/types";

const ev = (type: string, extra?: object): SessionEvent =>
  ({
    id: "sevt_1",
    type,
    processed_at: "2026-08-02T09:12:00Z",
    ...extra,
  }) as SessionEvent;

describe("textOf", () => {
  it("returns empty for null or undefined content", () => {
    expect(textOf(null)).toBe("");
    expect(textOf(undefined)).toBe("");
  });

  it("joins text blocks and renders placeholders for non-text blocks", () => {
    expect(
      textOf([
        { type: "text", text: "look: " },
        { type: "image" },
        { type: "text", text: " done" },
      ]),
    ).toBe("look: [image] done");
  });

  it("treats a text block without text as empty", () => {
    expect(textOf([{ type: "text" }])).toBe("");
  });
});

describe("payloadOf", () => {
  it("strips the envelope keys and keeps the rest", () => {
    expect(payloadOf(ev("user.define_outcome", { description: "x" }))).toEqual({
      description: "x",
    });
  });

  it("is empty for an envelope-only event", () => {
    expect(payloadOf(ev("session.status_running"))).toEqual({});
  });
});

describe("tokensLine", () => {
  const usage = {
    input_tokens: 1200,
    output_tokens: 345,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 6789,
    speed: null,
  };

  it("formats the three counters", () => {
    expect(
      tokensLine(ev("span.model_request_end", { model_usage: usage })),
    ).toBe(
      `${(1200).toLocaleString()} in · ${(345).toLocaleString()} out · ${(6789).toLocaleString()} cache read`,
    );
  });

  it("returns null without usage", () => {
    expect(tokensLine(ev("span.model_request_end"))).toBeNull();
  });

  it("returns null when a counter is not a number", () => {
    expect(
      tokensLine(
        ev("span.model_request_end", {
          model_usage: { ...usage, input_tokens: "1200" },
        }),
      ),
    ).toBeNull();
  });
});

describe("isKnownEventType", () => {
  it("knows the rendered types and rejects the rest", () => {
    expect(isKnownEventType("user.message")).toBe(true);
    expect(isKnownEventType("span.model_request_start")).toBe(true);
    expect(isKnownEventType("user.define_outcome")).toBe(false);
  });
});

describe("summaryOf", () => {
  it("summarizes messages by their first line of text", () => {
    expect(
      summaryOf(
        ev("agent.message", {
          content: [{ type: "text", text: "first line\nsecond line" }],
        }),
      ),
    ).toBe("first line");
  });

  it("truncates a long first line at 200 characters", () => {
    const summary = summaryOf(
      ev("user.message", {
        content: [{ type: "text", text: "x".repeat(300) }],
      }),
    );
    expect(summary).toBe(`${"x".repeat(200)}…`);
    expect(summary.length).toBe(201);
  });

  it("summarizes tool use as name plus input JSON", () => {
    expect(
      summaryOf(
        ev("agent.tool_use", { name: "bash", input: { command: "ls" } }),
      ),
    ).toBe('bash {"command":"ls"}');
  });

  it("summarizes tool use with a missing name or input", () => {
    expect(summaryOf(ev("agent.custom_tool_use", { input: { a: 1 } }))).toBe(
      '{"a":1}',
    );
    expect(summaryOf(ev("agent.tool_use", { name: "bash" }))).toBe("bash");
  });

  it.each(["agent.tool_result", "user.tool_result", "user.custom_tool_result"])(
    "summarizes %s by its content text",
    (type) => {
      expect(
        summaryOf(ev(type, { content: [{ type: "text", text: "42 files" }] })),
      ).toBe("42 files");
      expect(summaryOf(ev(type, { content: null }))).toBe("");
    },
  );

  it("summarizes tool confirmations with the verdict and deny message", () => {
    expect(
      summaryOf(
        ev("user.tool_confirmation", {
          result: "allow",
          tool_use_id: "toolu_1",
          deny_message: null,
        }),
      ),
    ).toBe("Approved toolu_1");
    expect(
      summaryOf(
        ev("user.tool_confirmation", {
          result: "deny",
          tool_use_id: "toolu_2",
          deny_message: "not on prod",
        }),
      ),
    ).toBe("Denied toolu_2 — not on prod");
  });

  it("says nothing for status_running — the badge is the story", () => {
    expect(summaryOf(ev("session.status_running"))).toBe("");
  });

  it("summarizes status_idle stop reasons with pending counts", () => {
    expect(
      summaryOf(
        ev("session.status_idle", { stop_reason: { type: "end_turn" } }),
      ),
    ).toBe("stopped: end_turn");
    expect(summaryOf(ev("session.status_idle"))).toBe("stopped: unknown");
    expect(
      summaryOf(
        ev("session.status_idle", {
          stop_reason: { type: "requires_action", event_ids: ["a"] },
        }),
      ),
    ).toBe("stopped: requires_action (1 pending tool call)");
    expect(
      summaryOf(
        ev("session.status_idle", {
          stop_reason: { type: "requires_action", event_ids: ["a", "b"] },
        }),
      ),
    ).toBe("stopped: requires_action (2 pending tool calls)");
  });

  it("summarizes span ends by token usage, empty without usage", () => {
    expect(
      summaryOf(
        ev("span.model_request_end", {
          model_usage: {
            input_tokens: 1,
            output_tokens: 2,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 3,
            speed: null,
          },
        }),
      ),
    ).toBe("1 in · 2 out · 3 cache read");
    expect(summaryOf(ev("span.model_request_end"))).toBe("");
  });

  it("summarizes session.error with message and retry status", () => {
    expect(
      summaryOf(
        ev("session.error", {
          error: {
            type: "api_error",
            message: "model overloaded",
            retry_status: { type: "retrying" },
          },
        }),
      ),
    ).toBe("model overloaded (retrying)");
    expect(summaryOf(ev("session.error"))).toBe("error");
  });

  it("summarizes an unknown type as its payload JSON, empty when bare", () => {
    expect(
      summaryOf(ev("user.define_outcome", { description: "Survey." })),
    ).toBe('{"description":"Survey."}');
    expect(summaryOf(ev("wire.unknown"))).toBe("");
  });
});
