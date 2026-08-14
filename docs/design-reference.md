# Design reference — Claude Console fidelity base

The console's visual style tracks Anthropic's Claude Console (standing decision, 2026-08-02). This
file holds the facts extracted from the live reference, so UI work has a stable base and drift is
detectable, and the divergences from it. Re-extract when the reference visibly changes; note the
date. What ships from these facts is `src/app/globals.css`.

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
| Inputs · nav items         | height `32px`, `14px` · `14px`, active item gets a subtle darker pill                                            |

## Dark palette — extracted 2026-08-02 from the reference's stylesheet tokens

The reference's own **console theme pins dark mode to the light palette** — it ships light-only
today. Its sibling **claude theme carries real dark tokens**, and ours uses those, mapped onto the
same roles as the light palette. Shipping a real dark mode is therefore a **deliberate divergence**,
built entirely from the reference design system's own tokens.

| Token (reference) | Value                                   | Our role                     |
| ----------------- | --------------------------------------- | ---------------------------- |
| `bg-100`          | `hsl(60 2.7% 14.5%)` (#262624)          | page background              |
| `bg-000`          | `hsl(60 2.1% 18.4%)` (#30302e)          | cards, popovers              |
| `bg-200`          | `hsl(30 3.3% 11.8%)` (#1f1e1d)          | sidebar                      |
| `text-100`        | `hsl(48 33.3% 97.1%)` (#faf9f5)         | foreground                   |
| `text-300`        | `hsl(50 9% 73.7%)` (#c2c0b6)            | muted foreground             |
| `pictogram-200`   | `hsl(60 2.5% 23.3%)` (#3c3c39)          | secondary/muted/accent fills |
| `border-200`      | `hsl(51 16.5% 84.5%)` at 0.12–0.4 alpha | borders, inputs, rings       |
| `danger-100`      | `hsl(0 67% 59.6%)`                      | destructive                  |

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

## Deliberate divergences

- **Font** — `anthropicSans` is proprietary and cannot be shipped; we use its own fallback stack.
  **Branding** — our own wordmark, never Anthropic marks.
- **Navigation is composed at runtime, not fixed** (issue #33). A hosted product implements every
  surface it shows; a self-hosted console can be pointed at a deployment serving only part of the
  wire, so the shell probes each collection route once per session and drops what answers 404. Only a
  confirmed 404 hides anything, so an unreachable platform still shows every item.
- **API keys is a top-level item**, not filed under a Settings area (added 2026-08-14). A self-hosted
  console's whole settings story is its environment file, so a Settings section holding exactly one
  page would be a menu built to hold a menu.
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
- **The environment-key `ID` column truncates the head, not the tail.** The reference's ids are bare
  uuids, so their tail is the only distinguishing part; ours are prefixed, and the console has one id
  style used on all six resource surfaces. The full id is on `data-token-id` and in the hover title.
- **The setup guide's commands are ours**, with three substitutions forced by self-hosting: the
  `sk-map-env01-` prefix (so a leaked key of ours can never be mistaken for an Anthropic credential),
  an exported `ANTHROPIC_BASE_URL` telling the worker where this platform is, and that value written
  as `$PLATFORM_BASE_URL` rather than filled in, because it is server-side configuration.
- **The login page has no reference counterpart** and offers up to two ways in. A deployment can run
  both gates at once, and they do different jobs: SSO is primary, and the shared password sits below
  it under a line saying plainly that it admits you to the console and authorizes nothing on the
  platform. Without that line, two controls read as two ways to the same place.
- **The signed-in account block names no role and no organization.** Ours copies the reference's
  placement, frame and type scale (14px/500 name over a 12px/17px muted line) and parts company on
  what the second line says: the role is unavailable (no `me` route, and inferring one would be the
  second copy of the authority rules principle 5 forbids), and single-tenant v1 has no organization
  to name — so it carries the email. **Sign out** is explicit rather than behind a menu, because it
  is the only item that menu would hold.
- **A day-scale date always carries its year**, where two of the reference's four forms drop it. Ours
  matches the reference exactly on the two key tables and parts from it on the environments list and
  the detail subheader: a yearless date is unambiguous only if the formatter is year-conditional —
  output that depends on what today is, a row that changes shape on 1 January, and a test that has to
  be told the date. A self-hosted console shows its deployment's whole history, where a hosted
  product mostly shows this week's.
- **The sidebar states the console's version.** The reference shows none, correctly — nobody wonders
  which build of a hosted product they are looking at. A self-hosted operator has no other way to
  tell, so it sits in the same muted register as the connection state.

## Fidelity verification

After building UI, load the console in Chrome next to the reference, screenshot both, compare, and
note the outcome in the PR. The surfaces are enumerated in
[test/fidelity/surfaces.ts](../test/fidelity/surfaces.ts); `pnpm fidelity:shots` writes one shot per
surface per theme.

**Checks against the tables above** — a recorded fact nobody re-measures quietly stops being true:

| Date       | Method                                                                                          | Result                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-07 | `getComputedStyle` on the running console, 1440×900, light                                      | 9 of 10 facts matched; primary button padding-x was upstream shadcn's `10px`. Filed #37, then **10 of 10**.                                                                                                                                                                                                                                                                                                            |
| 2026-08-14 | Side-by-side, environment detail, against a real platform                                       | Heading, copy, columns, order and placement all match. Three differences: `ID` truncation direction and the missing work-queue Overview (both divergences above), and date granularity — console-wide, so filed as #87 rather than fixed here.                                                                                                                                                                         |
| 2026-08-14 | The reference's rendered date cells on three surfaces, then `fidelity:shots` of our equivalents | Settles [#87](https://github.com/OpenSDLC-Dev/managed-agent-console/issues/87), and the measurement is what settled it: the reference carries **no time-of-day on any of the four surfaces** and uses two date forms — recorded above, which the earlier pass had missed because it read one table. Re-shot: every day-scale list and detail surface, plus `sessions-list` to confirm it deliberately keeps its clock. |
| 2026-08-14 | `/login` in all three configurations, against a real Casdoor                                    | A self-check — no reference exists. Type scale, control sizes and the 320px column match our own tokens; the provider accepted the console's authorization request, and an unanswering issuer produced the console's own line with no provider text.                                                                                                                                                                   |
| 2026-08-14 | The console driven **signed in**, with no management key set                                    | Slice 3 adds no visible element and the shots confirm it. What the pass was for is that `/environments` renders **at all** on the operator's own token.                                                                                                                                                                                                                                                                |
