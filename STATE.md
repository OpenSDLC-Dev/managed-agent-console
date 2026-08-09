# STATE.md — Active work

What is being worked on right now, and how far along it is — nothing else. **Size budget: ~30 lines.** Everything static lives elsewhere: conventions and the doc index in [CLAUDE.md](./CLAUDE.md), a change's narrative in [CHANGELOG.md](./CHANGELOG.md), the backlog in GitHub issues.

## Active work

**Plan 06 — Google sign-in** ([docs/plan/06_google-sign-in.md](./docs/plan/06_google-sign-in.md), `in-progress`). It retires the plain-HTTP limitation 0.4.0 shipped on purpose: staging was a shared password on a bare IP in front of a full-power management key. Both slices are written; what remains is the second one landing and being verified in a browser.

- [x] [#69](https://github.com/OpenSDLC-Dev/managed-agent-console/issues/69) — deployment identifiers are Actions variables, so the slices write tokens rather than literals to be swept again
- [x] Precondition steps 0–4 — cluster confirmed VPC-native, `HttpLoadBalancing` on, Dataplane V2 (so `NetworkPolicy` is enforceable, which slice 2 requires); global static IP reserved; **DNS-only** A record verified from two resolvers; edge objects applied; certificate `Active` after 14 min; backend `HEALTHY` on the pinned path
- [x] Slice 1 ([#71](https://github.com/OpenSDLC-Dev/managed-agent-console/pull/71)) — hostname with managed TLS. Live: `GET /` answers 307 to `/login` over HTTPS, plain HTTP 301s to it, Service is `ClusterIP`
- [x] Precondition step 5 — IAP API enabled; `roles/iap.httpsResourceAccessor` bound to the Workspace domain **on the backend service, not the project**, and the policy read back to confirm the scope
- [ ] Slice 2 — IAP on, `CONSOLE_PASSWORD` out of production, `NetworkPolicy` in the same PR, smoke gate rewritten around IAP's own denial header. NetworkPolicy already proven against the live cluster: a probe pod reached the control plane and timed out on the console's 3000, with the pod Ready and the backend `HEALTHY`
- [ ] Browser verification, the maintainer's ask: sign in as a Workspace account and land on `/agents`; a non-Workspace Google account is refused
- [ ] Precondition step 6 — rotate `console-password`. It crossed the public internet in the clear for as long as staging existed, and it is still the local-development and test credential

Neither slice changes a test or re-shoots a fidelity surface. The same sweep is open for the platform repo as [managed-agent-platform#355](https://github.com/OpenSDLC-Dev/managed-agent-platform/issues/355).

Plans 01–05 are complete and archived; summaries in [docs/HISTORY.md](./docs/HISTORY.md). How a release is cut: [docs/releasing.md](./docs/releasing.md).

The backlog is [GitHub issues](https://github.com/OpenSDLC-Dev/managed-agent-console/issues) — see them there, not here.
