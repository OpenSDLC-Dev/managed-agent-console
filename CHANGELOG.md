# Changelog

Notable changes, newest first, in the [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
format. This file holds the **cycle in progress**; released cycles are filed under
[docs/changelog/](./docs/changelog/), one per version, and are not edited afterwards.

## [Unreleased]

The console half of the platform's SSO and RBAC work (#56): [plan 07](docs/plan/07_console-issued-keys.md)
(credential issuance) and [plan 08](docs/plan/08_console-sso-rbac.md) (browser sign-in, role-aware
UI), both archived 2026-08-14. What their acceptance runs proved and broke is in
[docs/HISTORY.md](docs/HISTORY.md).

### Added

- **Environment keys** on a `self_hosted` environment's detail page: reveal-once issuance, per-host
  revoke, and the reference's four-step worker setup guide whose commands are the real `ant` CLI's.
  Expired keys stay listed — an operator whose worker stopped connecting needs to see the credential
  it is failing on. Cloud environments get no section; archived ones keep theirs, because keys
  already handed out must stay revocable.
- **API keys**, a top-level page: the reference's six lifetimes, all resolved to an absolute instant
  client-side because the wire has no duration vocabulary (`Never` omits `expires_at`), plus
  Disable / Enable / Archive mirroring the platform's own refusal rules. `Last used` and `Cost` do
  not ship — this platform serves neither — and the control-plane's own key is listed but not
  mutable, since its lifecycle is rotation-by-restart.
- **Browser sign-in** at `/api/auth/{login,callback,logout}`: authorization code with PKCE S256,
  every endpoint read from the provider's discovery document rather than guessed, and the ID token
  verified against JWKS because the platform will check the same signature downstream. The browser
  holds an opaque handle; tokens stay in a server-side store — the console's first stateful
  component, so one replica only, and every deploy signs every operator out.
- **The sidebar names who is signed in**, with Sign out. `/api/auth/session` answers display name and
  email and nothing else, and 404s where no identity is configured, so the password-gated and open
  deployments keep the sidebar they had.
- **Two BFF namespaces for the platform's off-wire console API** — `/api/oauth/…` for environment
  keys, `/api/console/…` for management keys — each mirroring the prefix and dialect it was observed
  under rather than being unified into an invented one. Both are allowlists, not passthroughs: a
  namespace of two routes should not be able to lend a management credential to an arbitrary
  upstream path.
- `IDENTITY_*` configuration that fails **closed**: a console that cannot parse its own identity
  configuration reports 503 rather than quietly serving as though identity were off.
- **The fidelity pass reaches the SSO-only surfaces** ([#99](https://github.com/OpenSDLC-Dev/managed-agent-console/issues/99)):
  a stub OpenID Provider beside the mock platform, a second console run with `IDENTITY_MODE=oidc`,
  and `login-sso` and `account-block` in the manifest. Both were previously compared by hand once,
  which was evidence for that pass and not coverage for the next one — the manifest is the pass's
  denominator, and it was under-reporting by two. The first shot already earned its keep: the
  account block sits above the connection line and **both** draw a top rule, so a signed-in sidebar
  ends in two dividers where the reference console draws none.

### Changed

- **List density and create-as-dialog**, matching the reference's interaction rhythm: Create agent /
  session / environment open on the list (environment is a name + hosting stub); rows carry a copy
  control, a Status column, title-case type labels, and a ⋯ menu for Archive / Delete; detail pages
  get a breadcrumb and move those actions into the same menu; agent tools start collapsed as
  `Tool permissions N`; session create has Manage … links and a vault multi-select. Ids keep the
  type prefix and the tail (`env_…fcHcqRP`).
- **In identity mode the BFF sends `Authorization: Bearer <the operator's token>` and does not read
  `PLATFORM_API_KEY` at all.** The two are never sent together: the platform's dispatcher takes a
  non-empty `x-api-key` and never looks at the Bearer, so a console attaching both would serve every
  operator as root while failing no test. With identity off, byte-for-byte the previous behaviour.
- **A 403 reads as a denial, not a fault** — the platform's own sentence without the destructive red,
  plus the one line it cannot supply: the platform names the role the _route_ requires, never the
  one you hold. Controls stay visible; hiding one accurately needs a `me` route the platform does
  not serve ([platform #403](https://github.com/OpenSDLC-Dev/managed-agent-platform/issues/403)).
- **`PLATFORM_API_KEY` no longer blocks readiness once identity is configured.** It stays as the deep
  health check's dedicated service credential — the one console→platform call that can never act as
  a user, since CD runs it with no user in sight.
- **A platform 401 ends the console session** and returns the operator to the page they lost, carried
  by a header the BFF sets on refusals it authored — a bare status would also bounce an operator
  whose deployment simply has the wrong management key.
- **The documentation is two-thirds shorter** (367 KB → 119 KB, released changelogs untouched), on a
  rule now written into CLAUDE.md: docs carry what the code cannot — external facts, decisions with
  the alternatives they rejected, and procedures a human runs. Archived plans keep their decisions and
  drop the implementation narrative that shipped as code; `docs/HISTORY.md` keeps what running each
  plan proved or broke; `deploy/k8s/README.md` defers to the comments beside each field.

### Fixed

- **The two heaviest form tests stop racing the 5s timeout**
  ([#93](https://github.com/OpenSDLC-Dev/managed-agent-console/issues/93)): under full-suite load the
  agent editor's and credential form's save tests ran 4978ms and 4044ms against Vitest's 5000ms
  default, so a PR touching neither file reddened at random. Neither asserts on typing, so their
  fields now take one change event each and the suite's slowest test is 2060ms under
  `test:coverage`; raising `testTimeout` was rejected as hiding slowness everywhere. What no diff
  records: `delay: null` — the cause this issue and
  [#39](https://github.com/OpenSDLC-Dev/managed-agent-console/issues/39) both suspected — changes
  nothing, the per-character cost is the whole of it, and #39 was closed as an environment issue
  rather than the defect it was.
- **Destructive controls are legible** ([#90](https://github.com/OpenSDLC-Dev/managed-agent-console/issues/90)):
  archive, delete and revoke — and every error message in the console — failed WCAG AA colour
  contrast, worst at **2.5:1**. The label and the wash under it came from one token, and a colour
  cannot differ enough from a tint of itself: in dark mode the ceiling is 4.29:1 at _every_ possible
  value, so the obvious fix of retuning `--destructive` could not have worked. Danger is now two
  tokens, the wash keeping the value it had, so only the glyphs move. The report covered the light
  tinted button; measuring first found dark failing on bare error text too, on plain backgrounds
  nowhere near a tint.
- **Day-scale dates drop their time-of-day** ([#87](https://github.com/OpenSDLC-Dev/managed-agent-console/issues/87)):
  created, updated and expires render `Aug 10, 2026` rather than `Aug 14, 2026, 00:09`, with the
  exact minute one hover away; the trace log, the sessions list and a credential that can expire
  within the hour keep their clock. Re-measured against the live reference first, which turned up
  what the earlier pass had missed: the reference uses **two** date forms and time-of-day in neither.
  Ours takes the with-year form throughout — see `docs/design-reference.md` for why the yearless one
  is a divergence rather than an omission.
- Sign-in completed to `http://0.0.0.0:3300/agents`, the address the standalone server binds rather
  than the host the browser used. Redirects to this console now name no host at all.
- Every query retried refusals, so a 403 was asked twice and the denial waited out a backoff.
  Transport failures, 5xx, 408 and 429 still retry; a settled answer does not.
- The denial predicate matched on status alone, so an IAP or WAF 403 — HTML, no envelope — would have
  told an operator their roles were wrong. It now requires the platform's own `permission_error`.
- The account block read any unsuccessful session-route answer as "no identity here" and cached it
  forever, so one 502 removed the only Sign out control for the life of the page. Only a 404 means
  absence. Sign-out is also bounded and departs in a `finally`, and records its intent before ending
  the session so the automatic bounce cannot send the next sign-in back to the page just left.
- A provider releasing a **blank** display claim put an empty line where the operator's name belongs;
  a blank claim now reads as no claim.
- The shell's 30-second connection poll read a sign-out as an outage — on an idle page it is the only
  consumer still running, so a revoked operator would have seen "Platform unreachable" and nothing
  else. All three direct BFF consumers now read the marker.
- The Basic credential was built with `encodeURIComponent` where RFC 6749 §2.3.1 wants
  form-urlencoding; `jose` enforces `exp` only when present, so a token carrying none verified into
  an already-expired session; and the login page's error map was a plain object, so
  `?sso_error=constructor` reached an inherited function and rendered an empty alert.
- The setup guide's code blocks scrolled horizontally without being focusable — readable only with a
  mouse. The same axe pass filed [#90](https://github.com/OpenSDLC-Dev/managed-agent-console/issues/90)
  against the shared `destructive` button variant's colour contrast, which affects every archive
  confirm in the console and had been shipping unobserved.
- Mock-platform corrections found by meeting the real wire: an **invented** management-key prefix
  (`sk-map-adm01-` against the platform's `sk-map-api01-`), `201` where the platform answers `200`,
  and a `partial_key_hint` spelled with an ellipsis rather than three dots at a fixed cut. Each had
  passed every tier because the fixture and its assertions agreed with each other.

### Security

- **The BFF fails closed in identity mode**: no valid session, 401, and the management key is not
  sent. Without this a deployment that opted into SSO would have been _less_ protected than one that
  had not, while showing a sign-in page implying the opposite.
- **Path traversal in the older proxy**, predating this work: a gate checked a path _string_ and
  `fetch` then reparsed the URL built from it, so `/api/platform/v1/../../admin/keys` left the `/v1`
  surface with the management key attached (percent-encoded spellings reached the same place). The
  guard now sits in the shared forwarding core that both proxies and any later route inherit.
- **The one-time plaintext key outlived its dialog.** `mutation.reset()` detaches the observer but
  leaves the cached mutation, so the key stayed reachable for the default retention; the mutation now
  carries `gcTime: 0`. Dismissing the dialog mid-issuance is refused outright — the platform mints
  the key when the request lands, so dismissal would have left a live credential nobody had seen.
- **The session cookie's `Secure` flag now comes from `x-forwarded-proto`** (OR'd with the request's
  own protocol, so a client-supplied header can only add the flag, never strip it): behind a
  TLS-terminating load balancer the pod sees plain `http:`.
- Sign-in defences, each closing a different hole: a state cookie proves _this_ browser started the
  flow (login CSRF otherwise lands the attacker's identity in the victim's console), the pending
  record is read once and removed so a replayed callback URL mints nothing, and the nonce ties the
  token to this browser's request. Nothing the provider or query string says is reflected back —
  failures become one of four console-authored codes — and `return_to` is narrowed to a same-origin
  path.
- Identity-configuration complaints are served to anonymous callers, so they name variables and never
  quote values; the anonymous `/api/auth/login` map is capped and swept.

## Released

- [0.5.0](docs/changelog/0.5.0.md) — 2026-08-09 · [compare](https://github.com/OpenSDLC-Dev/managed-agent-console/compare/v0.4.0...v0.5.0)
- [0.4.0](docs/changelog/0.4.0.md) — 2026-08-09 · [compare](https://github.com/OpenSDLC-Dev/managed-agent-console/compare/v0.3.0...v0.4.0)
- [0.3.0](docs/changelog/0.3.0.md) — 2026-08-08 · [compare](https://github.com/OpenSDLC-Dev/managed-agent-console/compare/v0.2.0...v0.3.0)
- [0.2.0](docs/changelog/0.2.0.md) — 2026-08-08 · [compare](https://github.com/OpenSDLC-Dev/managed-agent-console/compare/v0.1.0...v0.2.0)
- [0.1.0](docs/changelog/0.1.0.md) — 2026-08-07 · [tag](https://github.com/OpenSDLC-Dev/managed-agent-console/releases/tag/v0.1.0)

[Unreleased]: https://github.com/OpenSDLC-Dev/managed-agent-console/compare/v0.5.0...HEAD
