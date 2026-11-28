import { describe, expect, it } from "vitest";
import type { SessionEvent } from "../platform/types";
import { groupSessionTurns, toolOutcome } from "./turns";

const ev = (
  id: string,
  type: string,
  fields: Partial<SessionEvent> = {},
): SessionEvent => ({ id, type, processed_at: null, ...fields });

describe("session turns", () => {
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
