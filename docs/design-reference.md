# Design reference — Claude Console fidelity base

The console's visual style tracks Anthropic's Claude Console (standing decision, 2026-08-02). This
file holds the facts extracted from the live reference, so UI work has a stable base and drift is
detectable, and the divergences from it. Re-extract when the reference visibly changes; note the
date. What ships from these facts is `src/app/globals.css`.

## File compatibility check (2026-09-11)

Chrome showed the reference Files empty table, upload action and disabled previous/next
controls. No populated session deletion dialog was available for comparison. The
confirmation copy follows platform `c75c5ad` (`internal/api/sessions.go:deleteSession`),
where deleting a session removes its outputs and retains Files API uploads.

This console revision consumes Files `next_page`/`page`; deploy it with the platform
file-cursor (`51c1fb7`) and metadata (`e71e585`) changes or later. The existing
Files columns remain unchanged.

The Docker run at `c75c5ad` passed the Files and session-resource live contracts.
A test-owned upload scoped as an output through SQL survived archive and returned
404 for metadata/download after session deletion; the input upload remained. This
checks deletion against stored output bytes without claiming a model-harvest run.
Re-shot and inspected `files-list` and `session-delete` in both Chrome themes.

## Skills — checked 2026-09-11

Chrome and DevTools confirm an exact-ID lookup and a non-modal right inspector:
560px wide, fixed 8px from the viewport edges, with a draggable separator,
double-click reset, previous/next controls and `?skill=` selection. It offers
Rendered/API views and per-version copy controls. Existing standalone console
detail links remain supported; the list opens the inspector.
The platform only supplies descriptions on versions (`internal/api/skills.go`),
so the console keeps descriptions with their versions instead of inventing a
skill-level description. API view shows the actual skill response. Documentation
links target this deployment's upstream project; no browser credential is shown.
Our upload offers a ZIP or directory: the platform requires loose filenames to
retain their top-level directory, which a normal browser file picker loses.

## Session resources — checked 2026-09-06

The previous inspection established the compact session detail pattern. On
2026-09-11 the reference lists were accessible but contained no sessions, so
this slice does not claim a fresh populated-detail comparison. The console uses that
existing detail-section pattern for resource rows and dialogs. Its lifecycle is
forced by the platform: files can be added after creation and removed; repository
and memory-store attachments are creation-time inputs; repositories remain for a
session's lifetime and expose only write-only token rotation. The `session-resources`
fidelity surface records the mounted-file state until reference access is restored.

## Deployments — checked 2026-09-08

The reference list and creation controls were rechecked on 2026-09-11; populated
deployment details remain unavailable in the empty reference account. This slice
reuses the recorded detail-section and action-menu patterns for those states. Platform-specific run
history stays inline on the deployment detail so operators retain the schedule
and deployment context while following its run records. A run detail page also
shows the trigger, linked session and stored error. The five new deployment
surfaces in `test/fidelity/surfaces.ts` were reviewed in Chrome in both themes.

## Extracted 2026-08-02 from platform.claude.com (light, Managed Agents → Agents)

Method: `getComputedStyle` on live elements in Chrome.

| Element                    | Facts                                                                                                            |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Page background            | `#FCFCFB`                                                                                                        |
| Sidebar                    | width `256px`, background `#F9F9F7`, no visible border                                                           |
| Body text                  | `anthropicSans` → fallback `system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`; `14px/21px`, `#0B0B0B` |
| Secondary text             | `#52514E` (page subtitle, table headers)                                                                         |
| Hairline borders           | `rgba(11,11,11,0.1)`                                                                                             |
| Page title / subtitle      | `22px`/500/`28px`, `#0B0B0B` · `14px/20px`, `#52514E`                                                            |
| Buttons (primary + filter) | height `32px`, radius `8px`, padding-x `12px`, `14px`/500; primary is white on near-black                        |
| Table header cell          | `13px`/500, `#52514E`, row height `32px`, no text-transform                                                      |
| Inputs                     | height `32px`, `14px`; current navigation measurements are recorded below                                        |

## Dark palette — extracted 2026-08-02 from the reference's stylesheet tokens

The reference's own **console theme pins dark mode to the light palette** — it ships light-only
today. Its sibling **claude theme carries real dark tokens**, and ours uses those, mapped onto the
same roles as the light palette. Shipping a real dark mode is therefore a **deliberate divergence**,
built entirely from the reference design system's own tokens.

