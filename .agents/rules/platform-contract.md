---
trigger: glob
globs: "**/src/**,**/test/**"
---

# Platform contracts and authority

Verify a wire change against the sibling platform's route registration and handlers in `internal/api/` and its `internal/domain/` types. Use platform documentation next, then observe the local compose stack. Record any unresolved assumption in the issue or plan.

Platform owns domain state, login, OIDC, authorization, CSRF and private resource routes. The browser uses platform HttpOnly session cookies. Next.js keeps credentials out of browser resource requests and `NEXT_PUBLIC_*`. Missing session metadata fails closed. Navigation admission provides no server authority.

Keep native browser sessions separate from public API clients. Expose a surface only when platform implements it. Render state supplied by platform. Client validation must accept the inputs the wire accepts.
