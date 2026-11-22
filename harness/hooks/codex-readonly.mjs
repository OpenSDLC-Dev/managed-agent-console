// Codex supplies agent_type from the spawning session. These project roles
// receive the patch and issue evidence from their parent.
import { readFileSync, statSync } from "node:fs";

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
    const name = event.agent_type;
    // A live required role, or a role still discoverable in this checkout, keeps
    // its file-read permissions while the manifest and generated adapters drift.
    const restricted =
      !name ||
      name === "issue-triage" ||
      name === "reviewer" ||
      agents.some((role) => role.name === name) ||
      (typeof name === "string" &&
        /^[\w-]+$/.test(name) &&
        statSync(
          new URL("../../.codex/agents/" + name + ".toml", import.meta.url),
          { throwIfNoEntry: false },
        )?.isFile());
    if (restricted && !readTools.has(event.tool_name)) {
      reason =
        "The read-only reviewer can request evidence from the parent session.";
    }
  }
} catch {
  reason =
    "Unable to verify read-only role permissions from the hook event and manifest.";
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
