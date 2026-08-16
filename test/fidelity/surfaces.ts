import type { Page } from "@playwright/test";
import { type ConsoleMode, MOCK_URL } from "./consoles";

/**
 * The enumerated surface list the Chrome fidelity pass walks (plan 04 slice 4).
 *
 * CLAUDE.md requires a Chrome comparison against the Claude Console reference
 * before a UI slice is done. Until now that pass covered whatever was navigated
 * to that day, so "fidelity verified" reported effort rather than coverage.
 * This file is the coverage denominator: every visually distinct state the
 * console can render, named, so a PR can say which of them it re-shot.
 *
 * It is a plain array walked by `test/fidelity/shots.spec.ts`, deliberately
 * not a `/verify` route (plan 04 decision 6): the console is a credentialed
 * operator surface shipped as a standalone image, and a route that enumerates
 * internal state is a liability there.
 *
 * Not a test. Nothing here asserts — appearance is judged by a human against
 * the reference, and `docs/design-reference.md` holds the facts to judge by.
 */

export type Surface = {
  /** Stable slug; becomes the screenshot filename. Never reuse across states. */
  id: string;
  /**
   * Which console configuration this is shot against — one `next start` per
   * value (`./consoles.ts`). Absent means the password-gated deployment the
   * design reference was compared to, which is all but two surfaces: identity
   * changes nothing on a page except the sidebar's account block, so a surface
   * names a mode only when that block, or the login page's own offer, is the
   * point. A mode costs a process, so a new one needs a surface that earns it.
   */
  mode?: ConsoleMode;
  /** Where the shot starts. Some states need `setup` to finish arriving. */
  route: string;
  /**
   * The mock-platform data behind it — a fixture id, or a word for the shape
   * of the response (`populated`, `none` for a 404). Says why the surface
   * looks the way it does, so a changed fixture explains a changed shot.
   */
  fixture: string;
  /** What this surface shows that no other entry does. */
  description: string;
  /**
   * Steps for states the URL cannot address. List filters are React state,
   * not URL state, so an empty list is only reachable the way an operator
   * reaches it — by driving the filter.
   */
  setup?: (page: Page) => Promise<void>;
};

/**
 * A trace surface is only worth shooting once its stream is attached —
 * otherwise the badge reads "connecting…" and the log is a skeleton. Reads the
 * `data-state` attribute slice 3 put on the badge rather than its label.
 */
const traceLive = (page: Page) =>
  page.locator('[data-testid="stream-state"][data-state="live"]').waitFor();

/** Fixture ids from `test/mock-platform/fixtures.mjs`, named once. */
const AGENT = "agent_researcher00000000001";
const ENV = "env_byoc0000000000000001";
const SESSION = "sesn_research0000000000001";
const GATED = "sesn_gatedbash00000000001";
const VAULT = "vlt_github00000000000001";
const SKILL = "skill_reportwriter0000001";

