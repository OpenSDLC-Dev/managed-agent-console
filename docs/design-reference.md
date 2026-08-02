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

## Dark palette — extracted 2026-08-02 from the reference's stylesheet tokens

Method: enumerated the CSS custom-property blocks in platform.claude.com's stylesheets. Two findings:

- The reference's own **console theme pins dark mode to the light palette** (`[data-theme="console"], [data-theme="console"][data-mode="dark"]` share one block) — the reference console ships light-only today.
- Its sibling **claude theme carries real dark tokens** (`[data-theme="claude"][data-mode="dark"]`). Our dark mode uses those, mapped onto the same roles as the light palette:

| Token (reference)   | Value                                   | Our role                     |
| ------------------- | --------------------------------------- | ---------------------------- |
| `bg-100`            | `hsl(60 2.7% 14.5%)` (#262624)          | page background              |
| `bg-000`            | `hsl(60 2.1% 18.4%)` (#30302e)          | cards, popovers              |
| `bg-200`            | `hsl(30 3.3% 11.8%)` (#1f1e1d)          | sidebar                      |
| `text-100`          | `hsl(48 33.3% 97.1%)` (#faf9f5)         | foreground                   |
| `text-300`          | `hsl(50 9% 73.7%)` (#c2c0b6)            | muted foreground             |
| `pictogram-200`     | `hsl(60 2.5% 23.3%)` (#3c3c39)          | secondary/muted/accent fills |
| `border-200`        | `hsl(51 16.5% 84.5%)` at 0.12–0.4 alpha | borders, inputs, rings       |
| `danger-100` (dark) | `hsl(0 67% 59.6%)`                      | destructive                  |

Shipping a real dark mode is therefore a **deliberate divergence** from the reference console, built entirely from the reference design system's own dark tokens.

## Deliberate divergences

- **Font:** `anthropicSans` is Anthropic's proprietary face and cannot be shipped. We use its own fallback stack (`system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`) as our primary stack.
- **Branding:** the wordmark is our own ("Managed Agents" / project name), never "Claude Console" or Anthropic marks.
- Navigation contains only the sections the platform serves (no Billing/API keys/Workbench), plus console-specific connection status.

## Fidelity verification

Per CLAUDE.md: after building UI, load the local console in Chrome next to the reference, screenshot both, compare (layout, spacing, type scale, color), and note the outcome in the PR. The reference screenshots from the 2026-08-02 survey live in the session notes; re-capture as needed.
