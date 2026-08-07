import type { Page } from "@playwright/test";

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
    description: "The environment config union rendered as sections.",
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
      // (`sessions/new/page.tsx`: `vaults.data?.data.length > 0 &&`), and the
      // form shows no skeleton meanwhile — so without this the shot is a form
      // with a section silently missing (review finding, PR #38).
      // Scoped to main: the sidebar carries a "Credential vaults" nav link too.
      await page.getByRole("main").getByText("Credential vaults").waitFor();
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
      "ErrorState carrying the platform's message and request id. Also the surface behind the known gap in plan 04: a 404 is indistinguishable from an unimplemented capability.",
    setup: async (page) => {
      await page.getByTestId("error-state").waitFor();
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
    id: "vault-create",
    route: "/vaults",
    fixture: "empty dialog form",
    description: "The create-dialog shape shared by every resource list.",
    setup: async (page) => {
      await page.getByRole("button", { name: "Create vault" }).click();
      await page.getByRole("dialog").waitFor();
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
    description: "Destructive-confirmation dialog: the only red-button layout.",
    setup: async (page) => {
      await page.getByRole("button", { name: "Archive", exact: true }).click();
      await page.getByRole("dialog").waitFor();
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
      await page.getByText("archived").first().waitFor();
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
];
