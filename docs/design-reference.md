# Design reference — Claude Console fidelity base

The console's visual style tracks Anthropic's Claude Console (standing decision, 2026-08-02; see CLAUDE.md). This file records the design facts extracted from the live reference so UI work has a stable base, and so drift is detectable. Re-extract when the reference visibly changes; note the date.

## Extracted 2026-08-02 from platform.claude.com (light theme, Managed Agents → Agents)

Method: `getComputedStyle` on live elements in Chrome.

| Element                                       | Facts                                                                                                                  |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Page background                               | `#FCFCFB`                                                                                                              |
| Sidebar                                       | width `256px`, background `#F9F9F7`, no visible border                                                                 |
| Body text                                     | `anthropicSans` → fallback `system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`; `14px/21px`, color `#0B0B0B` |
| Secondary text (page subtitle, table headers) | `#52514E`                                                                                                              |
| Hairline borders                              | `rgba(11,11,11,0.1)`                                                                                                   |
| Page title                                    | `22px`, weight `500`, line-height `28px`, `#0B0B0B`                                                                    |
| Page subtitle                                 | `14px/20px`, `#52514E`                                                                                                 |
| Primary button ("Create agent")               | height `32px`, radius `8px`, padding-x `12px`, `14px`/500, white text on near-black fill                               |
| Filter/secondary buttons                      | height `32px`, radius `8px`                                                                                            |
| Table header cell                             | `13px`, weight `500`, `#52514E`, row height `32px`, no text-transform                                                  |
| Inputs (search)                               | height `32px`, `14px`                                                                                                  |
| Nav items                                     | `14px`, active item gets a subtle darker pill on the sidebar background                                                |

## Deliberate divergences

- **Font:** `anthropicSans` is Anthropic's proprietary face and cannot be shipped. We use its own fallback stack (`system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`) as our primary stack.
- **Branding:** the wordmark is our own ("Managed Agents" / project name), never "Claude Console" or Anthropic marks.
- Navigation contains only the sections the platform serves (no Billing/API keys/Workbench), plus console-specific connection status.

## Fidelity verification

Per CLAUDE.md: after building UI, load the local console in Chrome next to the reference, screenshot both, compare (layout, spacing, type scale, color), and note the outcome in the PR. The reference screenshots from the 2026-08-02 survey live in the session notes; re-capture as needed.