export const SURFACES: Surface[] = [
  // ---- the six resource lists ------------------------------------------
  {
    id: "agents-list",
    route: "/agents",
    fixture: "3 agents, one archived",
    description: "Resource list: table, Created/Status filters, create button.",
  },
  {
    id: "environments-list",
    route: "/environments",
    fixture: "2 environments",
    description: "Resource list without the Created filter.",
  },
  {
    id: "sessions-list",
    route: "/sessions",
    fixture: "2 sessions, idle + running",
    description:
      "The widest table — status badges, token counts, relative times.",
  },
  {
    id: "vaults-list",
    route: "/vaults",
    fixture: "2 vaults, one archived",
    description: "Resource list with the archived-scoping filter.",
  },
  {
    id: "skills-list",
    route: "/skills",
    fixture: "1 skill",
    description: "Resource list with a version column and an upload action.",
  },
  {
    id: "files-list",
    route: "/files",
    fixture: "2 files",
    description: "Resource list with byte sizes and an upload action.",
  },

  // ---- detail pages ----------------------------------------------------
  {
    id: "agent-detail",
    route: `/agents/${AGENT}`,
    fixture: AGENT,
    description: "Detail sections, config rendering, version history table.",
  },
  {
    id: "environment-detail",
    route: `/environments/${ENV}`,
    fixture: ENV,
    description:
      "The environment config union rendered as sections, plus the " +
      "environment-key table — this fixture is the self-hosted arm, the only " +
      "one that shows keys at all.",
  },
  {
    id: "vault-detail",
    route: `/vaults/${VAULT}`,
    fixture: VAULT,
    description: "Credential rows — the surface that must never show a secret.",
  },
  {
    id: "skill-detail",
    route: `/skills/${SKILL}`,
    fixture: SKILL,
    description: "Version list with per-version actions.",
  },

  // ---- the session trace, this console's densest surface ----------------
  {
    id: "session-transcript",
    route: `/sessions/${SESSION}`,
    fixture: SESSION,
    description:
      "Transcript: chips, type badges, one-line summaries, idle bands, offsets.",
    setup: traceLive,
  },
  {
    id: "session-detail-panel",
    route: `/sessions/${SESSION}`,
    fixture: SESSION,
    description:
      "Master-detail split with the event panel open beside the log.",
    setup: async (page) => {
      await traceLive(page);
      await page.getByTestId("event-row").first().click();
      await page.getByTestId("event-detail").waitFor();
    },
  },
  {
    id: "session-debug",
    route: `/sessions/${SESSION}`,
    fixture: SESSION,
    description: "Debug tab: every event verbatim as JSON, filters gone.",
    setup: async (page) => {
      await traceLive(page);
      await page.getByRole("button", { name: "Debug" }).click();
      await page.getByTestId("debug-row").first().waitFor();
    },
  },
  {
    id: "session-pending-approval",
    route: `/sessions/${GATED}`,
    fixture: GATED,
    description:
      "Human-in-the-loop: the approval banner with Allow / Deny controls.",
    setup: async (page) => {
      await traceLive(page);
      await page.getByTestId("approval-banner").waitFor();
    },
  },

  // ---- create / edit forms ---------------------------------------------
  {
    id: "agent-new",
    route: "/agents/new",
    fixture: "empty form",
    description: "The agent editor: the console's largest form.",
  },
  {
    id: "agent-edit",
    route: `/agents/${AGENT}/edit`,
    fixture: AGENT,
    description: "The same editor populated, with the curl block.",
  },
  {
    id: "environment-new",
    route: "/environments/new",
    fixture: "empty form",
    description: "Config-type union picker driving conditional fields.",
  },
  {
    id: "environment-edit",
    route: `/environments/${ENV}/edit`,
    fixture: ENV,
    description: "Populated environment form.",
  },
  {
    id: "session-new",
    route: "/sessions/new",
    fixture: "empty form over the agent, environment and vault lists",
    description: "Agent/environment pickers plus the file-mount control.",
    setup: async (page) => {
      // The vault section renders only once its query resolves
      // (`session-create-form.tsx`: `vaultList.length > 0 &&`), and the
      // form shows no skeleton meanwhile — so without this the shot is a form
      // with a section silently missing (review finding, PR #38).
      // The label in full, not a prefix of it. Scoping to main already ruled
      // out the sidebar's nav link, but #108 put a "Manage credential vaults"
      // link inside the section itself, and a substring match has resolved to
      // two elements — failing this shot in both themes — ever since.
      await page
        .getByRole("main")
        .getByText("Credential vaults (optional)")
        .waitFor();
    },
  },

  // ---- the shared states every surface can fall into --------------------
  // EmptyState and ErrorState are single shared components, so they are shot
  // where they are reachable rather than once per list: six shots of one
  // component is one surface, not six. Reached through the UI — the mock
  // stays a faithful platform double with no scenario switch.
  {
    id: "list-empty",
    route: "/agents",
    fixture: "populated, filtered to nothing",
    description:
      "EmptyState on a list. Fixtures are dated 2026-08-01, so the 24-hour preset always empties it.",
    setup: async (page) => {
      await page.getByLabel("Created filter").click();
      await page.getByRole("option", { name: "Last 24 hours" }).click();
      await page.getByTestId("empty-state").waitFor();
    },
  },
  {
    id: "trace-empty",
    route: `/sessions/${SESSION}`,
    fixture: `${SESSION}, filtered to a type it has none of`,
    description: "EmptyState inside a populated page, not a bare list.",
    setup: async (page) => {
      await traceLive(page);
      await page.getByRole("button", { name: "Model spans" }).click();
      await page.getByTestId("empty-state").waitFor();
    },
  },
  {
    id: "detail-error",
    route: "/agents/agent_doesnotexist0000001",
    fixture: "none — a real platform 404",
    description:
      "ErrorState carrying the platform's message and request id. An item route's 404 stays an error; `surface-unavailable` is its twin for the same status on a collection route.",
    setup: async (page) => {
      await page.getByTestId("error-state").waitFor();
    },
  },
  {
    id: "role-denied",
    route: "/skills",
    fixture: "a platform that refuses this role — the mock's own 403",
    description:
      "ErrorState's denied variant (plan 08 slice 4): the platform's message quoted verbatim, naming the role the route requires rather than the one the operator holds, over a nav item that deliberately stays put. The third of the three refusal layouts — `detail-error` is a 404 on an item, `surface-unavailable` a surface the deployment lacks, this one a surface the operator may not read.",
    setup: async (page) => {
      await page.request.post(`${MOCK_URL}/__forbid`, {
        data: { paths: ["v1/skills"] },
      });
      await page.reload();
      await page.getByTestId("error-state").waitFor();
    },
  },
  {
    id: "surface-unavailable",
    route: "/skills",
    fixture: "a deployment that does not serve /v1/skills",
    description:
      "UnavailableSurface: the calm twin of ErrorState for a surface this deployment does not implement, shot beside a sidebar the Skills item has left.",
    setup: async (page) => {
      // Same 404 the platform's router catch-all answers with; `__reset`
      // before the next shot puts the mock back (issue #33).
      await page.request.post(`${MOCK_URL}/__unimplemented`, {
        data: { surfaces: ["skills"] },
      });
      await page.reload();
      await page.getByTestId("unavailable-surface").waitFor();
    },
  },

  // ---- surfaces with no route of their own ------------------------------
  // Overlays and filter states. The route-derived coverage test cannot see
  // these — they add no `page.tsx` — so leaving them out would let the pass
  // report complete coverage while a broken dialog went unlooked-at (review
  // finding, PR #38). One representative per distinct layout, not one per
  // instance: the four resource dialogs share a shell, so `vault-create`
  // stands for its shape and `credential-add` earns its own entry only
  // because it is the write-only-secret form.
  {
    id: "command-palette",
    route: "/agents",
    fixture: "all resources, searched",
    description:
      "Ctrl+K overlay: grouped options over the whole resource space.",
    setup: async (page) => {
      await page.keyboard.press("Control+k");
      await page
        .getByPlaceholder("Search agents, sessions, environments…")
        .fill("deep resea");
      await page.getByRole("option", { name: /Deep researcher/ }).waitFor();
    },
  },
  {
    id: "api-keys",
    route: "/api-keys",
    fixture: "2 keys, one control-plane managed",
    description:
      "The management-key listing: a two-line Key cell, and the one row whose controls are absent because the platform refuses to mutate it.",
    setup: async (page) => {
      await page.getByText("ci-deploy").waitFor();
    },
  },
  {
    id: "api-key-create",
    route: "/api-keys",
    fixture: "empty dialog form",
    description:
      "The create dialog with its expiry select — a read-only workspace row and the only Never option in the console.",
    setup: async (page) => {
      await page.getByRole("button", { name: "Create key" }).click();
      await page.getByRole("dialog").waitFor();
    },
  },
  {
    id: "vault-create",
    route: "/vaults",
    fixture: "empty dialog form",
    description: "The short create-dialog shape (name + confirm).",
    setup: async (page) => {
      await page.getByRole("button", { name: "Create vault" }).click();
      await page.getByRole("dialog").waitFor();
    },
  },
  {
    id: "agent-create",
    route: "/agents",
    fixture: "empty dialog form",
    description:
      "Create agent as a list modal: templates plus the full editor.",
    setup: async (page) => {
      await page.getByRole("button", { name: "Create agent" }).first().click();
      await page.getByRole("dialog", { name: "Create agent" }).waitFor();
    },
  },
  {
    id: "environment-create",
    route: "/environments",
    fixture: "empty stub dialog",
    description:
      "Create environment as a name + hosting stub; the full editor is the detail edit page.",
    setup: async (page) => {
      await page
        .getByRole("button", { name: "Create environment" })
        .first()
        .click();
      await page.getByRole("dialog", { name: "Create environment" }).waitFor();
    },
  },
  {
    id: "session-create",
    route: "/sessions",
    fixture: "empty dialog form over the agent, environment and vault lists",
    description:
      "Create session as a list modal: Manage … links and vault multi-select.",
    setup: async (page) => {
      await page
        .getByRole("button", { name: "Create session" })
        .first()
        .click();
      await page.getByRole("dialog", { name: "Create session" }).waitFor();
      await page.getByRole("dialog").getByText("Manage agents").waitFor();
    },
  },
  {
    id: "credential-add",
    route: `/vaults/${VAULT}`,
    fixture: VAULT,
    description:
      "The write-only-secret form — the one dialog whose fields must never round-trip a value.",
    setup: async (page) => {
      await page
        .getByRole("button", { name: "Add credential" })
        .first()
        .click();
      await page.getByRole("dialog").waitFor();
    },
  },
  {
    id: "archive-confirm",
    route: `/vaults/${VAULT}`,
    fixture: VAULT,
    description:
      "Destructive-confirmation dialog — the shared footer every ConfirmButton and ConfirmIconButton ends in, and the console's hardest contrast target: the footer is `bg-muted/50`, a lighter backdrop than the popover (issue #90). Behind it, the Delete trigger carries the same colour as bare text.",
    setup: async (page) => {
      await page
        .getByRole("main")
        .getByRole("button", { name: "More actions" })
        .click();
      await page.getByRole("menuitem", { name: "Archive" }).click();
      await page.getByRole("dialog").waitFor();
    },
  },
  {
    id: "approval-deny",
    route: `/sessions/${GATED}`,
    fixture: GATED,
    description:
      "The second destructive-button layout, and the only one outside a dialog: Deny sits on the amber warning box rather than a console surface, so its wash composites over a Tailwind colour the palette test cannot model (issue #90).",
    setup: async (page) => {
      await traceLive(page);
      await page.getByTestId("approval-banner").waitFor();
      await page.getByRole("button", { name: "Deny…" }).first().click();
      await page.getByRole("button", { name: "Deny", exact: true }).waitFor();
    },
  },
  {
    id: "list-archived",
    route: "/vaults",
    fixture: "2 vaults, one archived",
    description:
      "A list including archived rows and their badge — the Status filter's other position.",
    setup: async (page) => {
      await page.getByLabel("Status filter").click();
      await page.getByRole("option", { name: "All" }).click();
      await page.getByText("Archived").first().waitFor();
    },
  },

  // ---- the one route outside the console shell --------------------------
  {
    id: "login",
    route: "/login",
    fixture: "n/a",
    description:
      "The deployment gate — the only surface with no sidebar or header.",
  },
  {
    id: "login-invalid",
    route: "/login",
    fixture: "n/a",
    description:
      "The gate after a rejected password: the console's only invalid field that needs no fixture or signed-in state to reach, and so the surface that shows what `aria-invalid` draws — one opaque danger border and no halo (issue #104). Until this entry the manifest could not shoot an invalid control at all, which is why #104's alphas had no observable before or after.",
    setup: async (page) => {
      await page.getByLabel("Password").fill("not-the-password");
      await page.getByRole("button", { name: "Sign in" }).click();
      // The border and the sentence appear together; wait on the sentence.
      await page.getByText("Wrong password.").waitFor();
    },
  },

  // ---- what only a deployment with identity renders (#99) ----------------
  // Shot against a second console because the configuration *is* the surface:
  // which gate the login page offers, and whether the sidebar has an account
  // block, come from environment variables read at request time, so one process
  // renders exactly one of them. Until this pair existed the pass walked past
  // both and still reported complete coverage.
  {
    id: "login-sso",
    mode: "sso",
    route: "/login",
    fixture: "n/a",
    description:
      "The gate on a deployment that runs SSO: one primary control, no password field, and the organization-account line in place of the password one. A page with no reference counterpart, so what it is compared against is docs/design-reference.md's own account of it.",
  },
  {
    id: "account-block",
    mode: "sso",
    route: "/agents",
    fixture:
      "3 agents, one archived — the list is the backdrop, not the subject",
    description:
      "The sidebar's signed-in account block: a 14px/500 name over a 12px muted email over Sign out. Renders only where identity is configured, so no other surface shows it at all — and the only surface that shows the footer group with two blocks in it, under the one rule they share (#107). It names no role and no organization, and that is the divergence.",
  },
];
