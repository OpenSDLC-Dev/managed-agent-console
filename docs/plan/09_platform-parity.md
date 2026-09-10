---
status: in-progress
---

# Platform capability parity

Approved in conversation on 2026-09-05. The platform checkout's implemented
handlers remain authoritative; reference-console controls alone do not authorize
inventing a platform API.

## Decisions

- Start from current console main, retaining its Dashboard and grouped navigation.
- Restore GA Skills compatibility first, including version IDs and cascade deletion
  (`internal/api/skills.go`, platform plan 39). Do not mix pre-GA and GA responses.
- Add a model-free live contract tier so Skills verification does not depend on
  a paid agent turn. Keep the existing mock/component and model-backed live tiers.
- Follow with session lifecycle/resources/threads, deployments, memory, outcomes and Dreams;
  every write shape must be checked against its handler before implementation.
- Use the reference's compact list/detail/dialog patterns; gate new resource
  navigation through the existing collection-route capability probes.
- Search must describe its scope accurately; do not claim global search over one
  cursor page. Do not add model generation, billing, budgets or worker-only
  management panels without a supporting human-accessible platform API.

## Evidence

Chrome on 2026-09-05 confirms the reference exposes Deployments and Memory stores,
an Agent multiagent section, list search and a collapsible sidebar. Local Docker
was console 0.6.0/platform 0.3.0; image tags alone do not prove GA compatibility.

The first model-free run found that loose uploads require path-qualified
filenames matching the frontmatter name. Directory selection now preserves
`webkitRelativePath`; the corrected real contract passed. On this Windows host,
Playwright's local webServer probes needed `NO_PROXY=localhost,127.0.0.1,::1`:
without it the proxy returned 502 despite the mock listening normally.

Session resources: `internal/api/sessionresources.go` permits only files to be
added after creation. Repository and memory-store inputs therefore live on session
creation; repository deletion is refused by the platform, while its token-rotation
endpoint accepts a replacement without returning it. A local contract run added
and removed a file resource without sending an agent turn.

Deployments: the local control-plane contract covered create/update,
pause/manual-run/resume/archive, the pinned Agent snapshot, and run retention
after its Session is deleted. The self-hosted contract environment has no
worker, so this exercised no model turn.

Memory stores: `internal/api/memorystores.go`, `memories.go` and
`memoryversions.go` establish one-way archive, metadata tombstones, literal path
prefix browsing, SHA-256 write preconditions, persistent delete versions and
compliance redaction. The model-free contract covers those routes directly.

Outcomes: `user.define_outcome` is accepted through the session event endpoint;
the session projects its current state in `outcome_evaluations`, and evaluation
cycles remain in the event log. A self-hosted session with no worker proved the
pending projection, single-active rejection and interrupt settlement without a
model call.

Dreams: `internal/api/dreams.go` serves asynchronous memory consolidation over
one active memory store and 1–100 existing sessions. The console follows the
five terminal/active states and the platform's one-way cancel/archive rules.
The live contract probes only the collection route: creating a real Dream
starts the configured model runner, so deterministic write coverage belongs to
the mock tier rather than a model-free test.

Vaults: `internal/api/vaults.go`, `vaultcredentials.go` and `vaultcredauth.go`
make archive one-way, purge sealed values on archive, and expose credential
secrets only as writes. Metadata updates use null tombstones. Chrome verification
used the local mock because the reference Managed Agents account was no longer
available to sign in.
