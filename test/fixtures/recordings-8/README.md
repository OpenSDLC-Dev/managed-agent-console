# Live Session SSE samples

Unmodified, sanitized raw bytes from [recordings #8](https://github.com/OpenSDLC-Dev/managed-agents-wire-recordings/issues/8), commit `ff397634bba1557d97c66be478113a36d9797097`, `2026-09-12-console-followups/streams/`.

- `preview-00`: 500 text deltas → one final event; thinking is start-only.
- `ui-02` / `ui-03`: overlapping Session and selected Alpha child streams after reload; shared status IDs, distinct confirmation IDs.
- `archive-00`: live termination; the separate archived history read was empty.

The upstream `stream-index.json` records byte hashes. `FINDINGS.md`, `COVERAGE.md` and `CAPTURE_LIMITS.md` bound the observations: no transport IDs/replay seen in these samples, screenshots and DOM are non-atomic. The platform source remains the API contract; no Anthropic-only query flag is required by these fixtures.