| Token (reference) | Value                                  | Our role                         |
| ----------------- | -------------------------------------- | -------------------------------- |
| `bg-100`          | `hsl(60 2.7% 14.5%)` (#262624)         | page background                  |
| `bg-000`          | `hsl(60 2.1% 18.4%)` (#30302e)         | cards, popovers                  |
| `bg-200`          | `hsl(30 3.3% 11.8%)` (#1f1e1d)         | sidebar                          |
| `text-100`        | `hsl(48 33.3% 97.1%)` (#faf9f5)        | foreground                       |
| `text-300`        | `hsl(50 9% 73.7%)` (#c2c0b6)           | muted foreground                 |
| `pictogram-200`   | `hsl(60 2.5% 23.3%)` (#3c3c39)         | secondary/muted/accent fills     |
| `border-200`      | `hsl(51 16.5% 84.5%)` — 0.12–0.2 alpha | borders and inputs; rings opaque |
| `danger-100`      | `hsl(0 67% 59.6%)`                     | destructive **wash** (see below) |

## Date formats — extracted 2026-08-14 from platform.claude.com (live, Admin session)

Method: read the rendered cells in Chrome. The reference uses **two** forms, and time-of-day in
neither:

| Where                                        | Renders              |
| -------------------------------------------- | -------------------- |
| API-keys table — `Created`, `Expires`        | `Aug 8, 2026`        |
| Environment-key table — `Created`, `Expires` | `Aug 10, 2026`       |
| Environments list — `Updated at`             | `Aug 9`              |
| Environment detail subheader                 | `Last updated Aug 9` |

Our `Day` renders the first form wherever the value is day-scale; `Time` keeps a clock only where
time-of-day is the point — trace events, the sessions list, a credential expiring within the hour.

## Field states — extracted 2026-08-16 from platform.claude.com (Create environment)

Method: read the shipped `_next/static/css` rules and `getComputedStyle` on a live field in Chrome.

| State   | The reference draws                                                                          |
| ------- | -------------------------------------------------------------------------------------------- |
| resting | `.shadow-field-ring` — `inset 0 0 0 1px var(--cds-fill-field-ring)`, i.e. `#0b0b0b` at 10%   |
| hover   | `.shadow-field-hover` — `inset 0 0 0 1px var(--cds-border-strong)`                           |
| invalid | `.shadow-field-invalid` — `inset 0 0 0 1px var(--cds-fill-danger)` = `#d03b3b`, **no alpha** |
| focus   | `inset 0 0 0 1px #fcfcfb, 0 0 0 1px #2a78d6, 0 0 6px 1px #cde2fb` — opaque blue, plus a glow |

**The rule worth carrying is that the reference never draws a state indicator at an alpha.** Its
resting ring is a tinted hairline because it is decoration; every indicator that _means_ something —
invalid, focus — is a full-strength line. Our `--input` already equals its `--cds-fill-field-ring`
exactly. Upstream shadcn instead tints the invalid state (`/20` ring, `/50` dark border), which is
what put it under WCAG 1.4.11 ([#104](https://github.com/OpenSDLC-Dev/managed-agent-console/issues/104));
`input.tsx` and `select.tsx` now draw the single opaque border the reference does.

**One divergence**, deliberate: the danger border is tinted from `--destructive-surface` (`#e7000b` /
`#dd5353`) rather than adopting `#d03b3b`, because that token already carries the #90 wash contract.

**One divergence more**, deliberate: our focus ring is neutral rather than the reference's blue —
upstream shadcn's shape, and a fair one for a console with no brand hue to spend. It obeys the rule
above since [#110](https://github.com/OpenSDLC-Dev/managed-agent-console/issues/110): `--ring` is
opaque, so the focused border is a full-strength line against the page (19.17:1 light, 11.02:1 dark)
and the `/50` halo around it a glow at 3.65:1 / 3.88:1 — the reference's own structure, one line that
means something plus a glow that does not, in our own neutral. The halo is not decoration here the
way the reference's is: on a `default` Button the border lands on a fill of its own colour (1.00:1
light, 1.31:1 dark) and disappears, and the halo is the whole indicator, at 5.22:1 / 3.71:1 against
that fill. Both halves are asserted in `globals.test.ts`.

## Sidebar structure — extracted 2026-08-17 from platform.claude.com (live, dark, 1440×900)

Method: `getComputedStyle` and a text-node `Range` on every row in the sidebar `nav`, plus zoomed
screenshots of the icon column. **What the pass found is that the icon rule is the inverse of ours**:

| Element                      | The reference draws                                                                          |
| ---------------------------- | -------------------------------------------------------------------------------------------- |
| Row (all kinds)              | height `36px`, radius `8px`, `14px/20px` 400, inactive `#c3c2b7`                             |
| Top-level row · group header | `padding-left: 8px`; **icon** glyph at `x=20`, label at `x=52`                               |
| Row inside a group           | `padding-left: 40px`; **no icon**; label at `x=52`                                           |
| Group header                 | a `button` with a trailing chevron — a peer of the top-level rows, not a small muted caption |
| Order                        | `Dashboard`, `API keys`, then the `Build` and `Managed Agents` groups                        |
| Icons                        | a proprietary **pictogram font** — glyphs in a text node, not inline SVG                     |

Every label lands in one column at `x=52`, which is what the 40px indent buys: it is exactly the icon
width plus its gap. The 2026-09-10 Dashboard pass restores the measured 36px row and 40px indent.

## Deliberate divergences

- **Font** — `anthropicSans` is proprietary and cannot be shipped; we use its own fallback stack.
  **Branding** — our own wordmark, never Anthropic marks. Since 2026-08-17 it reads `Agent Console`
  and carries no second line; the reference's block names an organization, and ours had used that slot
  to say `self-hosted console`, which the grouped nav below now says better by naming what the
  deployment serves.
- **Nav icons are the nearest lucide equivalents**, because the reference's are a pictogram font we
  cannot ship — the same constraint as the typeface, one layer down. `House`, `Hammer` and `Waypoints`
  are close (the last approximates a circle-diamond-circle node graph with circles); `API keys` keeps
  `KeySquare` rather than the round-bowed key the reference draws, because `KeyRound` is already
  Credential vaults' and one icon may mean one thing.
- **The Dashboard is a router, not a report.** The reference's opens on credits, spend, models and
  resource cards; ours has no billing, no model catalogue and no usage surface to show, so it is one
  card per served surface under the sidebar's own headings. It is also the console's first page that
  is **not** a platform surface, so it never joins the 404 probe and is always shown.
- **Navigation is composed at runtime, not fixed** (issue #33). A hosted product implements every
  surface it shows; a self-hosted console can be pointed at a deployment serving only part of the
  wire, so the shell probes each collection route once per session and drops what answers 404. Only a
  confirmed 404 hides anything, so an unreachable platform still shows every item.
- **API keys is a top-level item**, not filed under a Settings area (added 2026-08-14). A self-hosted
  console's whole settings story is its environment file, so a Settings section holding exactly one
  page would be a menu built to hold a menu. Since 2026-08-17 it also sits **second, directly under
  Dashboard**, which is the reference's own position for it — it had been last while the nav was flat.
  On the dashboard it is filed under a `Manage` heading the sidebar does not draw: the sidebar shows
  "top level" by position, and a grid of cards has no such affordance, so those cards would otherwise
  be a headless row above the rest.
- **The API-keys table drops `Last used` and `Cost` and adds `Status`.** Nothing serves the first two
  here, and a column of em dashes is a promise the deployment cannot keep; `Created by` renders the
  actor id the wire carries rather than a display name, because there is no member lookup to enrich
  it with. `Status` is added because our rows are `active`/`inactive`/`archived` plus a derived
  `expired` and the console acts on them.
- **Retiring a key is `Archive`, not `Delete`** — the platform serves no DELETE on the surface at
  all, and naming the control after a verb the wire lacks would misdescribe the button.
- **No work-queue Overview on the environment detail page**, and this one is forced rather than
  chosen: the reference does render it, but the platform registers `…/work/stats` on the
  environment-key lane at `RoleNone`, which no human credential can reach. Revisit if it ever moves
  to a management-reachable route.
- **Environment keys carry an "Expired" badge** the reference's listing does not show. Ours lists
  expired keys on purpose, so a row that is present is not necessarily a row that works. Whether the
  reference badges them is unknown — the recorded account had none expired.
- **Ids keep a type prefix and the tail** (`env_…fcHcqRP`), matching the reference's keep-the-tail
  form. The full id is on `title`, `data-id` / `data-token-id`, and a copy control.
- **The setup guide's commands are ours**, with three substitutions forced by self-hosting: the
  `sk-map-env01-` prefix (so a leaked key of ours can never be mistaken for an Anthropic credential),
  an exported `ANTHROPIC_BASE_URL` telling the worker where this platform is, and that value written
  as `$PLATFORM_BASE_URL` rather than filled in, because it is server-side configuration.
- **The login page has no reference counterpart** and offers up to two ways in. A deployment can run
  both gates at once, and they do different jobs: SSO is primary, and the shared password sits below
  it under a line saying plainly that it admits you to the console and authorizes nothing on the
  platform. Without that line, two controls read as two ways to the same place.
- **The signed-in account block names no role and no organization.** Ours copies the reference's
  placement and type scale (14px/500 name over a 12px/17px muted line, re-measured 2026-08-15) and
  parts company on what the second line says: the role is unavailable (no `me` route, and inferring
  one would be the second copy of the authority rules principle 5 forbids), and single-tenant v1 has
  no organization to name — so it carries the email. **Sign out** is explicit rather than behind a
  menu, because it is the only item that menu would hold — where the reference's block is a menu
  trigger holding seven items, and its email sits in that menu's header rather than in the block.
- **The account block is a plain block, not the reference's inset button.** Theirs is a borderless
  8px-radius button inset 12px in the sidebar, with a leading org avatar and a trailing chevron;
  ours is full-bleed with neither ornament, under the single rule that closes the sidebar off where
  the reference's footer draws none. That follows from the bullet above rather than being chosen
  separately: a block that opens nothing should not wear the frame of a control that does, and an
  avatar would stand for an organization we do not have. The rule belongs to the footer group and
  not to the blocks in it ([#107](https://github.com/OpenSDLC-Dev/managed-agent-console/issues/107)):
  owned per block, the sidebar ended in however many blocks happened to render — one without
  identity, two with it — which is a difference no reading of the reference asks for.
- **A day-scale date always carries its year**, where two of the reference's four forms drop it. Ours
  matches the reference exactly on the two key tables and parts from it on the environments list and
  the detail subheader: a yearless date is unambiguous only if the formatter is year-conditional —
  output that depends on what today is, a row that changes shape on 1 January, and a test that has to
  be told the date. A self-hosted console shows its deployment's whole history, where a hosted
  product mostly shows this week's.
- **The sidebar states the console's version.** The reference shows none, correctly — nobody wonders
  which build of a hosted product they are looking at. A self-hosted operator has no other way to
  tell, so it sits in the same muted register as the connection state.
- **Danger is two colours, not one** ([#90](https://github.com/OpenSDLC-Dev/managed-agent-console/issues/90)).
  A destructive control puts a label on a wash of the danger colour and paints both from one token,
  which caps their contrast at how far a colour can differ from a tint of itself — in dark mode that
  ceiling is **4.29:1 at every possible value**, so no single token clears AA. `--destructive` is
  therefore the colour that gets read and `--destructive-surface` the wash behind it; the wash keeps
  the value it always had, so the controls look as they did and only the glyphs move. The reference
  ships one `danger-100`, but it also ships no dark mode — the surface we borrowed it for is ours.

## Fidelity verification

After building UI, load the console in Chrome next to the reference, screenshot both, compare, and
note the outcome in the PR. The surfaces are enumerated in
[test/fidelity/surfaces.ts](../test/fidelity/surfaces.ts); `pnpm fidelity:shots` writes one shot per
surface per theme.

**Checks against the tables above** — a recorded fact nobody re-measures quietly stops being true:

| Date       | Method                                                                                                                                                                                                                                                                                             | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-07 | `getComputedStyle` on the running console, 1440×900, light                                                                                                                                                                                                                                         | 9 of 10 facts matched; primary button padding-x was upstream shadcn's `10px`. Filed #37, then **10 of 10**.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 2026-08-14 | Side-by-side, environment detail, against a real platform                                                                                                                                                                                                                                          | Heading, copy, columns, order and placement all match. Three differences: `ID` truncation direction and the missing work-queue Overview (both divergences above), and date granularity — console-wide, so filed as #87 rather than fixed here.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 2026-08-14 | The reference's rendered date cells on three surfaces, then `fidelity:shots` of our equivalents                                                                                                                                                                                                    | Settles [#87](https://github.com/OpenSDLC-Dev/managed-agent-console/issues/87), and the measurement is what settled it: the reference carries **no time-of-day on any of the four surfaces** and uses two date forms — recorded above, which the earlier pass had missed because it read one table. Re-shot: every day-scale list and detail surface, plus `sessions-list` to confirm it deliberately keeps its clock.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 2026-08-14 | `/login` in all three configurations, against a real Casdoor                                                                                                                                                                                                                                       | A self-check — no reference exists. Type scale, control sizes and the 320px column match our own tokens; the provider accepted the console's authorization request, and an unanswering issuer produced the console's own line with no provider text.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 2026-08-15 | `fidelity:shots` of the whole manifest before and after the #90 palette split, diffed per pixel                                                                                                                                                                                                    | The wash is byte-identical and only glyphs moved: `#e7000b`→`#b2000c` light, `#dd5353`→`#ffa9a3` dark. Re-shot: `archive-confirm`, `credential-add`, `detail-error`, `environment-detail`, `skill-detail`, `vault-detail`, both themes. **What the pass found is that it could not have found anything**: dialogs were shot mid-fade, so two runs of one build differed across 1,292,989 of 1,296,000 pixels on `archive-confirm`. The walker now waits for the dialog to settle, as the axe pass already did.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 2026-08-14 | The console driven **signed in**, with no management key set                                                                                                                                                                                                                                       | Slice 3 adds no visible element and the shots confirm it. What the pass was for is that `/environments` renders **at all** on the operator's own token.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 2026-08-15 | `getComputedStyle` on the reference's sidebar account block at 1440×900, then the first automated shot of ours ([#99](https://github.com/OpenSDLC-Dev/managed-agent-console/issues/99))                                                                                                            | The type scale above holds exactly — 14px/20px 500 over 12px/17px 400, `#0b0b0b` over `#52514e` — and is unchanged across two viewport widths, so it is not a layout accident. **"Frame" in that bullet does not hold**: the reference is a borderless 8px-radius button inset 12px in a 256px sidebar, with a leading avatar and a trailing chevron, and its footer draws **no** rule; ours is a full-bleed `border-t` block, and because `ConnectionStatus` carries the same class the signed-in sidebar ends in **two** dividers. Ours is arguably right — our block is not a menu trigger, so a button frame would mislead — but it is a divergence, not a copy, and it needs its own bullet. Shot: `login-sso`, `account-block`, both themes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 2026-08-15 | Chrome walk of list + create + detail against a local platform                                                                                                                                                                                                                                     | Create agent / session / environment open as list dialogs; ids keep `env_…tail`; rows have copy, Status, title-case type, and ⋯ Archive / Delete; detail pages have a breadcrumb. Re-shot candidates: `agents-list`, `environments-list`, `sessions-list`, `vaults-list`, `agent-detail`, `environment-detail`, `vault-detail`, `skill-detail`, `agent-create`, `environment-create`, `session-create`, `archive-confirm`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 2026-08-16 | The reference's field-state CSS and a live field in Chrome, then `fidelity:shots` of the new `login-invalid` surface, pixel-sampled                                                                                                                                                                | Settles [#104](https://github.com/OpenSDLC-Dev/managed-agent-console/issues/104). The reference's invalid field is one opaque `#d03b3b` line with no halo, which is both the legible answer and the faithful one — upstream's `/20` ring cannot reach 3:1 below alpha 0.60 light / 0.81 dark, and on dark `--muted` no alpha reaches it at all. Shipped border sampled from the shots: `#e7000b` on `#fcfcfb` (**4.64:1**) light, `#dd5353` between `#262624` (**3.93:1**) and the field's own `#31312e` fill (**3.38:1**) dark. Re-shot: `login-invalid` (new), `login`, `agent-new`, `agent-edit`, `agent-create`, both themes. **What the pass found is a second walker blind spot of the same family as the dialog fade**: the first run shot the border at `rgb(195,182,180)`, 18% along its `transition-colors`, showing a ~1.6:1 indicator for a build that ships 4.64:1. The walker now waits for every finite animation to finish. It also found `setup` was never run for `/login` routes, and that `session-new` had been failing in both themes since #108 made its locator ambiguous.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 2026-08-16 | Controls focused from the keyboard in Chrome at 1440×900 against the **real platform on Docker**, each indicator composited through Chrome's own colour pipeline (a 1×1 canvas) rather than arithmetic, both themes; then `fidelity:shots` of the whole manifest before and after, hashed per file | Settles [#110](https://github.com/OpenSDLC-Dev/managed-agent-console/issues/110). With `--ring` opaque the `/50` halo paints `#848483` on `#fcfcfb` (**3.65:1**) and `#82817b` on `#262624` (**3.88:1**), the border it draws with 19.17:1 / 11.02:1, and the base `outline-ring/50` that the sidebar's links fall back to 3.65:1 / 4.03:1 — every one of them 1.39–1.72:1 before. **What the pass found is a third walker blind spot of the same family as the dialog fade and the mid-transition border**: `el.focus({focusVisible: true})` does not force `:focus-visible` in Chrome — the indicator renders only if the last input modality was the keyboard, so measuring after a click reads the _resting_ control and calls it focus, and the first reading here did exactly that. It also found that `detail-error` and `role-denied` render the mock's `request-id`, whose counter does not repeat across runs, so those two shots are not byte-comparable between builds; and — the pass's own near-miss — that **a control with no `focus-visible:` rule of its own is not a control with no focus indicator**. A focused data-table row was first written up here as a `bg-secondary/60` change at 1.06:1, which is what that tint measures in isolation and is not what the row draws: `TableRow` sets no `outline-none`, so it keeps Chrome's `:focus-visible` outline, whose colour comes from the base `* { outline-ring/50 }` — measured on a focused row, `outline-style: auto`, `outline-color: oklab(0.149576 … / 0.5)`, i.e. the token this change made opaque. (`outline-style: auto` does honour `outline-color`: a probe drawn at `rgb(255,0,0)` paints red.) So the five list pages' rows are a surface this fix **raised**, not one it missed. What genuinely opts out of that fallback, and so still draws nothing on focus, is the handful of controls that say so in class names — `outline-hidden` on `DropdownMenuItem` and `SelectItem`, `outline-none` on the session composer's textarea, and `border-none` + `focus-visible:ring-0` over `Input`'s `outline-none` in the command palette. Those were read from source, not measured, and are the next pass's work rather than this one's finding. Re-shot: the whole manifest, both themes — 66 of 78 byte-identical, the 10 that moved being every surface whose `setup` leaves a control focused (`login`, `api-key-create`, `environment-create`, `session-create`, `vault-create`). |
| 2026-08-16 | Both consoles driven signed-in in Chrome at 1440×900, `getComputedStyle` over every top border in the sidebar, on the build before the fix and the build after                                                                                                                                     | Settles [#107](https://github.com/OpenSDLC-Dev/managed-agent-console/issues/107). Before: two 1px `rgba(11,11,11,0.1)` rules, at the account block and again at the connection status. After: **one**, on the group holding both, at the same width and colour — and the password console's rule did not move (top 901 either way), so the configuration that was already right is unchanged. **What the pass found is that the sidebar draws two other top borders that are not dividers at all** — the ⌘K keycap and the theme-toggle segment, both full-box `border` — so "count the top borders in the `aside`" answers four on a correct build and is no test at all; the regression test counts the `border-t` class token instead. Re-shot: `account-block`, `agents-list`, both themes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 2026-08-17 | The reference sidebar in Chrome at 1440×900: `getComputedStyle` per row, a text-node `Range` for where each label starts, and zoomed shots of the icon column; then `fidelity:shots` of the whole manifest, both themes                                                                            | Settles the regrouping. **What the pass found is that the icon rule is the inverse of ours**: the reference draws an icon on top-level rows and on group headers and _none_ inside a group, where a 40px indent buys the same 52px label column — we had an icon on every row and no group header at all. Recorded above. It also found the icons are a **pictogram font**, glyphs in a text node, which is why the first DOM sweep reported zero SVGs in the whole sidebar and why parity stops at the nearest lucide shape. **The second finding is in our own suite, not the reference**: `nav.test.tsx` asserted every label, href, `data-surface` and active state but never the _order_, so the nav could be regrouped from a flat list into two collapsible groups and all 19 tests stayed green. Order is asserted now, as is which rows carry an icon. Re-shot: the whole manifest — 80 shots where there were 78, `dashboard` being the new surface in both themes, and every other shot moved because every page draws this sidebar. The `transition-colors` trap from the #104 pass reappeared while shooting by hand: a theme switch photographed immediately shows the cards mid-transition, dark text on a dark card, which reads as a contrast defect on a build that renders correctly.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

## Session lifecycle — 2026-09-06

The reference Sessions list exposes row actions and Active status filtering.
The local detail page uses the existing action menu and confirmation dialogs.
Metadata changes use an explicit JSON patch editor because the platform owns
validation; `null` at the document level preserves metadata, while null-valued
keys remove entries (`internal/api/wire.go:patchMetadata`).

The later verification visit redirected to sign-in; the earlier captured
reference facts remain the comparison baseline for this slice.

Creation forms now keep the platform's `memory_store_id` as the submitted value
and use a browser-native suggestion list to label active stores by name. Direct
ID entry remains available when the catalog cannot be loaded or exceeds the
picker cap. Re-shot: session and deployment creation with the memory-store
resource fields expanded, both themes.

## Memory stores — checked 2026-09-08

The reference account now redirects this area to sign-in, so no new authenticated
facts were inferred. The local surface follows the already recorded compact
list/detail/form patterns. Self-hosting adds explicit digest, actor and redaction
fields because the implemented platform exposes them and operators need to audit
durable context. Re-shot: memory-store list/detail/create/edit, memory
create/detail/edit and memory-version detail, both themes.

## Outcomes — checked 2026-09-09

The authenticated Managed Agents reference remains unavailable, so this slice
uses the previously recorded compact detail, card and dialog patterns without
claiming new reference facts. Platform state remains visible in a compact
session section; the write action opens a focused dialog, and the existing
transcript gains one filter instead of a separate event viewer. File rubrics
keep direct ID entry because the platform wire accepts IDs and the local catalog
can be partial. Re-shot: `session-outcomes`, `session-outcome-create` and
`session-outcome-file-rubric`, both themes.

## Dreams — checked 2026-09-10

The authenticated reference remains unavailable, so no new reference facts
were inferred. Dreams use the established compact resource list, detail,
creation form and destructive confirmation patterns. The self-hosted surface
shows the pipeline session and flat token usage because the platform publishes
both. Re-shot: `dreams-list`, `dream-detail`, `dream-cancel-confirm` and
`dream-new`, both themes.

## Final keyboard interaction — checked 2026-09-10

The authenticated reference remains unavailable. The comparison therefore uses
the focus treatment measured from it on 2026-08-16 and the local Chrome pass.
Before this pass, Chrome reported `outline-style: none` and no visible box shadow
on the session composer, command input and active select item. The repaired
controls paint the shared ring at 3px for text entry and an opaque 2px inset ring
inside popup items. Row action menus also focus their first item, support arrow
navigation and return focus to the trigger on Escape. Re-shot:
`command-palette`, `session-composer-focus`, `deployment-filter-focus` and
`deployment-actions-focus`, both themes.

## Dashboard — checked 2026-09-10

The existing Chrome login could reach `/dashboard` again; no sign-in was attempted.
DOM measurements at 1920px found a centered 960px container with 16px inner padding
and 48px top spacing, a 22px/28px serif title, 15px/20px semibold section headings,
12px card gaps and a 220px minimum column. The sidebar folds from 256px to 48px.
The local page previously aligned its 1024px grid to the left, clipped descriptions,
used muted 13px section headings and offered neither shortcuts nor sidebar collapse.

DevTools confirmed 32px-high shortcuts with 12px horizontal padding and an 8px radius.
`Get API key` opens the creation dialog on the Dashboard itself; the console reuses
its existing key dialog. The docs/agent shortcuts map to self-hosted destinations and
all follow the same surface detection as the cards. Billing, model marketing and usage
reports remain excluded for the API reasons above. The title stays `Dashboard`:
password mode has no operator profile to greet. On narrow screens, expanded navigation
occupies the screen until a destination or Escape returns to the page; this avoids a
second, overlapping focus surface. The initial implementation kept group and sidebar expansion session-local;
the 2026-09-11 follow-up below supersedes that behavior.
Re-shot: the full manifest, including `dashboard`, `dashboard-compact`,
`dashboard-mobile` and `dashboard-api-key-create`, in both themes.

## Agent editor — checked 2026-09-11

Authenticated Chrome showed a multiline General description, Rendered/Raw radio
controls, custom tools with a collapsed Definition (name, description, JSON schema),
and an Add skill picker. MCP selection exposes a searchable service catalog.
The platform has no catalog endpoint: the console uses URL/name configuration
paired with an MCP toolset, following internal/api/wire.go and toolset/materialize.go.
Only the platform's always_allow/always_ask policies are offered; reference Auto,
Deny, advisors and model generation remain outside its implemented surface.
Skills load incrementally so existing pinned references survive incomplete catalogs.
DevTools measured 15px section headings, 30px-high view controls with 6px corners,
and 56px/76px description/system fields. Custom tool cards separate the icon/title
header, Definition disclosure and field body with dividers.

Re-shot Agent create/edit and custom/MCP tools at desktop and 390px widths
in both themes (agent-create, agent-edit, agent-tools, agent-tools-narrow).

## Navigation and Agent lookup — checked 2026-09-11

Chrome confirmed that both the Build group's collapsed state and the overall
sidebar collapse survive full navigation between resource pages. The console
stores these presentation preferences locally; phone navigation opens temporarily
and does not change the desktop preference. Storage failures leave controls usable.

The reference Agent filter accepts name or exact ID. The platform agent list serves
pagination, include_archived and created_at bounds, with no name filter (agents.go).
The console exposes exact-ID navigation using the implemented GET route and leaves
name search as a platform extension in #141; it never filters only the current page.

Compact group buttons open a flyout rather than expanding the sidebar. DevTools
measured 192px width, 12px corners, 4px padding and 32px link rows; opening it
does not alter the saved sidebar or group preference.

Re-shot in both themes: `dashboard`, `dashboard-compact`, `dashboard-mobile`,
`dashboard-group-collapsed`, `dashboard-nav-flyout`, `agents-list` and
`agents-lookup-missing`.

The BFF rejects decoded path delimiters in exact-ID input before forwarding, so
reserved characters cannot turn a detail lookup into a different upstream route.

## Environments — checked 2026-09-11

A populated reference list opens a non-modal 560px inspector at ?environment=ID,
with previous/next, copy, Open and Rendered/API controls. Sections show lifecycle,
hosting type, scope, description, networking, packages and metadata. DevTools
measured a 16px/20px title, 14px/20px section headings, 12px/17px fields, a
120px label column and a 16px column gap. Selecting a
row exposes Clear selection, Archive and Delete; the console applies the existing
single-resource routes and retains failed selections for retry.

Full-page Edit enters a form without changing the URL. The create dialog measures
520px wide with 24px content insets, a 22px title and a 76px multiline description.
Hosting type remains immutable: environments.go's update handler rejects changes
at lines 600–608, despite normalizeEnvConfig accepting either union arm. Cloud
creation keeps the platform's unrestricted networking default; the observed
reference environment's Limited setting does not establish a creation default.
Name search has no implemented environment list parameter, so the console offers
exact-ID lookup. Self-hosted worker keys remain on the full detail page.

Re-shot in both themes: environments-list, environment-detail, environment-new,
environment-edit, environment-create, environment-cloud-detail,
environment-edit-inline, environment-inspector, environment-inspector-api,
environment-inspector-narrow, environment-inspector-missing,
environment-selection, environment-selection-confirm and skill-inspector.

The full environment page uses stacked General, Networking, Packages and Metadata
sections, with 800px fields and full-width dividers; Rendered/API belongs to the
inspector. Inline editing keeps these sections, a 56px description, 36×20px
network switches and add/remove rows. Hosting type stays in the heading.

The console uses one package argument per row: domain/environment.go permits
spaces and commas inside an entry, so splitting the reference space-separated
text would corrupt valid arguments. Metadata accepts the platform's mixed-case
keys rather than adopting the reference's lowercase-only hint; environment
updates remove old keys with empty-string tombstones (internal/api/wire.go).

## Creation workflows — checked 2026-09-11

Chrome/DevTools measured the memory-store dialog at 520px and deployment dialog
at 880px, with 24px insets, 22px/28px titles and 76px description/message fields.
Deployment sections use a 220px explanation column with a 32px gap. Both open
over their lists; closing restores the trigger without adding browser history.

Deployment creation uses a plain initial message, Manual/Schedule controls and
Frequency options: Every minute, Every hour, Daily, Weekdays, Weekly, Custom cron.
The At field uses a 12-hour clock and AM/PM radios; switching 9:00 to PM
changes the cron hour from 9 to 21 (Chrome, 2026-09-11). Midnight/noon map
to cron hours 0/12. Edit cron switches to the raw five-field expression without changing its value.
The platform owns occurrence calculation (internal/cron); draft previews are absent
because there is no preview endpoint. Existing deployment details show returned
upcoming_runs_at. Budget remains absent because deployments.go rejects that key.
Advanced events preserve arrays, structured content and outcome definitions;
metadata stays available as an optional disclosure. Direct creation URLs remain.

Session and Deployment creation share a Resource menu: GitHub repository, File,
Memory store. Memory bindings include a Manage link and multiline instructions.
The console retains manual memory IDs alongside loaded suggestions because the
platform list may be paginated or unavailable; resource shapes remain those in
internal/api/sessionresources.go. Uploads finish before creation is enabled.

## Schema keyboard editing — checked 2026-09-11

The reference custom-tool Input schema inserts two spaces on Tab and releases
focus on Escape followed by Tab. The console exposes the same help through
aria-describedby, consumes that Escape before the surrounding dialog, and keeps
JSON drafts intact until they parse. Shift-Tab remains normal backward focus
navigation. This interaction changes no platform schema validation.

## List controls — checked 2026-09-11

Memory stores show ID, Name, Status, Created and Actions, with Created and Status
filters. Deployments show ID, Name, Status, Agent, Trigger, Created and Actions,
with an Agent filter. Both reference search boxes accept names or exact IDs; the
platform implements no name predicate, so the console offers exact-ID navigation.
Memory creation bounds come from memorystores.go; deployment agent_id comes from
deployments.go. The platform only lists newest-first and cannot isolate archived
memory stores, so the existing Include archived option retains its literal meaning.

The reference schedule timezone trigger opens a searchable list. Console
suggestions come from the browser IANA list; exact custom values remain selectable
because platform internal/cron uses its own embedded zoneinfo and accepts aliases
that Intl may omit. Reference suggestions prefix IANA names with GMT offsets.
The console displays browser offsets at popup open and explains seasonal changes;
schedules still submit the unchanged zone name. The platform remains responsible
for validation and next runs.

## Unsaved Agent drafts — checked 2026-09-11

In the reference, changing an Agent tool and selecting Memory stores in the sidebar
keeps the editor open and prompts Unsaved changes, with Stay focused and Leave as
the discard action. The same prompt appears for cancellation. Console Raw drafts,
including invalid JSON, participate; view changes alone do not count as edits.
Reload and cross-document exits use the browser-owned confirmation because web
pages cannot replace beforeunload with an asynchronous custom dialog.

## Session list interactions — checked 2026-09-11

Reference Sessions offer exact-ID lookup, Agent and Deployment filters, and a
multiselect Status popup. Active selects running, idle and rescheduling; clearing
selection restores that default. Created is sortable. Platform sessions.go serves
deployment_id, repeated statuses and order=asc/desc. Archived deployments remain
in the options because their sessions remain filterable. Filter choices persist
in the URL and reset list cursors when restored through history.

## Created ranges and filter history — checked 2026-09-11

Reference Created expands Custom range with Start/End text fields, separate
calendars and Apply. Either bound may be empty; dates persist as
created=YYYY-MM-DD~YYYY-MM-DD. Sessions additionally offer Today, Last hour and
Last day. Filtered empty states offer Reset filters.

The console interprets dates in the browser local zone and says so beside Apply;
the reference's zone conversion was not observed. Bounds are inclusive, using
created_at[gte]/[lte] from agents.go, sessions.go and memorystores.go.
Range drafts commit on Apply; Escape/Cancel keep the prior selection.
Preset bounds freeze while selected. Reload or restoring another preset computes
a new relative bound. Unknown URL values fall back to supported defaults.

## Acceptance boundaries — checked 2026-09-11

The full local browser suite passed 118 scenarios; a further 11 date/history/draft
checks passed after integrating the guard and Session filters. Creation resource
controls were rechecked in Chrome: GitHub URL/token, default/branch/commit checkout,
optional mount path, memory binding/access/instructions. The console spells out
Default branch instead of None because omission uses the repository default.
Populated reference evidence is now available in the private
managed-agents-wire-recordings repository at `2026-09-12-console-141/`
(commit `ec8c4c6`): `ISSUE_141_COVERAGE.md` maps each #141 boundary.
This supplies comparison inputs; local visual acceptance remains open in
[#141](https://github.com/OpenSDLC-Dev/managed-agent-console/issues/141).

## Vault first credential — checked 2026-09-12

Reference frames 01–12 and UI entries 2, 5, 9 establish that Continue commits
`POST /v1/vaults`, then opens Add a credential. Skip for now retains the vault;
adding a credential opens the populated vault detail and credential list (frame 08),
not a separate credential page. Failed child saves must not recreate the parent.
The environment-variable form explicitly chooses Limited or Unrestricted networking.
Platform `internal/api/vaultcredauth.go` requires non-empty hosts for Limited.

The first step defaults to MCP OAuth. This deployment accepts externally acquired
OAuth tokens and optional refresh configuration; it does not serve browser OAuth
initiation or the reference MCP service catalog, so its form uses manual server URL
and token entry. It does not claim a successful external authentication flow.
The reference workspace-sharing acknowledgment has no matching workspace model here;
platform authorization remains authoritative. Metadata remains available as an
optional disclosure. Ordinary Add credential retains the environment-variable default.

## Session approvals — checked 2026-09-12

Records ec8c4c6, frames 39/41 and UI[139]/[155], show direct Approve/Deny
without a required reason step. The console retains the platform's optional
deny_message under Approval options. This slice aligns those actions;
reference transcript cards and the multi-tab Session inspector remain #141 work.

Platform internal/events/toolflow.go permits confirmations only for ask-gated
built-in/MCP calls. A custom call in requires_action needs a custom result, not
a confirmation; answered calls must not keep approval controls or badges.

CI on macOS exposed two browser-test timing gaps: axe sampled the unsaved-dialog
entry fade (reproduced by slowing that animation); rapid Created-filter reopen
filled the still-mounted closing form before its draft reset (confirmed in trace).
The checks now wait for settled dialog/open-filter state before measuring or editing.

## Memory stores — checked 2026-09-12

Records ec8c4c6, frames 14–20: list inspection uses `?store=ID`; full contents
select by `?memory=ID`, with a folder tree, Rendered/Raw views and inline editing.
The editor changes content in place; the platform SHA precondition protects its
original snapshot even after a background refetch.

Platform `internal/api/memories.go` supplies `depth=1` prefix rollups; the console
never invents folders or aggregate sizes. Memory has no updated-by actor field,
so the reference actor row is omitted. Platform path filters and attributed version
history remain under Store details and version history; the recordings show no
version picker. Existing direct memory/edit/version routes remain available.

The local browser pass found a narrow-header overflow and a missing live error
announcement on save conflict; both are covered by `memory-inspector.spec.ts`.

Memory Markdown images render as explicit links: agent-written content must not
initiate requests from an operator's network merely by opening the preview.

## Agent inspector — checked 2026-09-12

Records ec8c4c6, frames 21–23, retain list selection in `?agent=ID`. The 560px
inspector shows the current version, Open action, expandable built-in permissions,
skills, multiagent and Rendered/API views. Full configuration and version
selection are covered below.

Platform `internal/toolset/materialize.go` resolves defaults and explicit overrides;
it does not emit eight configs when none were supplied. Inspection uses the
existing editor mapping against `internal/toolset/definitions.go`. Roster order
and versions come from the server, including the coordinator itself. Unknown tool
configurations and MCP server records remain inspectable as JSON; no service
catalog or missing platform capability is invented.

## Agent full configuration — checked 2026-09-12

Records ec8c4c6, frames 24–28: configuration is immediately editable, with
Discard/Save new version after changes, a version selector and Start session
in a same-page dialog. The dialog retains the selected saved configuration.
Platform `internal/api/agents.go` reads `?version=` and treats the update body
version as an optimistic precondition. Historical configurations are read-only;
select Latest to edit, so inspecting history does not imply rollback.

Session tabs use the platform agent_id and optional agent_version filters;
Deployment tabs use agent_id across versions because that handler has no version
filter. No per-agent Observability API is implemented, so that reference tab
is omitted. Model/catalog, Advisor and budget boundaries remain unchanged.

Ubuntu CI exposed a narrow Agent tab-row overflow; a 360px local trace isolated
the Deployments button at x=382. The row now scrolls within its container. The
same inspection found the roster grid exceeding its form; its column and member
selector now shrink and long IDs wrap. Browser checks cover 360px and 390px.

## Session list inspector — checked 2026-09-12

Records ec8c4c6, frames 46–48, use `?session=ID` for list selection and a 560px
inspector with Open, actions, Rendered/API and a descending page of 40 events.
Selection must not change the list cursor; detail navigation remains explicit.

Platform `sessions.go:renderSession` emits zero-only runtime stats, and
`domain.Usage` has no cost fields. These placeholders remain in API view;
Rendered does not claim measured duration, active time or billing. Resource
file previews and the full Session tabbed inspector remain separate #141 work.
