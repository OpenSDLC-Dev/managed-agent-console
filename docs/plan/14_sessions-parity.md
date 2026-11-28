---
status: archived
---

# Sessions list and transcript

[Issue #307](https://github.com/OpenSDLC-Dev/managed-agent-console/issues/307) tracks the signed-in [list](https://platform.claude.com/workspaces/default/sessions?status=all) and [detail](https://platform.claude.com/workspaces/default/sessions/sesn_01Dsszg4casRWLETpVK76p23) comparison.

1. Map All to the four wire statuses and include archived sessions. Restore opaque forward and backward cursors on reload and history traversal. Reset the cursor when a filter changes.
2. Open the full session from its ID or title. Open Quickview explicitly and show the latest turn with navigation across persisted history. Share turn and tool correlation with the full transcript. Preserve deep links, search, live updates, approvals, raw events and thread scope.
3. Use measured Platform data for session metadata. Cover terminal states, cache counters, active time and tools. The signed-in reference includes creator and session billing data outside the public session response.

Exercise the list with both kinds of terminated sessions and two pages. Exercise the transcript with multiple turns, tool success, failure and approval, incomplete histories and a live update. Verify the merged build in local Docker and Chrome.
