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
const DEPLOYMENT = "depl_weeklyresearch000001";
const DEPLOYMENT_RUN = "drun_failed000000000001";
const MEMORY_STORE = "memstore_projectnotes000001";
const MEMORY = "mem_projectbrief000000001";
const MEMORY_VERSION = "memver_briefmodified000001";
const DREAM = "drm_completedresearch000001";
const PENDING_DREAM = "drm_pendingresearch0000001";
const VAULT = "vlt_github00000000000001";
const CREDENTIAL = "vcred_ghtoken000000000001";
const SKILL = "skill_reportwriter0000001";

export const SURFACES: Surface[] = [
  ...["rendered", "permissions", "custom", "api", "narrow"].map(
    (view): Surface => ({
      id: "agent-inspector-" + view,
      route: "/agents?agent=" + AGENT,
      fixture:
        "versioned coordinator with builtin tools, a skill and pinned roster",
      description:
        "Agent list side inspector with permissions and Rendered/API views.",
      setup: async (page) => {
        if (view === "custom") {
          const updated = await page.request.post(
            MOCK_URL + "/v1/agents/" + AGENT,
            {
              headers: { "x-api-key": "test-key" },
              data: {
                version: 3,
                tools: [
                  {
                    type: "agent_toolset_20260401",
                    default_config: { enabled: false },
                    configs: [
                      {
                        name: "bash",
                        enabled: true,
                        permission_policy: { type: "always_ask" },
                      },
                    ],
                  },
                ],
              },
            },
          );
          if (!updated.ok())
            throw new Error(
              "Could not configure fidelity agent: " + updated.status(),
            );
          await page.reload();
        }
        if (view === "narrow")
          await page.setViewportSize({ width: 390, height: 844 });
        const panel = page.getByRole("region", { name: "Agent details" });
        await panel.getByRole("heading", { name: "Deep researcher" }).waitFor();
        if (view === "api")
          await panel.getByRole("button", { name: "API", exact: true }).click();
        if (view === "permissions" || view === "custom" || view === "narrow")
          await panel
            .getByRole("button", { name: /^Tool permissions 8/ })
            .click();
      },
    }),
  ),
  ...["agents", "memory-stores"].map((route): Surface => ({
    id: route + "-created-range",
    route: "/" + route + "?created=2026-08-01~2026-08-02",
    fixture: "custom inclusive date range",
    description: "Created custom range input and explicit Apply/Cancel.",
    setup: async (page) => {
      await page.getByLabel("Created filter").click();
      await page.getByRole("textbox", { name: "Start", exact: true }).waitFor();
    },
  })),
  {
    id: "created-calendar-narrow",
    route: "/agents?created=2026-08-01~2026-08-02",
    fixture: "selected August range",
    description: "Inline calendar and range form at 390px.",
    setup: async (page) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.getByLabel("Created filter").click();
      await page.getByRole("button", { name: "Open End calendar" }).click();
      await page.getByRole("group", { name: "End calendar" }).waitFor();
    },
  },
  {
    id: "session-created-presets",
    route: "/sessions",
    fixture: "default",
    description:
      "Session Created presets include Today, Last hour and Last day.",
    setup: async (page) => {
      await page.getByLabel("Created filter").click();
      await page
        .getByRole("option", { name: "Last hour", exact: true })
        .waitFor();
    },
  },
  {
    id: "deployment-filter-reset",
    route: "/deployments?agent=agent_researcher00000000001&status=paused",
    fixture: "empty filtered deployments",
    description: "URL-backed filters and Reset on an empty list.",
    setup: async (page) => {
      await page.getByText("No matching deployments").waitFor();
    },
  },

  ...[false, true].map((narrow): Surface => ({
    id: "session-filters" + (narrow ? "-narrow" : ""),
    route: "/sessions",
    fixture: "active sessions and deployment options",
    description:
      "Exact session lookup, active multi-status selection and deployment filtering.",
    setup: async (page) => {
      if (narrow) await page.setViewportSize({ width: 390, height: 844 });
      await page.getByRole("combobox", { name: "Status filter" }).click();
    },
  })),

  {
    id: "dashboard-api-key-create",
    route: "/dashboard",
    fixture: "empty key dialog over the dashboard",
    description:
      "The Dashboard shortcut opens key creation without a route change.",
    setup: async (page) => {
      await page.getByRole("button", { name: "Get API key" }).click();
      await page.getByRole("dialog", { name: "Create API key" }).waitFor();
    },
  },
  {
    id: "dashboard-compact",
    route: "/dashboard",
    fixture: "all surfaces, compact navigation",
    description: "Centered dashboard with the collapsed icon rail.",
    setup: async (page) => {
      await page.getByRole("button", { name: "Collapse sidebar" }).click();
      await page.reload();
      await page.locator('[data-sidebar-state="collapsed"]').waitFor();
    },
  },
  {
    id: "dashboard-mobile",
    route: "/dashboard",
    fixture: "all surfaces, 390px viewport",
    description: "Dashboard cards and shortcuts wrap within a narrow viewport.",
    setup: async (page) => {
      await page.setViewportSize({ width: 390, height: 844 });
    },
  },
  {
    id: "dashboard-group-collapsed",
    route: "/dashboard",
    fixture: "Build group persisted closed",
    description: "Collapsed group survives a full reload.",
    setup: async (page) => {
      await page.getByRole("button", { name: "Build", exact: true }).click();
      await page.reload();
      await page
        .locator('[data-nav-group="Build"][aria-expanded="false"]')
        .waitFor();
    },
  },
  {
    id: "agents-lookup-missing",
    route: "/agents",
    fixture: "unknown exact Agent ID",
    description:
      "Missing resource errors after exact lookup preserve browser history.",
    setup: async (page) => {
      await page
        .getByRole("textbox", { name: "Find agent by ID" })
        .fill("agent_missing");
      await page.getByRole("button", { name: "Open", exact: true }).click();
      await page.getByTestId("error-state").waitFor();
    },
  },
  {
    id: "dashboard-nav-flyout",
    route: "/dashboard",
    fixture: "compact Build navigation",
    description:
      "A group flyout opens beside the rail without changing sidebar preference.",
    setup: async (page) => {
      await page.getByRole("button", { name: "Collapse sidebar" }).click();
      await page
        .getByRole("navigation")
        .getByRole("button", { name: "Build", exact: true })
        .click();
      await page.getByRole("dialog", { name: "Build", exact: true }).waitFor();
    },
  },
  // ---- the landing page ------------------------------------------------
  {
    id: "dashboard",
    route: "/dashboard",
    // The cards are links, and the only platform answer behind them is the
    // shared surface probe, so a fully-served deployment is the whole state.
    fixture: "populated",
    description:
      "Landing page: a card per served surface under the nav's own group headings, and the regrouped sidebar beside it.",
  },
  // ---- resource lists --------------------------------------------------
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
    id: "deployments-list",
    route: "/deployments",
    fixture: "2 deployments, scheduled active + manual paused",
    description:
      "Deployment status, pinned agent version and schedule summary.",
  },
  {
    id: "memory-stores-list",
    route: "/memory-stores",
    fixture: "3 memory stores, one archived",
    description: "Durable context stores with live and archived filtering.",
  },
  {
    id: "dreams-list",
    route: "/dreams",
    fixture: "2 live dreams, pending + completed",
    description:
      "Asynchronous consolidation jobs with status, inputs and output behavior.",
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
    description:
      "GA skill names, source labels, version IDs and upload action.",
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
    description:
      "Detail sections, coordinator roster, config rendering, version history table.",
  },
  {
    id: "environment-inspector",
    route: "/environments?environment=env_cloudlimited000000001",
    fixture: "cloud limited environment",
    description: "Non-modal structured environment inspector.",
  },
  {
    id: "environment-inspector-api",
    route: "/environments?environment=env_cloudlimited000000001",
    fixture: "cloud limited environment API",
    description: "Environment response in API view.",
    setup: async (page) => {
      await page
        .getByRole("region", { name: "Environment details" })
        .getByText("API", { exact: true })
        .click();
    },
  },
  {
    id: "environment-inspector-narrow",
    route: "/environments?environment=env_cloudlimited000000001",
    fixture: "cloud environment at 390px",
    description: "Narrow environment inspector.",
    setup: async (page) => {
      await page.setViewportSize({ width: 390, height: 844 });
    },
  },
  {
    id: "environment-inspector-missing",
    route: "/environments?environment=env_missing",
    fixture: "missing environment ID",
    description: "Recoverable exact-ID error in the inspector.",
  },
  {
    id: "environment-selection",
    route: "/environments",
    fixture: "selected environments",
    description: "Selected-row bulk action toolbar.",
    setup: async (page) => {
      await page.getByRole("checkbox", { name: "Select all rows" }).check();
    },
  },
  {
    id: "environment-selection-confirm",
    route: "/environments",
    fixture: "bulk delete confirmation",
    description: "Confirmation before deleting selected environments.",
    setup: async (page) => {
      await page.getByRole("checkbox", { name: "Select all rows" }).check();
      await page.getByRole("button", { name: "Delete", exact: true }).click();
    },
  },
  {
    id: "environment-cloud-detail",
    route: "/environments/env_cloudlimited000000001",
    fixture: "cloud environment",
    description: "Structured networking, packages and metadata.",
  },
  {
    id: "environment-edit-inline",
    route: "/environments/env_cloudlimited000000001",
    fixture: "cloud environment edit",
    description: "Cancel and save without leaving the environment detail.",
    setup: async (page) => {
      await page.getByRole("button", { name: "Edit", exact: true }).click();
    },
  },
  {
    id: "environment-edit-rows",
    route: "/environments/env_cloudlimited000000001",
    fixture: "cloud environment with package and metadata drafts",
    description: "Structured package manager and metadata row editing.",
    setup: async (page) => {
      await page.getByRole("button", { name: "Edit", exact: true }).click();
      await page
        .getByRole("button", { name: "Add package", exact: true })
        .click();
      await page.getByLabel("Metadata key 1").fill("Team");
      await page.getByLabel("Metadata value 1").fill("Research");
      await page.getByRole("button", { name: "Add metadata entry" }).click();
    },
  },
  {
    id: "environment-edit-narrow",
    route: "/environments/env_cloudlimited000000001",
    fixture: "cloud environment editor at 390px",
    description: "Narrow structured editor and switches.",
    setup: async (page) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.getByRole("button", { name: "Edit", exact: true }).click();
    },
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
    id: "credential-detail",
    route: `/vaults/${VAULT}/credentials/${CREDENTIAL}`,
    fixture: CREDENTIAL,
    description:
      "Secret-free credential configuration, lifecycle actions and metadata.",
  },
  {
    id: "skill-detail",
    route: `/skills/${SKILL}`,
    fixture: SKILL,
    description: "Version list with per-version actions.",
  },
  {
    id: "skill-inspector",
    route: `/skills?skill=${SKILL}`,
    fixture: SKILL,
    description:
      "Resizable skill details over the retained list, with version actions.",
  },
  {
    id: "skill-inspector-api",
    route: `/skills?skill=${SKILL}`,
    fixture: SKILL,
    description: "The actual skill response in the API view.",
    setup: async (page) => {
      await page
        .getByRole("region", { name: "Skill details" })
        .getByText("API", { exact: true })
        .click();
    },
  },
  {
    id: "skill-inspector-narrow",
    route: `/skills?skill=${SKILL}`,
    fixture: SKILL,
    description: "Skill inspector and its actions at a 390px viewport.",
    setup: async (page) => {
      await page.setViewportSize({ width: 390, height: 844 });
    },
  },
  {
    id: "skill-inspector-missing",
    route: "/skills?skill=missing-skill",
    fixture: "none",
    description:
      "An exact ID lookup failure with the list and close action still available.",
  },
  {
    id: "deployment-detail",
    route: `/deployments/${DEPLOYMENT}`,
    fixture: DEPLOYMENT,
    description:
      "Scheduled deployment details, upcoming fires, actions and mixed run history.",
  },
  {
    id: "deployment-run-error",
    route: `/deployments/${DEPLOYMENT}/runs/${DEPLOYMENT_RUN}`,
    fixture: DEPLOYMENT_RUN,
    description: "A scheduled run whose session creation failed.",
  },
  {
    id: "memory-store-detail",
    route: `/memory-stores/${MEMORY_STORE}`,
    fixture: "2 live memories, a folder rollup and 3 attributed versions",
    description:
      "Memory contents tree with no file selected; store actions and status.",
  },
  ...["rendered", "api"].map((view): Surface => ({
    id: "memory-store-inspector-" + view,
    route: "/memory-stores?store=" + MEMORY_STORE,
    fixture: "populated memory store with server prefix rollups",
    description: "Memory store side inspector, contents and API views.",
    setup: async (page) => {
      const panel = page.getByRole("region", { name: "Memory store details" });
      await panel.getByRole("heading", { name: "Project notes" }).waitFor();
      if (view === "api")
        await panel.getByRole("button", { name: "API", exact: true }).click();
      else {
        await panel
          .getByRole("treeitem", { name: "decisions", exact: true })
          .click();
        await panel
          .getByRole("treeitem", { name: /architecture.md/ })
          .waitFor();
      }
    },
  })),
  ...["rendered", "raw", "edit", "actions"].map((view): Surface => ({
    id: "memory-content-" + view,
    route: "/memory-stores/" + MEMORY_STORE + "?memory=" + MEMORY,
    fixture: MEMORY,
    description:
      "Selected memory in the contents tree: Markdown, raw bytes and inline editor.",
    setup: async (page) => {
      await page
        .getByRole("heading", { name: "Project brief", exact: true })
        .waitFor();
      if (view === "actions")
        await page
          .getByRole("button", { name: "Memory actions", exact: true })
          .click();
      if (view === "raw")
        await page.getByRole("button", { name: "Raw", exact: true }).click();
      if (view === "edit")
        await page
          .getByRole("button", { name: "Edit memory", exact: true })
          .click();
    },
  })),
  {
    id: "memory-content-image",
    route: "/memory-stores/" + MEMORY_STORE + "?memory=" + MEMORY,
    fixture: "agent-written Markdown image",
    description:
      "External images require explicit navigation instead of automatic loading.",
    setup: async (page) => {
      await page.request.post(
        MOCK_URL +
          "/v1/memory_stores/" +
          MEMORY_STORE +
          "/memories/" +
          MEMORY +
          "?view=full",
        {
          headers: { "x-api-key": "test-key" },
          data: {
            content:
              "# Image reference\n\n![diagram](https://memory-assets.example/diagram.png)",
          },
        },
      );
      await page.reload();
      await page.getByRole("link", { name: "Open image: diagram" }).waitFor();
    },
  },
  {
    id: "memory-store-advanced",
    route: "/memory-stores/" + MEMORY_STORE,
    fixture: "2 memories and 3 attributed versions",
    description: "Optional platform path queries and version history.",
    setup: async (page) => {
      await page
        .getByText("Store details and version history", { exact: true })
        .click();
    },
  },
  {
    id: "dream-detail",
    route: `/dreams/${DREAM}`,
    fixture: DREAM,
    description:
      "Completed consolidation inputs, output store, pipeline session and token usage.",
  },
  {
    id: "dream-cancel-confirm",
    route: `/dreams/${PENDING_DREAM}`,
    fixture: PENDING_DREAM,
    description: "Confirmation before canceling a pending consolidation job.",
    setup: async (page) => {
      await page.getByRole("button", { name: "Cancel dream" }).click();
      await page.getByRole("dialog", { name: "Cancel this dream?" }).waitFor();
    },
  },
  {
    id: "memory-detail",
    route: `/memory-stores/${MEMORY_STORE}/memories/${MEMORY}`,
    fixture: MEMORY,
    description:
      "Full memory content, digest and optimistic-write head version.",
  },
  {
    id: "memory-version-detail",
    route: `/memory-stores/${MEMORY_STORE}/versions/${MEMORY_VERSION}`,
    fixture: MEMORY_VERSION,
    description:
      "Attributed immutable version content with the redaction action.",
  },
  {
    id: "skill-upload",
    route: "/skills",
    fixture: "skill upload dialog",
    description: "Display name with ZIP and directory upload choices.",
    setup: async (page) => {
      await page.getByRole("button", { name: "Upload skill" }).click();
    },
  },

  {
    id: "session-edit",
    route: `/sessions/${SESSION}`,
    fixture: "existing session title and metadata",
    description: "Session title and metadata patch dialog.",
    setup: async (page) => {
      await page.getByRole("button", { name: "Edit session" }).click();
      await page.getByRole("dialog", { name: "Edit session" }).waitFor();
    },
  },
  {
    id: "session-delete",
    route: `/sessions/${GATED}`,
    fixture: GATED,
    description:
      "Deletion confirmation names session outputs and retained uploads.",
    setup: async (page) => {
      await traceLive(page);
      await page.getByRole("button", { name: "More actions" }).click();
      await page.getByRole("menuitem", { name: "Delete" }).click();
      await page
        .getByRole("dialog", { name: "Delete this session?" })
        .waitFor();
    },
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
    id: "session-outcomes",
    route: `/sessions/${SESSION}`,
    fixture: `${SESSION} with one satisfied outcome`,
    description:
      "Outcome projection card and the dedicated outcome-event trace filter.",
    setup: async (page) => {
      await traceLive(page);
      await page.getByTestId("outcome-evaluation").waitFor();
      await page.getByRole("button", { name: "Outcomes", exact: true }).click();
    },
  },
  {
    id: "session-outcome-create",
    route: `/sessions/${SESSION}`,
    fixture: `${SESSION} with a terminal outcome`,
    description:
      "Define-outcome dialog with text/file rubric choice and iteration budget.",
    setup: async (page) => {
      await page.getByTestId("outcome-evaluation").waitFor();
      await page.getByRole("button", { name: "Define outcome" }).click();
      await page.getByRole("dialog", { name: "Define outcome" }).waitFor();
    },
  },
  {
    id: "session-outcome-file-rubric",
    route: `/sessions/${SESSION}`,
    fixture: `${SESSION} with uploaded rubric suggestions`,
    description:
      "Define-outcome dialog using a file rubric with catalog-backed ID suggestions.",
    setup: async (page) => {
      await page.getByTestId("outcome-evaluation").waitFor();
      await page.getByRole("button", { name: "Define outcome" }).click();
      const dialog = page.getByRole("dialog", { name: "Define outcome" });
      await dialog.getByLabel("Rubric type").click();
      await page.getByRole("option", { name: "File" }).click();
      await dialog.locator('[data-file-options-state="ready"]').waitFor();
    },
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
    id: "session-child-thread",
    route: `/sessions/${SESSION}`,
    fixture: `${SESSION}, General task agent child thread`,
    description:
      "Thread switcher with the child selected and its thread-scoped trace attached.",
    setup: async (page) => {
      await page
        .locator('[data-thread-id="sthr_taskrunnerresearch0001"] button')
        .first()
        .click();
      await traceLive(page);
    },
  },
  {
    id: "session-pending-approval",
    route: `/sessions/${GATED}`,
    fixture: GATED,
    description:
      "Human-in-the-loop: the approval banner with Approve / Deny controls.",
    setup: async (page) => {
      await traceLive(page);
      await page.getByTestId("approval-banner").waitFor();
    },
  },
  {
    id: "session-resources",
    route: `/sessions/${GATED}`,
    fixture: `${GATED} with an attached file`,
    description:
      "Session resources: mounted-file row, its mount path, and the attach affordance.",
    setup: async (page) => {
      await traceLive(page);
      const add = await page.request.post(
        `${MOCK_URL}/v1/sessions/${GATED}/resources`,
        {
          headers: { "x-api-key": "test-key" },
          data: { type: "file", file_id: "file_notes0000000000001" },
        },
      );
      if (!add.ok()) {
        throw new Error(`Could not attach fidelity resource: ${add.status()}`);
      }
      await page.reload();
      await traceLive(page);
      await page
        .getByText("file_notes0000000000001", { exact: true })
        .waitFor();
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
  ...["session", "deployment"].flatMap((owner) =>
    [false, true].flatMap((narrow) =>
      ["menu", "memory"].map((state): Surface => ({
        id: owner + "-resource-" + state + (narrow ? "-narrow" : ""),
        route: "/" + owner + "s",
        fixture: "creation resources",
        description:
          "Resource menu and multiline memory attachment in the creation dialog.",
        setup: async (page) => {
          if (narrow) await page.setViewportSize({ width: 390, height: 844 });
          await page
            .getByRole("button", { name: "Create " + owner, exact: true })
            .click();
          await page
            .getByRole("button", { name: "Resource", exact: true })
            .click();
          if (state === "memory") {
            await page
              .getByRole("menuitem", { name: "Memory store", exact: true })
              .click();
            await page
              .getByLabel("Memory store ID")
              .fill("memstore_projectnotes000001");
            await page
              .getByLabel("Memory instructions (optional)")
              .fill("Read the project notes.\nKeep changes concise.");
            await page
              .getByLabel("Memory instructions (optional)")
              .scrollIntoViewIfNeeded();
          }
        },
      })),
    ),
  ),

  ...["memory-stores", "deployments"].map((kind): Surface => ({
    id: kind + "-filters-narrow",
    route: "/" + kind,
    fixture: "390px list controls",
    description: "Exact lookup and filters at a phone viewport.",
    setup: async (page) => {
      await page.setViewportSize({ width: 390, height: 844 });
    },
  })),
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
  {
    id: "session-new-memory-resource",
    route: "/sessions/new",
    fixture: "active memory-store suggestions",
    description: "Expanded creation-time memory-store resource fields.",
    setup: async (page) => {
      await page
        .getByRole("main")
        .getByText("Credential vaults (optional)")
        .waitFor();
      await page.getByRole("button", { name: "Resource", exact: true }).click();
      await page
        .getByRole("menuitem", { name: "Memory store", exact: true })
        .click();
      await page
        .locator(
          'datalist#active-memory-stores option[value="memstore_projectnotes000001"]',
        )
        .waitFor({ state: "attached" });
    },
  },

  ...["memory-store", "deployment"].flatMap((kind): Surface[] => [
    {
      id: kind + "-create",
      route: kind === "deployment" ? "/deployments" : "/memory-stores",
      fixture: "empty creation form",
      description: "Measured creation dialog over the resource list.",
      setup: async (page) => {
        await page
          .getByRole("button", {
            name:
              kind === "deployment"
                ? "Create deployment"
                : "Create memory store",
            exact: true,
          })
          .click();
      },
    },
    {
      id: kind + "-create-narrow",
      route: kind === "deployment" ? "/deployments" : "/memory-stores",
      fixture: "390px creation form",
      description: "Creation dialog at a phone viewport.",
      setup: async (page) => {
        await page
          .getByRole("button", {
            name:
              kind === "deployment"
                ? "Create deployment"
                : "Create memory store",
            exact: true,
          })
          .click();
        await page.setViewportSize({ width: 390, height: 844 });
      },
    },
  ]),
  ...[false, true].map((narrow): Surface => ({
    id: "deployment-timezone" + (narrow ? "-narrow" : ""),
    route: "/deployments",
    fixture: "searchable schedule timezone",
    description: "Timezone popup with filtered IANA suggestions.",
    setup: async (page) => {
      if (narrow) await page.setViewportSize({ width: 390, height: 844 });
      await page
        .getByRole("button", { name: "Create deployment", exact: true })
        .click();
      await page.getByRole("radio", { name: "Schedule", exact: true }).check();
      await page
        .getByRole("combobox", { name: "IANA timezone", exact: true })
        .click();
      await page
        .getByRole("combobox", { name: "Search timezones" })
        .fill("America/New");
    },
  })),
  ...[false, true].map((narrow): Surface => ({
    id: "deployment-schedule-clock" + (narrow ? "-narrow" : ""),
    route: "/deployments",
    fixture: "12-hour schedule clock",
    description: "Schedule time with PM selected and a raw cron summary.",
    setup: async (page) => {
      if (narrow) await page.setViewportSize({ width: 390, height: 844 });
      await page
        .getByRole("button", { name: "Create deployment", exact: true })
        .click();
      await page.getByRole("radio", { name: "Schedule", exact: true }).check();
      await page.getByRole("radio", { name: "PM", exact: true }).check();
      await page.getByLabel("At", { exact: true }).scrollIntoViewIfNeeded();
    },
  })),
  {
    id: "deployment-create-schedule",
    route: "/deployments",
    fixture: "schedule fields",
    description: "Schedule trigger inside the creation dialog.",
    setup: async (page) => {
      await page
        .getByRole("button", { name: "Create deployment", exact: true })
        .click();
      await page.getByRole("radio", { name: "Schedule", exact: true }).check();
    },
  },
  {
    id: "deployment-create-advanced",
    route: "/deployments",
    fixture: "advanced events",
    description: "Advanced event JSON without dropping platform fields.",
    setup: async (page) => {
      await page
        .getByRole("button", { name: "Create deployment", exact: true })
        .click();
      await page.getByRole("radio", { name: "Advanced events" }).check();
    },
  },
  {
    id: "deployment-new",
    route: "/deployments/new",
    fixture: "empty form over agent, environment and vault lists",
    description:
      "Pinned agent, initial event JSON, schedule and reusable-resource controls.",
    setup: async (page) => {
      await page.getByText("Credential vaults (optional)").waitFor();
    },
  },
  {
    id: "dream-new",
    route: "/dreams/new",
    fixture: "active memory-store suggestions",
    description:
      "Memory and session inputs, model speed, instructions and output behavior.",
    setup: async (page) => {
      await page
        .locator(
          'datalist#dream-memory-stores option[value="memstore_projectnotes000001"]',
        )
        .waitFor({ state: "attached" });
    },
  },
  {
    id: "deployment-new-memory-resource",
    route: "/deployments/new",
    fixture: "active memory-store suggestions",
    description: "Expanded reusable memory-store resource fields.",
    setup: async (page) => {
      await page.getByText("Credential vaults (optional)").waitFor();
      await page.getByRole("button", { name: "Resource", exact: true }).click();
      await page
        .getByRole("menuitem", { name: "Memory store", exact: true })
        .click();
      await page
        .locator(
          'datalist#active-memory-stores option[value="memstore_projectnotes000001"]',
        )
        .waitFor({ state: "attached" });
    },
  },
  {
    id: "memory-store-new",
    route: "/memory-stores/new",
    fixture: "empty store form",
    description: "Store identity, description and metadata JSON editor.",
  },
  {
    id: "memory-store-edit",
    route: `/memory-stores/${MEMORY_STORE}/edit`,
    fixture: MEMORY_STORE,
    description: "Existing store metadata with patch-delete semantics.",
  },
  {
    id: "vault-edit",
    route: `/vaults/${VAULT}/edit`,
    fixture: VAULT,
    description: "Vault display-name and metadata editor.",
  },
  {
    id: "credential-edit",
    route: `/vaults/${VAULT}/credentials/${CREDENTIAL}/edit`,
    fixture: CREDENTIAL,
    description:
      "Credential metadata, policy and write-only secret replacement form.",
  },
  {
    id: "memory-new",
    route: `/memory-stores/${MEMORY_STORE}/memories/new`,
    fixture: "empty memory form",
    description: "Absolute path and durable text content editor.",
  },
  {
    id: "memory-edit",
    route: `/memory-stores/${MEMORY_STORE}/memories/${MEMORY}/edit`,
    fixture: MEMORY,
    description: "Full memory edit backed by the current SHA-256 precondition.",
  },
  {
    id: "deployment-edit",
    route: `/deployments/${DEPLOYMENT}/edit`,
    fixture: DEPLOYMENT,
    description:
      "Populated deployment form that preserves write-only resource credentials.",
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
    id: "session-composer-focus",
    route: `/sessions/${SESSION}`,
    fixture: `${SESSION}, focused composer with a draft`,
    description: "Keyboard focus ring around the session message composer.",
    setup: async (page) => {
      await traceLive(page);
      await page
        .getByRole("textbox", { name: "Message to the session" })
        .fill("Draft follow-up");
    },
  },
  {
    id: "deployment-filter-focus",
    route: "/deployments",
    fixture: "populated deployment list with its status filter open",
    description: "Keyboard focus ring inside a select popup.",
    setup: async (page) => {
      await page.getByText("Weekly research digest").waitFor();
      await page.getByRole("combobox", { name: "Deployment status" }).focus();
      await page.keyboard.press("ArrowDown");
      await page.getByRole("option", { name: "All live" }).waitFor();
    },
  },
  {
    id: "deployment-actions-focus",
    route: "/deployments",
    fixture: "populated deployment list with a row action menu open",
    description: "Keyboard focus ring inside a row action menu.",
    setup: async (page) => {
      await page.getByText("Weekly research digest").waitFor();
      await page.getByRole("button", { name: "More actions" }).first().focus();
      await page.keyboard.press("Enter");
      await page.keyboard.press("ArrowDown");
      await page.getByRole("menuitem", { name: "Archive" }).waitFor();
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
    id: "vault-first-credential",
    route: "/vaults",
    fixture: "newly created vault awaiting its first credential",
    description:
      "Continue commits the vault and opens the optional credential step with Skip for now.",
    setup: async (page) => {
      await page.getByRole("button", { name: "Create vault" }).click();
      await page
        .getByLabel("Name", { exact: true })
        .fill("Production credentials");
      await page.getByRole("button", { name: "Continue" }).click();
      await page.getByRole("dialog", { name: "Add a credential" }).waitFor();
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
  ...[false, true].map((narrow): Surface => ({
    id: "agent-unsaved" + (narrow ? "-narrow" : ""),
    route: "/agents",
    fixture: "edited agent draft awaiting leave confirmation",
    description: "Stay and Leave protect unsaved agent configuration.",
    setup: async (page) => {
      if (narrow) await page.setViewportSize({ width: 390, height: 844 });
      await page
        .getByRole("button", { name: "Create agent", exact: true })
        .click();
      await page
        .getByLabel("Name", { exact: true })
        .fill("Unsaved agent draft");
      await page.getByRole("button", { name: "Close", exact: true }).click();
      await page
        .getByRole("dialog", { name: "Unsaved changes", exact: true })
        .waitFor();
    },
  })),
  ...[false, true].map((narrow): Surface => ({
    id: narrow ? "agent-tools-narrow" : "agent-tools",
    route: "/agents",
    fixture: "unsaved custom tool, MCP permissions and selected skill",
    description:
      "Structured tool definitions and MCP configuration with progressive skill selection.",
    setup: async (page) => {
      if (narrow) await page.setViewportSize({ width: 390, height: 844 });
      await page.getByRole("button", { name: "Create agent" }).first().click();
      await page.getByRole("dialog", { name: "Create agent" }).waitFor();
      await page.getByRole("button", { name: "Add custom tool" }).click();
      const tool = page.locator('[data-tool-type="custom"]');
      await tool.getByText("Definition", { exact: true }).click();
      await tool.getByLabel("Name", { exact: true }).fill("lookup_order");
      await tool
        .getByLabel("Description", { exact: true })
        .fill("Look up an order by its identifier.");
      await page.getByRole("button", { name: "Add MCP server" }).click();
      await page.getByLabel("Server name").fill("support");
      await page
        .getByLabel("Server URL")
        .fill("https://tools.example.test/mcp");
      await page
        .locator('[data-tool-type="mcp"]')
        .getByText("Tool permissions", { exact: true })
        .click();
      await page
        .getByRole("combobox", { name: "Add skill", exact: true })
        .click();
      await page.getByRole("option", { name: /Excel spreadsheets/ }).click();
      await tool.scrollIntoViewIfNeeded();
    },
  })),
  ...[false, true].map((narrow): Surface => ({
    id: narrow ? "agent-schema-narrow" : "agent-schema",
    route: "/agents",
    fixture: "focused custom-tool JSON draft",
    description: "Schema keyboard help and focus ring in the create dialog.",
    setup: async (page) => {
      if (narrow) await page.setViewportSize({ width: 390, height: 844 });
      await page
        .getByRole("button", { name: "Create agent", exact: true })
        .click();
      await page.getByRole("button", { name: "Add custom tool" }).click();
      const tool = page.locator('[data-tool-type="custom"]');
      await tool.getByText("Definition", { exact: true }).click();
      await tool.getByLabel("Input schema").focus();
      await tool.getByLabel("Input schema").scrollIntoViewIfNeeded();
    },
  })),
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
      "The write-only-secret form with type-specific policy fields; saved secrets must never round-trip a value.",
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
    id: "approval-options",
    route: "/sessions/" + GATED,
    fixture: GATED,
    description:
      "Optional denial reason is offered in a secondary menu; Approve and Deny remain direct actions.",
    setup: async (page) => {
      await traceLive(page);
      await page.getByTestId("approval-banner").waitFor();
      await page.getByRole("button", { name: "Approval options" }).click();
      await page.getByRole("menuitem", { name: "Deny with reason…" }).waitFor();
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
      await page
        .getByRole("button", { name: "Approval options" })
        .first()
        .click();
      await page.getByRole("menuitem", { name: "Deny with reason…" }).click();
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
