// Codex supplies agent_type from the spawning session. These project roles
// receive the patch and issue evidence from their parent.
import { readFileSync } from "node:fs";

const readTools = new Set(["read_file", "grep_files", "list_dir"]);
let reason;
try {
  const event = JSON.parse(readFileSync(0, "utf8"));
  if (
    event.hook_event_name !== "PreToolUse" ||
    typeof event.tool_name !== "string"
  ) {
    throw new Error("Expected a Codex PreToolUse event with a tool name.");
  }
  if (event.agent_type || event.agent_id) {
    const { agents } = JSON.parse(
      readFileSync(new URL("../manifest.json", import.meta.url), "utf8"),
    );
    const restricted =
      !event.agent_type ||
      agents.some((role) => role.name === event.agent_type);
    if (restricted && !readTools.has(event.tool_name)) {
      reason =
        "The read-only reviewer can request evidence from the parent session.";
    }
  }
} catch (error) {
  reason = "Unable to verify read-only role permissions. " + error.message;
}
if (reason) {
  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: reason,
      },
    }),
  );
}
