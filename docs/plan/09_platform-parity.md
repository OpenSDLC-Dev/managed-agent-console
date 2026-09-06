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
- Follow with session lifecycle/resources/threads, deployments, memory and outcomes;
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
