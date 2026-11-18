import type { SessionEvent } from "@/lib/platform/types";

export function ToolUseSource({ event }: { event: SessionEvent }) {
  if (event.type === "agent.mcp_tool_use") {
    // brain/brain.go:turnEvents emits the server separately from the bare name.
    const server = event.mcp_server_name;
    return (
      <>
        MCP server{" "}
        {typeof server === "string" && server ? server : "(name unavailable)"}
      </>
    );
  }
  if (event.type === "agent.tool_use") return "Platform tool";
  if (event.type === "agent.custom_tool_use") return "Custom tool";
  return null;
}
