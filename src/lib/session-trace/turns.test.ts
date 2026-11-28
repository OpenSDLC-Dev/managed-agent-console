import { describe, expect, it } from "vitest";
import type { SessionEvent } from "../platform/types";
import { groupSessionTurns, toolOutcome } from "./turns";

const ev = (
  id: string,
  type: string,
  fields: Partial<SessionEvent> = {},
): SessionEvent => ({ id, type, processed_at: null, ...fields });

describe("session turns", () => {
  it.each(["session.status_idle", "session.thread_status_idle"])(
    "recognizes an interrupted result settled directly to %s on archive or a child-wide stop",
    (type) => {
      const events = [
        ev("call", "agent.tool_use"),
        ev("r", "agent.tool_result", {
          tool_use_id: "call",
          is_error: true,
          content: [
            {
              type: "text",
              text: "Tool execution was interrupted before completion. Please retry.",
            },
          ],
        }),
        ev("outcome", "span.outcome_evaluation_end", { result: "interrupted" }),
        ev("idle", type, { stop_reason: { type: "end_turn" } }),
      ];
      expect(
        toolOutcome(
          groupSessionTurns(events, type.includes("thread"))[0].entries[0],
        ),
      ).toBe("Interrupted");
    },
  );
  it("starts a new child turn when a received message wakes a finished thread", () => {
    const events = [
      ev("a", "agent.thread_message_received"),
      ev("busy", "agent.thread_message_received"),
      ev("idle", "session.thread_status_idle", {
        stop_reason: { type: "end_turn" },
      }),
      ev("wake", "session.thread_status_running"),
      ev("b", "agent.thread_message_received"),
    ];
    expect(groupSessionTurns(events, true).map((t) => t.id)).toEqual([
      "a",
      "b",
    ]);
    expect(groupSessionTurns(events).map((t) => t.id)).toEqual(["a"]);
  });

  it("distinguishes the linked interrupt batch from generic tool failures with the same text", () => {
    const payload = {
      is_error: true,
      content: [
        {
          type: "text" as const,
          text: "Tool execution was interrupted before completion. Please retry.",
        },
      ],
    };
    const events = [
      ev("a", "agent.tool_use"),
      ev("r1", "agent.tool_result", { tool_use_id: "a", ...payload }),
      ev("b", "agent.tool_use"),
      ev("r2", "agent.tool_result", { tool_use_id: "b", ...payload }),
      ev("stop", "user.interrupt"),
    ];
    const calls = groupSessionTurns(events)[0].entries;
    expect(toolOutcome(calls[0])).toBe("Failed");
    expect(toolOutcome(calls[1])).toBe("Interrupted");
  });
  it("keeps late confirmations and results with their originating call across user turns", () => {
    const events = [
      ev("init", "session.status_idle"),
      ev("first", "user.message"),
      ev("call", "agent.tool_use"),
      ev("mcp", "agent.mcp_tool_use"),
      ev("second", "user.message"),
      ev("custom", "agent.custom_tool_use"),
      ev("deny", "user.tool_confirmation", {
        tool_use_id: "call",
        result: "deny",
      }),
      ev("result", "agent.tool_result", {
        tool_use_id: "call",
        is_error: true,
      }),
      ev("mcp-result", "agent.mcp_tool_result", {
        mcp_tool_use_id: "mcp",
        is_error: false,
      }),
      ev("custom-result", "user.custom_tool_result", {
        custom_tool_use_id: "custom",
        is_error: true,
      }),
      ev("orphan", "user.tool_result", { tool_use_id: "missing" }),
    ];
    const turns = groupSessionTurns(events);
    expect(turns.map((t) => [t.id, t.number])).toEqual([
      ["init", null],
      ["first", 1],
      ["second", 2],
    ]);
    const call = turns[1].entries[1];
    expect(call.replies.map((e) => e.id)).toEqual(["deny", "result"]);
    expect(toolOutcome(call)).toBe("Denied");
    expect(toolOutcome(turns[1].entries[2])).toBe("Completed");
    expect(toolOutcome(turns[2].entries[1])).toBe("Failed");
    expect(turns[2].entries.at(-1)?.event.id).toBe("orphan");
    expect(
      turns
        .flatMap((t) => t.entries.flatMap((e) => [e.event, ...e.replies]))
        .map((e) => e.id)
        .sort(),
    ).toEqual(events.map((e) => e.id).sort());
  });

  it("allows autonomous replies and distinguishes setup activity from a conversational turn", () => {
    expect(groupSessionTurns([])).toEqual([]);
    expect(
      groupSessionTurns([ev("status", "session.status_running")])[0].number,
    ).toBeNull();
    expect(
      groupSessionTurns([
        ev("start", "agent.thread_message_received"),
        ev("work", "agent.tool_use"),
      ]).map((t) => t.number),
    ).toEqual([1]);
  });
});
