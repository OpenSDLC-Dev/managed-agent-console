# Design reference — Claude Console fidelity base

The console's visual style tracks Anthropic's Claude Console (standing decision, 2026-08-02). This
file holds the facts extracted from the live reference, so UI work has a stable base and drift is
detectable, and the divergences from it. Re-extract when the reference visibly changes; note the
date. What ships from these facts is `src/app/globals.css`.

The [Agents workspace comparison](./agents-console-comparison.md) records the current Chrome walkthrough, capability differences and regression flow.

The page URLs follow the saved signed-in [Agents navigation](https://github.com/OpenSDLC-Dev/managed-agents-wire-recordings/blob/9180e22cd9eb24598f976d1d030f41128b29ba8d/2026-11-07-empty-tools-followup/console-session-archived.ax.txt) and the Messages, Resources and Settings observations below. Default uses the `default` path segment. Other workspaces use their public workspace ID. Dreams uses the same workspace prefix as the other agent resources. The self-hosted Model Gateway pages use `/models` and `/providers`.

## Workspace settings — checked 2026-11-27

The signed-in Claude Settings page lists workspaces with a search field, an archived filter and a Create workspace action. The self-hosted page shows the permanent Default row and identifies inherited organization roles in the member list. The sidebar picker switches the current tab. Resource details open on their collection when changing workspace.

## Dashboard — checked 2026-11-22

In signed-in Chrome, the [reference Dashboard](https://platform.claude.com/dashboard) opens with a time-of-day greeting, Get API key and Build an agent. At 1800 × 945, three 136 px summary cards sit above a full-width Token volume card. Models and Resources each have four columns with 12 px gutters. A primary click anywhere on a model card opens one model in a centered dialog and keeps the Dashboard URL. Its underlying link points to the first-party [Models overview](https://platform.claude.com/docs/en/models/overview). Chrome measured the Fable dialog at 720 × 544 px. Close receives focus. The dialog shows a copyable ID, costs and features. More options beside Try in playground offers Build an agent. Compare models opens its own three-column dialog.

The self-hosted summary uses the gateway's daily usage. Month-to-date requests occupy the hosted credits slot. Spend includes recorded costs with configured prices. Cache reads and seven-day token volume use the upstream counts recorded by the gateway. The Usage links retain the displayed period. The resource cards lead to tools available to the current session.

Each self-hosted card opens a model dialog over the Dashboard. More options also links to the full Console guide. The guide connects upstream specifications to this installation’s provider profile, deployments and gateway aliases. Try in playground and Build an agent use the selected gateway alias and require access to their respective surfaces. Playground also requires the alias in the account’s model list. A shared alias can route to another upstream. The dialog, comparison and guide show the rates, currency and terms saved under Model Gateway → Providers → Upstream models. Each matching deployment has its own fixed rates per million tokens. An operator can record the domestic pricing tier in the terms. Updates apply to future gateway usage. The [provider marks](./provider-marks.md) ship with the Console.

To repeat the comparison, open both Dashboards in Chrome at the same viewport. Click a logo, title, tag and blank area across the four cards. Check the model dialog appears at the Dashboard URL without a new tab. Exercise Close, Escape, the backdrop and keyboard opening. Copy a model ID, open More options and follow the guide. On a configured model, check that Playground and the new agent form select the real alias before any request or save. Compare models must still open three columns. Check an unconfigured model and an account without gateway access. Verify the key shortcut and both usage periods. Run `pnpm exec playwright test test/e2e/dashboard.spec.ts` after `pnpm build`.

## Sidebar structure — checked 2026-11-21

Signed-in Chrome showed Dashboard above Build and Organization. The [Claude Dashboard](https://platform.claude.com/dashboard) opens a separate navigation panel for each category. Agents contains sessions, deployments, environments, memory and vaults. Resources contains files, skills and webhooks. Keys includes API keys and service accounts. Settings includes Members.

On desktop the reference opens a group's default page and submenu together. After returning to all sections it shows the current page beside its group. Reopening that group keeps the current page. The console uses the first available destination in each group as its landing page. While availability is being checked, the group opens its submenu in place. Browser Back and Forward restore the page and its submenu, including on query-only history traversal.

The full submenu header returns to all sections, keeps the current page open and restores focus to its group. On narrow screens the header menu opens full width and contains Documentation. A group selection opens its submenu. A destination selection or Escape closes the menu. Reopening starts from the current page. Opening and dismissing the menu preserves the page's scroll position.

The reference uses a single-line wordmark and puts Documentation on the right of the global header. Its first sidebar row is inset 8px from the top and sides. Rows are 36px high with no gap within a section. The desktop sidebar stays expanded. The console links to the self-hosted platform documentation.

The reference ends the sidebar with an inset account button and opens its menu upward. The console shows the signed-in user, current platform role and a connection indicator on that button. The menu follows system appearance. Self-hosted operators see separate Platform and Console versions and details of connection failures above Sign out. Arrow keys move focus through available actions and Escape returns focus to the button.

## Global search — checked 2026-11-20

Signed-in Chrome showed a 448px search trigger centered in the 48px header. Opening it placed the focused search field in a 672px panel 15% down the viewport. The console shows Command on macOS and Ctrl elsewhere. The visible and accessible labels separate the key names. Search offers existing pages and platform resources.

## Messages — checked 2026-11-22

Signed-in Chrome opened **Build → Messages** on [Overview](https://platform.claude.com/workspaces/default/messages-overview). The Default workspace selector sits above the page links. Tokens and Requests cover 30 days. The Cache hit rate information button specifies seven days. Open playground, API keys and Resources follow the cards. The self-hosted preview uses the key directory visible to the current account. Platform supplies the key hint, owner, creator and expiration. It has no key last-used timestamp. Batches has no self-hosted endpoint.

[Logs](https://platform.claude.com/workspaces/default/logs) shows individual requests from the last 30 days with Copy ID, a timestamp and Refresh. Selecting a request adds its ID to the URL and opens a right drawer. Previous and Next follow the list order. An owned API key still identifies a direct call when a client sends a routing affinity. The ledger cannot distinguish an OAuth call carrying that header from a delegated agent call. Both are excluded. The ledger provides token counts, latency, status and attribution. Prompts, replies, streaming mode, service tier and client application are unavailable. Platform retention can be shorter than 30 days. The ledger cursor orders by ID and has no date or endpoint filter. Overview accumulates counters per page. Logs reads additional pages when the operator asks for older records or opens an older request URL.

The Model column shows the name the client requested. The drawer also shows the gateway alias matched at the time, which can be a wildcard. A deployment rename leaves both fields intact. Platform does not record the upstream model name on the usage row.

### Repeat the Messages comparison

Open both signed-in consoles in Chrome at the same viewport. Use the same account role for a repeat comparison. Use the mock fixture for submissions.

On desktop the top edges of the back button, workspace selector and Overview link are 40 px apart. The following links start every 36 px.

1. Open Messages from the desktop sidebar. Check the selected Overview link, Default workspace menu, metric explanations, Usage and Logs links. In the fixture, create a user key from Overview and disable it. Follow the key from Overview to its details, archive it, then check that it disappears. A Playground-only user lands on Playground.
2. In Playground, change the output limit and Streaming in Model settings. Open Add with the keyboard. Add each preset and check its settings in Code. Collapse one card while the others stay open, then remove it. Change models with a web tool selected. Page through the templates and check the selected card, model and tool declaration. The bottom Add appends a message.
3. In the Playground fixture, run a client tool. Expand its arguments in Rendered, compare Raw, select Add to messages, enter a result and run again. Check the IDs for two calls with the same name. Repeat with a hosted web result and with a mixed response. Only client calls have a result field. Check Stop and History.
4. In Logs, copy an ID, open the row with the keyboard and compare Requested model with Gateway alias. Switch requests, reload its URL, then close with Escape. Close the drawer by clicking the page heading. Refresh after adding a fixture record. Repeat at phone width and with an empty list or a refused ledger read.

Run `pnpm test:e2e test/e2e/messages.spec.ts test/e2e/playground-tools.spec.ts test/e2e/api-keys.spec.ts` for these interactions. After building, run `pnpm exec playwright test --config playwright.fidelity.config.ts --grep 'shot: messages-'` for light and dark screenshots. Both commands use the local mock edge. The API key suite disables recordings during one-time key reveals.

For a manual tool replay, run `pnpm build`. In three terminals, start `MOCK_PLAYGROUND_REPLAY=1 node test/mock-platform/server.mjs`, `pnpm exec next start --hostname 127.0.0.1 --port 3090` and `node test/mock-platform/edge.mjs`. Open [the fixture Playground](http://127.0.0.1:3100/playground) and sign in with the test account from `test/mock-platform/native-auth.mjs`. The replay requires no provider credentials.

## Playground — checked 2026-11-22

Signed-in Chrome placed [Playground](https://platform.claude.com/workspaces/default/playground) under **Build → Messages** and in the Dashboard's Resources section. Both the group header and its arrow return to all sections while the editor stays open.

At 1800 × 945 the reference starts with a 50/50 split and a 12px resize handle. Form and Code share the left column, with model settings at the top and Run at the bottom. The empty right column contains a 672px template grid with 16px gaps. Selecting a template fills the request and leaves its card selected. The reference pages through 12 cards. Console offers the six applicable reference examples and a Browser use example, **Navigate a website**. Selecting a card keeps the gateway alias.

Model settings opens a right drawer. It repeats the model selector and places the token limit above Advanced, which contains stop sequences and Streaming. Console reads thinking modes and output limits from the selected gateway alias. Token and temperature sliders expand to include an entered value. The gateway leaves sampling bounds to the upstream model. Switching aliases preserves the draft and identifies a thinking mode the new alias does not advertise.

The Console uses client function declarations for Bash, Computer use and Browser use. The response shows requested actions. Add to messages keeps the assistant blocks and opens one result field per client call. The operator can submit the next turn after entering results. For web search and fetch, the configured `deepseek-flash` alias uses DeepSeek's hosted tools. Other aliases, including operator-defined names, use portable search and fetch functions. The model list gives no per-tool routing information. [DeepSeek Web Tools](https://api-docs.deepseek.com/guides/web_tools/)

Code has an editable snippet, Copy code and a Streaming setting. The self-hosted editor supports cURL and JSON. History covers runs in the open page. The platform does not store prompt history or host shared requests.

After a signed-in Haiku run, the right column switched to Rendered and Raw views. Add to messages worked from either view and placed the answer above a fresh user message. The footer showed token counts, cost and duration. The native Messages stream supplies token counts. The Console measures elapsed time and omits the hosted price estimate.

History opened in a 432px panel over the right column. Selecting the recorded run restored its reply while the panel stayed open. Clicking the prompt closed the panel and focused the editor. Arrow keys on the pane divider changed the split by one percentage point.

## Native-only Console — checked 2026-11-17

Chrome reached the reference's public sign-in offer, with a centered rounded card, Google button, email field and dark primary action.
No authenticated model, key or account surface was available. This change preserves the established native layouts and claims no new authenticated-reference comparison.
The model inspector retains organization limits; the retired per-key model-access editor has no replacement because the platform removes that policy dimension.
The fidelity manifests record the surviving login, account, key and model states. Their local screenshots remain distinct from reference-access evidence.

## Environment keys (platform plan 69 slice 6)

On 2026-11-16, Chrome reached the authenticated reference Dashboard and its Resources navigation entry.
Resources navigation and the subsequent page read timed out. No environment detail or key dialog was observed in that visit.
This slice reuses the established key table, name dialog, reveal-once dialog and revocation confirmation; it claims no new authenticated-reference comparison.

The platform requires Console management for every environment's keys before removing legacy credentials.
Cloud and archived environments therefore expose those controls. The cloud view omits the worker setup guide because its keys cannot poll work.
The states for local light/dark verification are enumerated in `test/fidelity/native-surfaces.ts`.

## Deployment initiator (platform plan 69 slice 5)

On 2026-11-15, Chrome showed the authenticated reference's Deployments list and Create deployment form.
The form groups General, Trigger and Resources in two-column sections with compact controls and a fixed save footer.
No initiator selector was present in that form. This platform adds an administrator-only setting under Trigger for existing deployments.
It uses the platform's private cookie API because plan 69 binds scheduled execution to a retained identity.
The native fidelity manifest covers the setting and its service-account dialog in light and dark themes.

## Model limits and principal usage — 2026-11-15

Fresh Chrome reference access timed out before the page could be inspected. This iteration reuses the recorded design system; it does not claim current authenticated-reference fidelity.

The model inspector's organization budget editor is a self-hosting extension of platform `internal/modelgateway/admin/model_limits.go`. It uses the existing dialog and form controls. Developers read; admins write. The public model alias is the shared budget dimension, including `*`.

Usage follows `admin/usage.go`: daily rows group by stored principal, with legacy key attribution retained. The ledger shows both principal and credential. The directory exposes different public IDs, so the console displays stored principal IDs without inventing name mappings.
The new states are enumerated in `test/fidelity/native-surfaces.ts`.

## API keys — checked 2026-11-21

The signed-in [Claude Keys page](https://platform.claude.com/settings/keys) counts visible matches. Search combines with creator, linked account type (Person, Service account, Not linked) and status. Reset restores the unfiltered collection. Created and Expires sort newest first on their first click. The Key cell shows its hint and status. Created groups the date and creator. The 560 px panel has an 8 px inset. Clicking another row switches its contents. Clicking the page heading dismisses it. View cost opens the selected credential and month to date. Expired keys retain cost and deletion.

Create key first asks where code runs. The local-machine path offers CLI sign-in. Somewhere else opens Name, Expires, Linked account and Scope. Both the Keys page and the Dashboard use the same issuer here.

Platform defines the following limits in `internal/api/consoleapikeys.go` and `internal/modelgateway/store/usage.go`.

- Only the default workspace exists. The key resource supplies neither scope nor last use. Admins can assign an active service account. Historical unowned keys retain their attribution.
- Owned key issuance predates CLI login. The chooser checks the edge's `GET /oauth/authorize` response before offering the CLI path. The request uses same-origin cookies for installations behind an identity proxy. Without OAuth parameters, the handler returns before sign-in or consent. See the Platform's `internal/api/clioauth.go`.
- Gateway daily reads with `api_key_id` preserve credential-level costs. Unfiltered owner totals combine credentials. The Console links to the selected key's UTC month to date. A sortable per-key amount in the listing needs a permission-scoped batch read.
- Delete archives the key. The Keys page omits archived rows from the list, count and filter choices. Platform retains the key ID for administrative queries and historical costs. Expired keys remain visible until deleted.

### Repeat the Keys comparison

1. Run the focused regression and Chrome screenshot commands below. The mock suite owns its sample keys. The native tier in the [development guide](../README.md#development) also verifies real issuance and revocation.
2. At the same viewport and theme, open the signed-in reference and the local `/settings/keys`. Compare the heading, search and filter row, table, panel, menu and create dialogs. Search for a missing name. Combine two filters, clear one selection and check that the other filter and search survive. Try Reset search, Reset filters and the toolbar Reset. Sort a column and open a key with Enter. Check both ends of Previous/Next, click another row, then dismiss by outside click, Escape and Close. Check focus after dismissal.
3. Open View cost from the list and the panel. Check the selected key, UTC dates, reload and browser Back. Open the CLI and API-key paths from both entry points. Check name focus, expiry preview, Custom, Never and cancellation.
4. Create a fixture key, close its one-time reveal, then disable and enable it. Cancel deletion and check the row is still present. Confirm deletion and verify the count drops. Search for the key before and after reload. Check that the administrative listing still returns its ID with status `archived`. Keep live keys and account identities out of shared captures.

```bash
pnpm build
pnpm exec playwright test test/e2e/api-keys.spec.ts
pnpm exec playwright test test/e2e/a11y.spec.ts --grep 'API key filters'
pnpm exec playwright test --config playwright.fidelity.config.ts --grep 'shot: (api-key|dashboard-api-key)'
```

Light and dark captures go to `fidelity-shots/<theme>/`. The manifest includes the empty search, filtered list, mobile detail, cost drilldown, CLI guide and key form. The mock, native and screenshot suites share the steps in `test/api-key-flow.ts`.

## Service accounts — checked 2026-11-21

The signed-in [Claude Service accounts page](https://platform.claude.com/settings/service-accounts) opens a resizable detail panel from the account name. Copying the ID keeps the list open. Active rows offer Edit, Create API key and Archive. The editable panel returns to the same account on Cancel or Save. Open leads to a centered detail page with an inline description, an organization role and a menu for archiving. Creating a key from an account fixes its owner and asks for an expiration.

Platform's `internal/api/serviceaccounts.go` supplies cursor pages. The Archived read includes active accounts, so the Console follows each cursor and filters by the returned archive timestamp. Associated keys use the service account's public ID in the key principal. Platform supports one workspace and does not return federation rules for this page.

### Repeat the service account comparison

1. Open the signed-in reference and the local Service accounts page at the same viewport. Compare the table, row menu, copy button, search, status switch, resizable panel, full detail page and create dialog. Use an existing reference account. Check the archive confirmation and cancel it.
2. On the local fixture, create an account. Try an invalid name, a duplicate and a valid name. Use Escape, the close button and a click outside a modified form. Keep editing, then discard. Open an account with the keyboard. Edit from the row, cancel back to its panel, then save. Follow Open, edit the description, refresh, and return through the breadcrumb.
3. Issue a key from the account, dismiss its one-time reveal, and open its metadata from the account. Archive the fixture account. Verify that it leaves Active, appears in Archived after reload, and offers read-only details. Search for a record beyond the first cursor page, search for a missing record, then reset the search while Archived is selected.

```bash
pnpm build
pnpm exec playwright test test/e2e/service-accounts.spec.ts
# Set NATIVE_PLATFORM_SOURCE and NATIVE_EVIDENCE_DIR as in the development guide.
pnpm exec playwright test --config playwright.native.config.ts --grep 'native service account page|native owned keys preserve'
export NATIVE_FIDELITY_IDS=$(node --input-type=module -e 'import { NATIVE_SURFACES } from "./test/fidelity/native-surfaces.ts"; console.log(NATIVE_SURFACES.map(s => s.id).filter(id => id.startsWith("native-service-account")).join(","))')
NATIVE_FIDELITY=1 pnpm exec playwright test --config playwright.native.config.ts --grep 'walk native manifest'
```

The [shared interactions](../test/service-account-flow.ts) run against both the mock and real Platform. Native fidelity captures cover the light and dark states in [the manifest](../test/fidelity/native-surfaces.ts).

## Memory pagination — checked 2026-10-24 (#236)

Chrome's active memory-store list was empty, so no populated end-page UI was available to compare.
The recorded `2026-10-22-memory-list-order` walk ends with an empty fourth page after three full
`depth=1` pages (idx 25–28); platform PR #982 now serves that boundary. The console names an empty
page reached through Next as the end of the walk, with Previous available, rather than treating it
as an empty store. The existing controls and layout stay in use.

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

## Resources Overview — checked 2026-11-24

In signed-in Chrome, Resources opens the workspace overview. The Default workspace selector sits above Overview, Files and Skills. A 16 px gap separates two equal cards when the content is at least 640 px wide. Narrower panes stack the cards. Each card links to its full list and previews up to three entries. File rows show the relative time added. Skill rows show the source. A preview opens its record in the list drawer. Add → File opens the list. Add → Skill opens the creation dialog.

The local route is `/workspaces/default/resources-overview`. Platform serves the reserved Default tenancy and has no workspace-management or webhook endpoint. The two collection reads use Platform sessions. Counts include later cursor pages. A trailing plus is the confirmed lower bound while those pages load or if the count cannot finish.

Run `pnpm exec playwright test test/e2e/resources-overview.spec.ts` to exercise navigation, workspace selection, list and drawer links, skill creation, pagination, empty collections and the responsive layout. The same suite checks focus after dismissing or submitting the dialog, Back during upload, staged files across a failed background refresh, an inconclusive probe and a refused creation link. For visual comparison, run `pnpm exec playwright test --config playwright.fidelity.config.ts --grep 'shot: resources-(overview|workspace-list)'`. Compare the light and dark captures with [Claude Resources Overview](https://platform.claude.com/workspaces/default/resources-overview).

## Files and Skills — checked 2026-11-23

Signed-in Chrome showed searchable Files and Skills tables, a serif page title, selection checkboxes, row actions and a resizable right inspector. A failed exact-ID lookup appears in the list. A matching file is a result row. Enter on a matching skill opens its inspector. Both inspectors retain the list, previous/next navigation, Rendered/API and a shareable URL. The search palette opens the same inspectors. Existing standalone skill URLs still work.

Files stage a single file before upload. Ordinary uploads have no downloadable content. The console reads the platform’s metadata by ID and only requests previews for downloadable text up to 1 MiB. Files and custom skills have named single and bulk deletion confirmations. Bulk deletion calls the existing per-ID endpoints and retains refused IDs for retry. Selecting a catalog skill disables bulk deletion.

Selecting a row shows a floating bar with the count, an × to clear, a divider and Delete. In signed-in Chrome the 40 px desktop bar sits 24 px above the viewport bottom, centered in the list pane. It stays there when the table scrolls or a detail drawer opens. The delete confirmation opens above the bar. Clearing with the keyboard returns focus to the last selection checkbox. When the pane is narrow, the drawer keeps its Rendered and API controls above the bar.

Create skill and Update share one drag-and-drop form. Creation returns to the list. Directory uploads preserve relative paths. For a loose SKILL.md the form supplies the directory required by the platform, using its frontmatter name when available. The platform validates the bundle and supplies the display name and version description. The hosted form advertises 8 MB; this deployment accepts 30 MiB of uncompressed skill contents. The standalone detail also preserves historical descriptions, version downloads and version deletion.

### Repeat the Files and Skills comparison

1. Build with `pnpm build`, then run `pnpm exec playwright test test/e2e/resource-library.spec.ts test/e2e/skills-inspector.spec.ts test/e2e/resources.spec.ts`. These run in the standard E2E suite against the resettable project fixture.
2. Exercise staged upload, dismissal, full-ID copy, lookup and clear, drawer tabs and navigation, allowed and unavailable downloads, single deletion, mixed selection and partial bulk retry. Delete the final row on the last page and verify the earlier files are visible. Create a custom skill with another inspector open, update it, download and delete a version, and verify the catalog remains read-only.
3. Run `pnpm exec playwright test --config playwright.fidelity.config.ts --grep 'shot: (files-(list|selection)|skills-(list|selection)|file-inspector|file-upload|file-delete-confirmation|skill-(inspector|detail|upload|update|lookup-miss))'`. Compare the two Chrome themes in `fidelity-shots/` with the signed-in reference at [Files](https://platform.claude.com/workspaces/default/files) and [Skills](https://platform.claude.com/workspaces/default/skills). Check that the bulk bar stays centered in the list pane at desktop and phone widths and that the last row scrolls fully above it. Use disposable data for write checks.

## Session resources — checked 2026-09-06

The previous inspection established the compact session detail pattern. On
2026-09-11 the reference lists were accessible but contained no sessions, so
this slice does not claim a fresh populated-detail comparison. The console uses that
existing detail-section pattern for resource rows and dialogs. Its lifecycle is
forced by the platform: files can be added after creation and removed; repository
and memory-store attachments are creation-time inputs and remain for a session's
lifetime ([memory stores](#memory-store-rows--checked-2026-10-03-193)); repositories
expose only write-only token rotation. The `session-resources`
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
  **Branding** — the header uses the console's own terminal icon and `Agent Console` wordmark.
- **Nav icons are the nearest lucide equivalents**, because the reference's are a pictogram font we
  cannot ship — the same constraint as the typeface, one layer down. `House`, `Hammer` and `Waypoints`
  are close (the last approximates a circle-diamond-circle node graph with circles); `API keys` keeps
  `KeySquare` rather than the round-bowed key the reference draws, because `KeyRound` is already
  Credential vaults' and one icon may mean one thing.
- **Navigation follows the deployment's collection reads** (issue #33). A self-hosted deployment may
  lack a surface or refuse the current person's read. Confirmed absence (`404 not_found_error` or
  `501`) and refused reads (`403 permission_error`) hide entry points, for different reasons.
  Unknown, network and server failures keep them visible. Direct routes distinguish refusal from
  absence; see [Authorization presentation](#authorization-presentation--checked-2026-10-27).
- **Model Gateway** groups the self-hosted platform's models and providers. In signed-in Chrome
  on 2026-11-21, the shared Organization groups appeared in the order Keys, Spending & usage,
  then Settings. The self-hosted console places Model Gateway immediately after Keys. Vendor names come
  from the gateway profiles' `display_name`.
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
  as `$PLATFORM_BASE_URL` for the operator to set to an address the worker can reach.
- **Native login follows the platform's configured sign-in method.** Named password accounts and setup-code redemption are self-hosting extensions. The Console does not add a second shared gate.
- **The account trigger represents the current user.** Its second line displays the platform's current role. The panel carries the email when the sign-in provider supplies it.
- **A day-scale date always carries its year**, where two of the reference's four forms drop it. Ours
  matches the reference exactly on the two key tables and parts from it on the environments list and
  the detail subheader: a yearless date is unambiguous only if the formatter is year-conditional —
  output that depends on what today is, a row that changes shape on 1 January, and a test that has to
  be told the date. A self-hosted console shows its deployment's whole history, where a hosted
  product mostly shows this week's.
- **The account panel displays the console's version.** Self-hosted operators use it to identify the running build.
- **Navigation labels and the connection state are title case** (`API Keys`, `Credential Vaults`,
  `Memory Stores`, `Platform Connected`), where the reference writes `API keys`. The owner's call on
  2026-10-14, so that two-word labels match the group headers (`Managed Agents`). Form field labels
  stay sentence case.
- **Danger is two colours, not one** ([#90](https://github.com/OpenSDLC-Dev/managed-agent-console/issues/90)).
  A destructive control puts a label on a wash of the danger colour and paints both from one token,
  which caps their contrast at how far a colour can differ from a tint of itself — in dark mode that
  ceiling is **4.29:1 at every possible value**, so no single token clears AA. `--destructive` is
  therefore the colour that gets read and `--destructive-surface` the wash behind it; the wash keeps
  the value it always had, so the controls look as they did and only the glyphs move. The reference
  ships one `danger-100`, but it also ships no dark mode — the surface we borrowed it for is ours.

## Authorization presentation — checked 2026-10-27

Platform plan 69 slice 1 gives `user` no resource reads. Hiding a confirmed collection-read refusal
is a narrow departure from archived plan 08 D4: the platform's actual answer supplies the evidence,
not an IdP claim or a browser role map. This does not implement platform #403 or infer write access.
The existing calm error state explains direct-route refusals; write controls still let the platform decide.
A refused collection read on the connection probe reports access denied, not an outage.

Fresh Chrome access to the reference Dashboard showed its sign-in offer, not an authenticated resource
surface. No new authenticated reference facts were inferred. The local Chrome pass uses the recorded
layout and error treatment above, in both themes. Stub OIDC exercises the console sign-in and session
boundary; injected platform refusals do not prove the platform's stored-role resolution.

## Native browser administration — checked 2026-10-29

A fresh, isolated Chrome visited the reference Dashboard without an account. It showed the public sign-in offer.
No authenticated member, service-account or account-menu state was available. Do not treat those states as freshly extracted reference design.

Native pages reuse this repository's tokens, tables, dialogs, form controls and recorded account-block type scale.
Self-hosting requires named local development accounts, operator setup codes, backend role metadata and explicit last-admin refusals.
The native block shows the role returned by `/api/auth/session`, never a role inferred from claims.
A signed-in user without resource authority keeps account and setup controls. IdP-managed roles are labelled, not hand-editable.

`test/fidelity/native-surfaces.ts` names the native light/dark states; `test/native/fidelity.spec.ts` walks them against real platform handlers.
The local Chrome pass covers login, setup/refusal, no-resource access, mapped members, creation, last-admin refusal, loading and service-account editing/archive state.
It checks keyboard focus and horizontal overflow. Screenshots are local-state evidence, not an authenticated-reference comparison.

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

## Workspace settings — checked 2026-11-27

The signed-in Claude Settings page lists workspaces with a search field, an archived filter and a Create workspace action. The self-hosted page shows the permanent Default row and identifies inherited organization roles in the member list. The sidebar picker switches the current tab. Resource details open on their collection when changing workspace.

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

## Manual agent creation — checked 2026-11-24

In authenticated Chrome the Agents directory opens a 768 px centered editor with a separate breadcrumb, a collapsible Starting point, Rendered/Raw controls and a bottom action bar. Template selection fills the draft and collapses Starting point. The model picker combines model, effort and speed. The initial draft includes a name, description, system instructions and the built-in toolset. The sidebar labels are Memory and Credential vaults. The guided Create gallery remains a separate entry.

The self-hosted menu reads gateway aliases. Generate uses the signed-in operator’s Playground grant and a discoverable model. Platform accepts the five effort levels, fast speed and coordinator subagent rosters. Its tool policies are always allow and always ask. MCP servers are configured by URL. Incident commander binds its two inactive connector declarations to disabled toolsets because Platform requires every declared server to have a binding. The hosted advisor, dynamic-workflow and connector catalog controls have no corresponding Platform contract. The [comparison and regression walkthrough](./agents-console-comparison.md#directory-creation-regression) records the checks.

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

The private resource transport rejects path delimiters in exact-ID input before forwarding, so
reserved characters cannot turn a detail lookup into a different route.

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
The comparison and Docker acceptance are recorded below. Delivery status is tracked in
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
the transcript cards and multi-tab inspector are covered in Session workspace below.

Platform internal/events/toolflow.go permits confirmations only for ask-gated
built-in/MCP calls. A custom call in requires_action needs a custom result, not
a confirmation; answered calls must not keep approval controls or badges.

The self-hosted console discloses the MCP server and complete call arguments at
approval time. MCP tool names can match built-in names, and operators need to
distinguish the source before authorizing a call.

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
Rendered does not claim measured duration, active time or billing. Full Session
inspection and nested resource facts follow below.

## Session workspace — checked 2026-09-12

Records ec8c4c6, frames 30–45: the transcript sits beside Session/Events/Tools/Resources/Threads; `inspector=thread` selects Threads and `event=ID` restores event detail. Message/tool cards retain full content and place approval controls beside the pending call. Debug and the platform Outcomes projection remain available.

Platform `threads.go:renderThread` emits zero-only runtime stats, as Sessions do. The workspace omits measured runtime/billing claims; Tools counts only calls in the loaded trace, with permission configuration from the selected saved Agent snapshot. The later multiagent recording and its implemented boundaries follow below. Raw SSE follow-up is separate from this UI change.

Filtering exposed a second approval control before SSE delivered an accepted confirmation. Request state now lives for the Session workspace lifetime; regression checks cover acceptance and in-flight failure across filters and Debug. Sparse-usage probes also caught an unguarded counter in the new overview.

Review caught transcript search using one-line, 200-character summaries. Search now reads complete content and payloads; a regression covers later lines, multiple text blocks and long tool inputs in both transcript and event filters.

## Session nested resources — checked 2026-09-12

Records ec8c4c6 frames 30–32 expand a bound store in Resources, then show the selected memory's details and content without changing the Session URL. The preview links to its Memory-store workspace. Read-only previews remain available on archived Sessions; binding access describes the Agent's mount and is not used to infer the operator's write role.

Frames 49–50 inspect a mounted upload's type, size, attachment time and both File/Resource IDs. Attachment time comes from the resource binding, not the file's earlier upload time.

Memory trees use the existing server prefix/depth paging. File metadata and bytes come from `files.go:getFile/downloadFile`: uploads have `downloadable=false`, and expired content returns 404 while metadata remains. The console does not borrow environment credentials to read uploads. Downloadable text can be previewed up to 1 MiB; other outputs retain Download. File bodies render as escaped text and Memory Markdown never automatically fetches remote images.

## Session files — checked 2026-10-03 ([#192](https://github.com/OpenSDLC-Dev/managed-agent-console/issues/192))

Platform #578 (`d339a1c9`) mints a session-scoped copy for every file mount and drops scoped rows from the unfiltered `GET /v1/files`. Read from recordings `2026-09-12-console-141` and `2026-09-12-child-lifecycle`; no live reference pass.

- **Recorded:** an open Session polls `GET /v1/files?beta=true&scope_id=<session>&limit=1000` under `anthropic-beta: managed-agents-2026-04-01`, about every 10s, from load until archive (`ui-network` idx 36–303). Copies come back `downloadable: false`, scoped, with the upload's name, size and type, the name kept when the mount renames the file (idx 243, 274, 292).
- **Recorded:** the Resources tab shows a mounted file as a `Path`/`Size` row whose size is its copy's (88B in frames 49 and 63; nothing else was fetched after idx 288's attach). Details show Type, Size, Attached, the copy's File ID and the Resource ID (frames 50, 63).
- **Ours:** the same request and header, polled at the Session's 15s cadence while Resources (or the rubric picker) is open, from load until archive: an archived Session reads it once, and the archive reads it once more. The platform lists an unknown scope as empty, so a 404 means the list is not served: polling stops and the list hides, the rows it last listed included, as any absent surface does. A mounted file's row adds its copy's size in this tab's `88 B` memory-size format. The session's files are rows of the tab, so the tab is not called empty while their list loads (an announced status says so) or has failed; a filter matching none of the rows it has says so either way.
- **Recorded, the header's reach:** the reference does not send `anthropic-beta: managed-agents-2026-04-01` on every `/v1` call, so the resource transport does not stamp it on all of them. Across the eleven `ui-network` recordings, `/v1/skills` calls, the upload (`POST /v1/files`, console-141 idx 63) and file metadata (`GET /v1/files/{id}`, idx 236, 269) carry none; `/v1/environments` mostly carries `environments-2026-03-01,environments-package-support-2025-12-09`, `/v1/models` `server-side-fallback-2026-06-01`, and the event streams add `managed-agents-vnext`. The console sends it on the one request recorded with it here, the scoped list; the platform accepts and ignores it.
- **Inferred (unrecorded):** no recorded list carries an output (`downloadable: true`), so their placement is ours. Rows no resource names follow the resources: an output labelled `Output` with the only Download, and a copy whose resource was removed labelled `Upload`, the reference's word for a mounted copy. The rubric picker suggests the session's files beside uploads, labelled `session file`, from the same cached list; a file both lists carry (outputs, before #578) is offered once, as the session's, and either list failing or cut is named on its own.
- **Inferred (unrecorded):** each of those rows offers Delete, confirmed first. No recorded Resources row has a delete (frames 49, 50, 63), but `files.go:deleteFile` takes an output or a copy as it takes an upload, whatever the session's archive state, and before #578 the Files page offered Delete on outputs; without it they could only go with their Session. A mounted copy's row keeps Remove resource instead. The dialog stays open until the delete settles, the platform's refusal shown in it; one closed while the delete is out has the refusal toasted. An expired output shows `Expired` where Download was, its content being gone.
- **Ours, no client-side refusal:** which rows offer Delete is how the current data reads them — listed, and no mount in the Session as read — not a check on confirm. `files.go:deleteFile` deletes a mounted copy with a 200 like any other row, so refusing one in the console would be validation stricter than the wire's (harness/rules/platform-contract.md). Rejected: re-reading the Session on confirm and refusing a copy a mount had just named. The list and the Session poll apart, so a copy can list for a moment before the Session names its mount; Attach file reads the Session before the list to keep that window short, and a delete inside it is the platform's to answer.
- **Divergence:** the Sessions-list inspector links a mounted file to the Session's Resources. The reference links it to Files with `?file=<copy>` (frame 47 DOM); ours has no file inspector there, and the copy is not in its list. The Files page drops its Scope column, since no scoped row reaches it.

## Memory-store rows — checked 2026-10-03 ([#193](https://github.com/OpenSDLC-Dev/managed-agent-console/issues/193))

Read from recordings `2026-09-12-console-141` and `2026-09-02` batch2; no live reference pass.

- **Recorded:** a memory-store row in the reference's Resources tab carries no action: its DOM holds the Expand/Collapse toggle and the Inspect button, its Size cell empty (frames 30–32, 61, 63–64), and its preview offers Copy, Find in transcript and Clear selection (frame 31). The Resource menu offers a memory store only "when the session is created" (frame 61).
- **Recorded:** the reference answers `DELETE …/resources/memstore_…` with 404 `not_found_error` "Resource not found: memstore_…", and its next list still carries the element (batch2 `session.resources.delete.by-memory_store_id`, `list.after-delete-attempt`). The platform does the same: `sessionresources.go:checkResourceID` admits only the `sesrsc_` ids a memory element does not carry, before it reads the session.
- **Ours:** a memory-store row offers no Remove, matching both. A file row keeps Remove resource and a repository row Rotate token alone (`session-resources.tsx`).
- **Inferred (unrecorded):** no recorded Resources row has a remove at all, file rows included (frames 49, 50, 63). The file row's Remove stays ours, since `deleteSessionResourceTx` serves it and nothing else in the tab detaches a file.

## Session timeline and Thread details — checked 2026-09-12

Records ec8c4c6 frames 39–43 show the event strip, 1.00× zoom controls, Copy/Download and a selected Thread's Agent, model, context chart and usage. No zoom action or resulting scale was recorded. Local zoom uses a bounded horizontal 1×–8× viewport; this is an interaction choice, not a verified reference zoom factor.

Timeline positions use `events.go:eventWire`'s persisted `processed_at`; only matched `span.model_request_start/end` pairs contribute model span widths. Unstamped events remain in the transcript and full JSON export. Filters do not truncate the export. The range ends at the last loaded stamp, with no estimated runtime.

Review found coincident markers masking one another. Overlapping visible intervals now occupy separate lanes inside a bounded, scrollable track; pointer regression checks every fixture event at fit and zoomed scales. This preserves timestamp positions while keeping each event reachable.

`threads.go:renderThread/threadScope` supplies the pinned Agent snapshot, usage and event scope; its primary view is the Session view. The chart reads each `domain.ModelUsage.input_tokens` counter in request order. It does not infer context size, costs or thread totals. The reference's context/cost/active-time fields have no implemented platform equivalent; raw API responses remain available. The September 12 multiagent follow-up below supersedes the earlier primary-only reference coverage.

## Deployment list inspector — checked 2026-09-12

Records ec8c4c6 frames 51–53 select `?deployment=ID` beside the list. The pane offers Open, previous/next, Rendered/API, pinned Agent/environment metadata, initial message, trigger and session resources. Exact lookup stays exact: the platform has no name-search predicate.

`domain.Deployment.Agent` pins a version; names resolve against that version. `deployments.go:fillScheduleTimestamps` owns upcoming timestamps, including the paused and archived rules. The console displays those timestamps in explicitly labeled UTC, without computing cron or a draft preview. Advanced initial events retain their whole JSON when a single plain message would discard fields. Budget is not served, and file references link to the implemented Files list rather than inventing a file inspector.

## Deployment workspace — checked 2026-09-12

Records ec8c4c6 frames 54–61 show Configuration/Runs, an independent pinned Agent version, inline Save/Discard, and `?tab=runs&run=ID`. A successful run opens a **Session** inspector with an additional Run section. Open retains `from_deployment`/`from_run`; the local Session breadcrumb accepts deployment context only when it matches the returned Session's deployment.

`deployments.go:updateDeployment` replaces resources, vaults, initial events and schedule; metadata remains a patch. Omitted resources preserve sealed repository credentials. Replacing any attachments requires a token for each retained repository because read responses cannot return those tokens. Drafts survive tab switches and background refresh, clear secrets after successful saves, and lock their rows while uploading. Discard restores the form's last saved baseline. The wire has no optimistic update token; reloading obtains external edits.

`domain.DeploymentRun` records Session creation, not execution completion. Results and `trigger_type`/`has_error` filters come from the platform; Session status is queried independently. Missing/deleted Sessions and failed runs retain run metadata. Saved schedule timestamps remain explicitly separate from draft cron fields; no client cron preview or budget calculation is introduced. Version options use the implemented paged Agent history.

Opening a newly fired run exposed a wire mismatch: `events/inbound.go:normalizeUserMessage` accepts and persists string content verbatim, whereas reference events use block arrays. The Session schema, summaries, cards and event detail now support both forms without altering the raw response. The mock already preserved the string correctly; its deployment conformance test now checks the emitted events too.

Chrome geometry inspection found visually hidden schedule legends extending the narrow document below its viewport. Positioning the scrolling editor as their containing block reduced document height from 1,229px to the 844px viewport. A 360px/390px regression guards this and the visible floating save bar; raw JSON regions also retain keyboard scrolling.

The archived editor exposed a keyboard access failure in that scroll container: a disabled fieldset is not a tab stop, even with `tabIndex`. Scrolling now belongs to a named, focusable region outside the disabled form controls. Browser acceptance uses actual Tab/ArrowDown input before the accessibility scan.

Preparing the real Docker fixture exposed creation selectors falling back to raw IDs once option popups unmounted. Agent/version and Environment/hosting labels now resolve from loaded choices in both creation and inline editing, with IDs retained only as unavailable-resource fallbacks.

The combined macOS CI trace caught the Session inspector's width check before the responsive subscriptions ran: the viewport was 390px while the DOM still had the expanded desktop sidebar and 592px resize value. The check now waits for the collapsed sidebar and clamped inspector before measuring overflow and accessibility, at both 390px and 360px.

## Session archive — checked 2026-09-12

Records ec8c4c6 UI[301] archives directly and returns to Sessions. Frame 65's filename says "confirmation", but its contents show the returned list, not a dialog. Full-page Archive now returns to the list only after success; embedded actions retain their list/inspector context. Pending requests disable repeat activation.

Platform `sessions.go:archiveSession` requires an explicit interrupt before archiving a running Session. Its refusal remains visible without navigation or an implicit interrupt. Delete keeps confirmation because `deleteSession` removes event history and produced files; Archive preserves those records.

## Combined Docker acceptance — checked 2026-09-12

Console `7221805` against platform `c42da36` preserved Deployment drafts across tabs, restored Discard, and persisted saved configuration after reload. A manual run with synthetic file and read-only Memory bindings returned `CONSOLE_PARITY_OK`. Run success appeared before the Session became idle; its transcript and Thread reported the served 347 input / 7 output tokens. The breadcrumb restored the selected run.

The real Session expanded `/acceptance/brief.md` in place and switched between Markdown and raw content. File inspection resolved the 44-byte upload's filename, type, attachment time and IDs while explaining its unavailable content. The Memory-store editor saved with Ctrl+Enter, and reload retained the updated 185-byte content. The browser error log was empty. Four model-free API contracts also passed: Deployment lifecycle, Files paging, Memory optimistic writes/history and Session file bindings.

These checks cover one primary Thread and a manual run. They do not establish populated reference multiagent behavior, raw SSE deltas, external OAuth authorization or scheduled execution; unsupported budget, billing and catalog features remain capability boundaries. Final PR/CI and Docker revision evidence lives in [#141](https://github.com/OpenSDLC-Dev/managed-agent-console/issues/141).

The final creation-dialog walk reproduced the same selected-label loss in Session creation: closed menus showed Agent and Environment IDs. Both labels now resolve from loaded options, retaining the pinned-version display for Agent-originated creation and using IDs only when an option is unavailable. The existing resource-creation browser cases check both labels before submission.

## Populated multiagent — checked 2026-09-13

[Recordings #7](https://github.com/OpenSDLC-Dev/managed-agents-wire-recordings/issues/7) is closed with an explicit feasibility boundary: `2026-09-12-console-followups` at `ff39763` records roster chips, Raw version pins, child URL/history and parent approvals; `2026-09-12-child-lifecycle` at `de7beb0` records native Session-wide interruption with both children running. Both sealed offline verifiers passed locally.

- Follow-ups frames 004/007/011: Add subagent and removable chips, ordered by removal/reinsertion; explicit versions remain in Raw. Platform `api/roster.go` resolves omitted member versions on save. Saved pins survive unrelated edits and existing Session snapshots remain server-owned. Self is an explicit platform option; Advisor is unsupported.
- Frames 016–025: named timeline rows, a Threads table and `?inspector=thread&thread=ID`; child transcripts show Viewing/Parent thread and Spawned by navigation. Only the parent view offers Approve/Deny. Native `approvals[13,37]` omits thread IDs; platform `events.go` resolves confirmations by tool ID.
- Lifecycle `ui[146]`: child-selected Interrupt posts a bare `user.interrupt` and stops both children. `ui[215]` directly archives the Session. No native targeted-child interrupt or child-archive control was observed; scripted cleanup is not native evidence. The platform's idle-child archive remains an explicit extension inside Thread API response, outside the reference table and Session actions.
- `threads.go` rejects Session-only event ordering/filter parameters on thread history. The child list uses its ascending default. Parent and selected-child streams stay distinct; parent timeline/export and Session status retain Session scope.
- Platform `events/threadmsg.go` supplies peer IDs and full message content. Named timeline rows use explicit cross-post IDs and tool/result correlation; the parent API does not expose every child's model spans, so the Console does not fabricate those bars. Token counters and request input charts stand in for unsupported context/cost fields.

Recording follow-ups #9 and #10 remain deferred.

The real `c42da36` Docker run created Alpha and Beta as distinct child threads, each parked on its own ask-gated bash call. Its cross-posted tool calls carry `session_thread_id` without `agent_name`; transcript attribution therefore resolves the pinned thread name by ID, and tool results through their call correlation. The old child history request returned no usable trace because of its unsupported `order` parameter. Bookmarks also retain the Session fallback when the Threads capability is unavailable.

## Live previews and reconnect (#8)

[Recording provenance and raw samples](../test/fixtures/recordings-8/README.md) anchor the preview-growing/final screenshots and parent/child overlap. The offline verifier confirms 500 deltas equal the final 4,799-character message. Screenshot/DOM capture is not atomic; it establishes partial versus complete content, not animation timing.

- The preview uses the same Agent-labelled card as the final message. Thinking can be start-only; the platform exposes no thinking duration, so the console shows an activity label without fabricating the reference's “Thought for …” duration.
- Platform `internal/api/events.go:streamEvents` and `internal/events/preview.go` support both delta opt-ins, live-only tails and preallocated domain IDs. Native `event: message` and platform named frames both dispatch by payload type. No transport cursor or Anthropic-only `beta=true` is invented.
- First history paints promptly while the proxy may await initial stream bytes; a second history read after attachment covers the subscription gap. Stream bytes buffer until this catch-up completes. Previews are best-effort and cannot be repaired from a cursor, so a disconnect or the current scope's stopped-turn boundary clears them.
- Session and selected-child traces remain independent. Parent receipt of a child's idle status does not end the parent's preview. Ephemeral live termination is retained for the current view; reload history comes only from GET, including an empty archived trace.
- Native archive emitted an ephemeral `session.status_terminated` in this sample. Platform `sessions.go:archiveSessionInTx` stamps `archived_at` and ends live children without a primary termination event; its Session can remain idle. Archive rendering follows the returned Session, not an assumed terminal frame.
