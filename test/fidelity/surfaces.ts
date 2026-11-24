import { browserPost } from "../e2e/browser-write";
import {
  dashboardModelCases,
  grantDashboardModelDiscovery,
} from "../e2e/dashboard-fixture";
import {
  DIRECT_REQUEST,
  messagesLedger,
  serveMessagesLedger,
} from "../e2e/messages-fixture";
import type { ApiKeyListItem } from "../../src/lib/platform/types";
import { openApiKeyForm, openApiKeyMenu } from "../api-key-flow";
import {
  clientCalls,
  hostedResults,
  serveToolReply,
  disablePlaygroundStreaming,
  toolTemplates,
} from "../e2e/playground-tools-fixture";
import { NATIVE_SURFACES } from "./native-surfaces";
import type { Page } from "@playwright/test";
import { type ConsoleMode, MOCK_URL } from "./consoles";

/**
 * The enumerated surface list the Chrome fidelity pass walks (plan 04 slice 4).
 *
 * harness/rules/ui-evidence.md requires a Chrome comparison against the Claude Console reference
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
  /** Native mock login offer, or the real-platform integration walker. */
  mode?: ConsoleMode;
  /** Where the shot starts. Some states need `setup` to finish arriving. */
  route: string;
  /** Capture the visible viewport for an overlay on a taller page. */
  viewportOnly?: boolean;
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
const DEPLOYMENT = "depl_weekresearch00000001";
const DEPLOYMENT_RUN = "drun_crashed00000000001";
const MEMORY_STORE = "memstore_projectnotes000001";
const MEMORY = "mem_projectbrief000000001";
const MEMORY_VERSION = "memver_briefmodified000001";
const DREAM = "drm_endedresearch0000000001";
const PENDING_DREAM = "drm_pendingresearch0000001";
const VAULT = "vlt_github00000000000001";
const CREDENTIAL = "vcred_ghtoken000000000001";
const SKILL = "skill_reportwriter0000001";
/** Model gateway ids from `test/mock-platform/gateway.mjs`. */
const PROVIDER = "gwprov_deepseek01";
const PLAIN_HTTP_PROVIDER = "gwprov_vllmlocal1";

async function populatedDashboard(
  page: Page,
  viewport = { width: 1800, height: 960 },
) {
  // Keep the fixed dialogs and header in one desktop screenshot.
  await page.setViewportSize(viewport);
  await grantDashboardModelDiscovery(page);
  await page.reload();
  await page
    .getByRole("link", { name: "Open playground", exact: true })
    .waitFor();
  await page.locator('[data-dashboard-metric="tokens"] [data-value]').waitFor();
}

async function openMessages(
  page: Page,
  route: string,
  rows = messagesLedger(),
) {
  await grantDashboardModelDiscovery(page);
  await serveMessagesLedger(page, rows);
  await page.goto(new URL(route, page.url()).href);
}

async function openDashboardModelDialog(
  page: Page,
  { name, alias, upstream }: (typeof dashboardModelCases)[number],
  options: {
    viewport?: { width: number; height: number };
    selectAlias?: boolean;
  } = {},
) {
  await populatedDashboard(page, options.viewport);
  await page
    .getByRole("region", { name: "Models", exact: true })
    .getByRole("link", { name, exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name, exact: true });
  await dialog
    .getByRole("button", { name: `Copy model ID ${upstream}`, exact: true })
    .waitFor();
  if (alias) {
    const picker = dialog.getByRole("combobox", {
      name: "Gateway alias",
      exact: true,
    });
    await picker.waitFor();
    if (options.selectAlias) {
      await picker.selectOption(alias);
      await dialog
        .getByRole("link", { name: "Try in playground", exact: true })
        .waitFor();
    }
  } else {
    await dialog
      .getByRole("link", { name: "View providers", exact: true })
      .waitFor();
  }
  return dialog;
}

async function settledDashboardModel(
  page: Page,
  { name, alias }: (typeof dashboardModelCases)[number],
) {
  if (alias) {
    await grantDashboardModelDiscovery(page);
    await page.reload();
  }
  await page.getByRole("heading", { name, level: 1, exact: true }).waitFor();
  await page
    .getByRole("region", { name: "Current deployment" })
    .getByRole("link", {
      name: alias ? `Open in Playground for ${alias}` : "View providers",
      exact: true,
    })
    .waitFor();
}

export const SURFACES: Surface[] = [
  {
    id: "agents-workspace-overview",
    route: "/agents/overview",
    fixture: "workspace report",
    setup: async (page) => {
      await page.getByRole("region", { name: "Agents activity" }).waitFor();
    },
    description:
      "Workspace selector, 30-day metrics, charts and ranked agents.",
  },
  {
    id: "agents-quickstart",
    route: "/agents/create",
    fixture: "starter catalog",
    description: "Description composer and twelve template cards.",
  },
  {
    id: "agents-quickstart-preview",
    route: "/agents/create?template=data-analyst",
    fixture: "Data analyst",
    description:
      "Template preview, MCP servers, source formats and confirmation.",
  },
  {
    id: "agents-quickstart-draft",
    route: "/agents/create?template=structured-extractor&step=draft",
    fixture: "Structured extractor",
    description:
      "Editable agent configuration before the first resource write.",
  },
  {
    id: "agents-quickstart-created",
    route: "/agents/create?agent=" + AGENT,
    fixture: AGENT,
    description: "Saved agent, environment selection and progress steps.",
    setup: async (page) => {
      await page.getByRole("heading", { name: "Agent created" }).waitFor();
    },
  },
  {
    id: "agents-detail-observability",
    route: "/agents/" + AGENT + "?tab=observability",
    fixture: AGENT,
    description: "Agent-scoped activity, charts and filtered sessions link.",
    setup: async (page) => {
      await page.getByRole("link", { name: "View sessions" }).waitFor();
    },
  },

  ...NATIVE_SURFACES,
  ...["thinking", "growing", "final", "reconnecting", "narrow"].map(
    (view): Surface => ({
      id: "session-streaming-" + view,
      route: "/sessions/" + GATED,
      fixture: "recordings #8 preview-00 raw SSE",
      description:
        "Start-only thinking, partial response, final replacement and dropped stream; same Agent card shell.",
      setup: async (page) => {
        const step = async (name: string) => {
          if (
            !(
              await page.request.post(MOCK_URL + "/__live-preview?step=" + name)
            ).ok()
          )
            throw new Error("Cannot stage live preview");
        };
        await step("setup");
        await page.reload();
        await traceLive(page);
        if (view === "narrow") {
          await page.setViewportSize({ width: 480, height: 900 });
          await page
            .getByRole("button", { name: "Close session inspector" })
            .click();
        }
        await step("thinking");
        await page
          .locator(
            '[data-testid="preview-row"][data-event-type="agent.thinking"]',
          )
          .waitFor();
        if (view === "thinking") return;
        await step("text");
        const preview = page.locator(
          '[data-testid="preview-row"][data-event-type="agent.message"]',
        );
        await preview.waitFor();
        if (view === "narrow") await preview.scrollIntoViewIfNeeded();
        if (view === "final") {
          await step("finish");
          await preview.waitFor({ state: "detached" });
          await page
            .locator(
              '[data-testid="event-row"][data-event-id="sevt_01HmTd92anY6GDkWZ1qMCiEM"]',
            )
            .scrollIntoViewIfNeeded();
        } else if (view === "reconnecting") {
          await step("drop");
          await page
            .locator('[data-testid="stream-state"][data-state="reconnecting"]')
            .waitFor();
          await preview.waitFor({ state: "detached" });
        }
      },
    }),
  ),
  ...[
    "rendered",
    "api",
    "resources",
    "manual",
    "archived",
    "missing",
    "narrow",
  ].map((view): Surface => ({
    id: "deployment-inspector-" + view,
    route:
      "/deployments?deployment=" +
      (view === "manual"
        ? "depl_handtask00000000001"
        : view === "missing"
          ? "depl_missing"
          : DEPLOYMENT),
    fixture:
      "Deployment with file/memory bindings, pinned Agent and server schedule timestamps",
    description:
      "Deployment list inspection with Rendered/API, linked resources and archived/missing/narrow states.",
    setup: async (page) => {
      const panel = page.getByRole("region", { name: "Deployment details" });
      if (view === "missing") {
        await panel.getByTestId("error-state").waitFor();
        return;
      }
      await panel.getByRole("heading").first().waitFor();
      if (view === "archived") {
        const response = await page.request.post(
          MOCK_URL + "/v1/deployments/" + DEPLOYMENT + "/archive",
          {
            headers: {
              "x-api-key":
                "sk-map-api01-mock-owned-test-key-00000000000000000000001",
            },
          },
        );
        if (!response.ok())
          throw new Error("Could not archive inspector fixture");
        await page.reload();
        await panel.locator('[data-status="archived"]').waitFor();
      }
      if (view === "api")
        await panel.getByRole("button", { name: "API", exact: true }).click();
      if (view === "narrow")
        await page.setViewportSize({ width: 390, height: 844 });
      if (view === "resources" || view === "narrow")
        await panel
          .getByRole("link", { name: "Project notes", exact: true })
          .scrollIntoViewIfNeeded();
    },
  })),
  ...[
    "configuration",
    "dirty",
    "versions",
    "version-pages",
    "version-error",
    "resources",
    "archived",
    "narrow",
    "runs",
    "run-error",
    "run-deleted",
    "run-session",
    "run-api",
    "run-narrow",
  ].map((view): Surface => ({
    id: "deployment-workspace-" + view,
    route:
      `/deployments/${DEPLOYMENT}` +
      (view.startsWith("run")
        ? "?tab=runs" +
          (view === "run-error"
            ? `&run=${DEPLOYMENT_RUN}`
            : view === "run-deleted"
              ? "&run=drun_erased000000000001"
              : "")
        : ""),
    fixture: DEPLOYMENT,
    description:
      "Deployment inline configuration and run Session inspection: " + view,
    setup: async (page) => {
      if (view === "narrow" || view === "run-narrow")
        await page.setViewportSize({ width: 390, height: 844 });
      if (view === "version-pages" || view === "version-error") {
        await page.route(
          `**/api/organizations/default/proxy/v1/agents/${AGENT}/versions?*`,
          async (route) => {
            if (new URL(route.request().url()).searchParams.has("page")) {
              await route.fulfill({
                status: 503,
                json: {
                  type: "error",
                  error: {
                    type: "api_error",
                    message: "Version page unavailable",
                  },
                },
              });
            } else {
              const response = await route.fetch();
              const body = await response.json();
              await route.fulfill({
                json: {
                  ...body,
                  data: body.data.slice(0, 1),
                  next_page: "older",
                },
              });
            }
          },
        );
        await page.reload();
      }
      if (view === "archived") {
        const archived = await page.request.post(
          `${MOCK_URL}/v1/deployments/${DEPLOYMENT}/archive`,
          {
            headers: {
              "x-api-key":
                "sk-map-api01-mock-owned-test-key-00000000000000000000001",
            },
          },
        );
        if (!archived.ok())
          throw new Error("Could not archive deployment fixture");
        await page.reload();
        await page.locator('[data-status="archived"]').waitFor();
      }
      if (
        view.startsWith("run-") &&
        !["run-error", "run-deleted"].includes(view)
      ) {
        const response = await page.request.post(
          `${MOCK_URL}/v1/deployments/${DEPLOYMENT}/run`,
          {
            headers: {
              "x-api-key":
                "sk-map-api01-mock-owned-test-key-00000000000000000000001",
            },
          },
        );
        if (!response.ok())
          throw new Error("Could not create deployment run fixture");
        const run = await response.json();
        await page.goto(`/deployments/${DEPLOYMENT}?tab=runs&run=${run.id}`);
        await page
          .getByRole("region", { name: "Session details" })
          .getByRole("heading", { name: "Run", exact: true })
          .waitFor();
        if (view === "run-api")
          await page
            .getByRole("region", { name: "Session details" })
            .getByRole("button", { name: "API", exact: true })
            .click();
      } else if (view === "run-error")
        await page.getByTestId("deployment-run-error").waitFor();
      else if (view === "run-deleted")
        await page
          .getByRole("region", { name: "Deployment run details" })
          .getByText("Session created", { exact: true })
          .waitFor();
      else if (view === "runs")
        await page.getByText("succeeded", { exact: true }).waitFor();
      else {
        await page
          .getByRole("textbox", { name: "Name", exact: true })
          .waitFor();
        if (view === "dirty")
          await page
            .getByRole("textbox", { name: "Initial message", exact: true })
            .fill("Unsaved deployment instructions");
        if (["versions", "version-pages", "version-error"].includes(view)) {
          await page
            .getByRole("combobox", { name: "Agent version", exact: true })
            .click();
          if (view === "versions")
            await page
              .getByRole("option", { name: "v2", exact: true })
              .waitFor();
          else {
            const older = page.getByRole("button", {
              name: "Load older versions",
            });
            await older.waitFor();
            if (view === "version-error") {
              await older.click();
              await page.getByTestId("error-state").waitFor();
            }
          }
        }
        if (view === "resources")
          await page
            .getByText("Session resources (optional)", { exact: true })
            .scrollIntoViewIfNeeded();
      }
    },
  })),
  ...[
    "store",
    "memory",
    "raw",
    "file",
    "text",
    "download",
    "repository",
    "archived",
    "narrow",
    "missing-file",
  ].map((view): Surface => ({
    id: "session-resource-preview-" + view,
    route: `/sessions/${GATED}?inspector=resources`,
    fixture:
      "Session memory/file/repository bindings; synthetic downloadable text for the text view",
    description:
      "Nested resource selection, read-only memory content and platform-gated file previews.",
    setup: async (page) => {
      const fileView = ["file", "text", "download", "missing-file"].includes(
        view,
      );
      const sourceId =
        view === "text" || view === "download"
          ? "file_output000000000001"
          : "file_notes0000000000001";
      const response = await browserPost(
        page,
        "/api/organizations/default/proxy/v1/sessions",
        {
          data: {
            agent: AGENT,
            environment_id: ENV,
            title: "Project resource inspection",
            resources: fileView
              ? [
                  {
                    type: "file",
                    file_id: sourceId,
                    mount_path: "/mnt/session/uploads/notes.md",
                  },
                ]
              : view === "repository"
                ? [
                    {
                      type: "github_repository",
                      url: "https://github.com/example/project",
                      authorization_token: "test-only-reference",
                    },
                  ]
                : [
                    {
                      type: "memory_store",
                      memory_store_id: MEMORY_STORE,
                      access: "read_only",
                      instructions: "Use the project notes as reference.",
                    },
                  ],
          },
        },
      );
      if (!response.ok())
        throw new Error("Resource preview fixture creation failed");
      const session = (await response.json()) as {
        id: string;
        resources: { type: string; file_id?: string }[];
      };
      // The mount names the session's own copy (platform #578), which is never
      // downloadable; the text and download views stand in a downloadable file
      // for it, the preview branch a session mounting an output before #578
      // still reaches.
      const fileId =
        session.resources.find((resource) => resource.type === "file")
          ?.file_id ?? sourceId;
      if (view === "download")
        await page.route(
          `**/api/organizations/default/proxy/v1/files/${fileId}`,
          (route) =>
            route.fulfill({
              json: {
                id: fileId,
                type: "file",
                filename: "summary.xlsx",
                mime_type:
                  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                size_bytes: 120400,
                downloadable: true,
                created_at: "2026-09-01T10:00:00Z",
                expires_at: null,
              },
            }),
        );
      if (view === "archived") {
        const archived = await browserPost(
          page,
          `/api/organizations/default/proxy/v1/sessions/${session.id}/archive`,
        );
        if (!archived.ok()) throw new Error("Resource preview archive failed");
      }
      if (view === "text") {
        await page.route(
          `**/api/organizations/default/proxy/v1/files/${fileId}`,
          (route) =>
            route.fulfill({
              json: {
                id: fileId,
                type: "file",
                filename: "summary.txt",
                mime_type: "text/plain",
                size_bytes: 44,
                downloadable: true,
                created_at: "2026-09-01T10:00:00Z",
                expires_at: null,
              },
            }),
        );
        await page.route(
          `**/api/organizations/default/proxy/v1/files/${fileId}/content`,
          (route) =>
            route.fulfill({
              contentType: "text/plain",
              body: "Project output\n\nAll requested checks passed.\n",
            }),
        );
      }
      if (view === "missing-file")
        await page.route(
          `**/api/organizations/default/proxy/v1/files/${fileId}`,
          (route) =>
            route.fulfill({
              status: 404,
              json: {
                type: "error",
                error: {
                  type: "not_found_error",
                  message: "The source file is no longer available.",
                },
              },
            }),
        );
      if (view === "narrow")
        await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`/sessions/${session.id}?inspector=resources`);
      if (fileView) {
        await page
          .getByRole("button", {
            name: "Inspect resource /mnt/session/uploads/notes.md",
          })
          .click();
        if (view === "missing-file")
          await page
            .getByText("The source file is no longer available.")
            .waitFor();
        else await page.getByTestId("session-file-preview").waitFor();
        if (view === "text") {
          await page.getByRole("button", { name: "Preview content" }).click();
          await page
            .getByTestId("session-file-preview")
            .getByText("Project output", { exact: false })
            .waitFor();
        }
      } else if (view === "repository")
        await page
          .getByRole("button", { name: /Inspect resource.*project$/ })
          .click();
      else {
        await page
          .getByRole("button", {
            name: "Inspect resource /mnt/memory/project-notes",
          })
          .click();
        if (view !== "store") {
          await page
            .getByRole("button", { name: "Expand /mnt/memory/project-notes" })
            .click();
          await page.getByRole("treeitem", { name: /brief.md/ }).click();
          await page.getByTestId("session-memory-preview").waitFor();
          if (view === "raw")
            await page
              .getByRole("button", { name: "raw", exact: true })
              .click();
        }
      }
      await page
        .getByRole("region", { name: "Resource preview" })
        .scrollIntoViewIfNeeded();
    },
  })),
  ...[
    "fit",
    "zoom",
    "selected",
    "empty",
    "thread",
    "requests",
    "child",
    "narrow",
  ].map((view): Surface => ({
    id: "session-timeline-" + view,
    route:
      "/sessions/" + (view === "child" ? SESSION : GATED) + "?inspector=thread",
    fixture: view === "child" ? SESSION : GATED,
    description:
      "Persisted-event timeline, zoom and thread metadata/usage with explicit platform field boundaries.",
    setup: async (page) => {
      if (view === "empty") {
        const response = await page.request.post(MOCK_URL + "/v1/sessions", {
          headers: {
            "x-api-key":
              "sk-map-api01-mock-owned-test-key-00000000000000000000001",
          },
          data: { agent: AGENT, environment_id: ENV, title: "Empty timeline" },
        });
        if (!response.ok())
          throw new Error("Could not create empty timeline fixture");
        const session = await response.json();
        await page.goto("/sessions/" + session.id + "?inspector=thread");
      }
      await traceLive(page);
      if (view === "zoom") {
        await page
          .getByRole("button", { name: "Zoom in", exact: true })
          .click();
        await page
          .getByRole("button", { name: "Zoom in", exact: true })
          .click();
      }
      if (view === "selected") {
        const event = page
          .getByRole("group", { name: "Event timeline" })
          .getByRole("button", { name: /^span.model_request_end/ });
        await event.focus();
        await event.press("Enter");
        await page.getByTestId("event-detail").waitFor();
      }
      if (view === "child") {
        await page
          .getByRole("button", {
            name: "Child thread General task agent",
            exact: true,
          })
          .click();
        await page
          .locator('[data-inspected-thread-id="sthr_taskrunnerresearch0001"]')
          .waitFor();
        await traceLive(page);
      }
      if (view === "narrow")
        await page.setViewportSize({ width: 390, height: 844 });
      if (view === "requests" || view === "narrow") {
        await page.getByText("Inspect model requests", { exact: true }).click();
        await page
          .getByRole("region", { name: "Thread details" })
          .scrollIntoViewIfNeeded();
      }
    },
  })),
  ...[
    "session",
    "events",
    "tools",
    "resources",
    "thread",
    "closed",
    "narrow",
  ].map((view): Surface => ({
    id: "session-workspace-" + view,
    route:
      "/sessions/" +
      GATED +
      (view === "narrow" ? "?inspector=events" : "?inspector=" + view),
    fixture: GATED,
    description:
      "Session transcript with a URL-addressed inspector and inline approval.",
    setup: async (page) => {
      if (view === "narrow")
        await page.setViewportSize({ width: 390, height: 844 });
      await traceLive(page);
      await page.getByTestId("event-row").first().waitFor();
      if (view === "events" || view === "narrow") {
        await page
          .getByTestId("inspector-event-row")
          .filter({ hasText: "agent.tool_use" })
          .click();
        await page.getByTestId("event-detail").waitFor();
      }
      if (view === "tools")
        await page.locator('[data-tool-name="bash"]').click();
    },
  })),

  ...[
    "rendered",
    "draft",
    "raw",
    "versions",
    "history",
    "narrow",
    "narrow-roster",
    "start-session",
    "sessions",
    "deployments",
  ].map((view): Surface => ({
    id: "agent-configuration-" + view,
    route:
      "/agents/" +
      AGENT +
      (view === "history"
        ? "?version=2"
        : view === "sessions" || view === "deployments"
          ? "?tab=" + view
          : ""),
    fixture: "versioned researcher with pinned roster and related resources",
    description:
      "Full Agent configuration, version history, draft actions and related resource tabs.",
    setup: async (page) => {
      if (view === "narrow" || view === "narrow-roster")
        await page.setViewportSize({
          width: view === "narrow-roster" ? 360 : 390,
          height: 844,
        });
      await page
        .getByRole("heading", { name: "Deep researcher", exact: true })
        .waitFor();
      if (view === "draft" || view === "narrow")
        await page
          .getByLabel("Description", { exact: true })
          .fill(
            "Updated research instructions, ready to save as a new version.",
          );
      if (view === "narrow-roster")
        await page.getByTestId("agent-multiagent").scrollIntoViewIfNeeded();
      if (view === "raw")
        await page.getByRole("radio", { name: "raw", exact: true }).click();
      if (view === "versions") {
        await page.getByRole("combobox", { name: "Agent version" }).click();
        await page.getByRole("option", { name: /^v2 · Created/ }).waitFor();
      }
      if (view === "start-session") {
        await page
          .getByRole("button", { name: "Start session", exact: true })
          .click();
        await page.getByRole("dialog", { name: "Create session" }).waitFor();
      }
      if (view === "sessions")
        await page
          .getByRole("cell", { name: "Survey agent frameworks" })
          .waitFor();
      if (view === "deployments")
        await page
          .getByRole("cell", { name: "Weekly research digest" })
          .waitFor();
    },
  })),
  ...[
    "activity",
    "api",
    "narrow",
    "empty-resources",
    "archived",
    "missing",
  ].map((view): Surface => ({
    id: "session-inspector-" + view,
    route: "/sessions?session=" + (view === "missing" ? "sesn_missing" : GATED),
    fixture: "bounded persisted session events and resource references",
    description:
      "Session list inspection preserves selection, history and filters.",
    setup: async (page) => {
      if (view === "narrow")
        await page.setViewportSize({ width: 390, height: 844 });
      if (view === "empty-resources") {
        const response = await page.request.post(MOCK_URL + "/v1/sessions", {
          headers: {
            "x-api-key":
              "sk-map-api01-mock-owned-test-key-00000000000000000000001",
          },
          data: {
            agent: AGENT,
            environment_id: ENV,
            title: "Research with project memory",
            vault_ids: [VAULT],
            resources: [
              {
                type: "memory_store",
                memory_store_id: MEMORY_STORE,
                access: "read_only",
              },
            ],
          },
        });
        if (!response.ok())
          throw new Error(
            "Session resource fixture failed: " + response.status(),
          );
        const session = await response.json();
        await page.goto(
          new URL("/sessions?session=" + session.id, page.url()).href,
        );
      }
      const panel = page.getByRole("region", { name: "Session details" });
      if (view === "missing") {
        await panel.getByTestId("error-state").waitFor();
        return;
      }
      await panel.getByRole("heading", { name: "Latest activity" }).waitFor();
      if (view === "empty-resources")
        await panel.getByText("No events yet.").waitFor();
      else await panel.locator("[data-event-id]").first().waitFor();
      if (view === "api") {
        await panel.getByRole("button", { name: "API", exact: true }).click();
        await panel.getByText(/"stats":/).waitFor();
      }
      if (view === "archived") {
        await panel.getByRole("button", { name: "More actions" }).click();
        await page
          .getByRole("menuitem", { name: "Archive", exact: true })
          .click();
        await panel.getByText("archived", { exact: true }).waitFor();
        await page.getByRole("dialog").waitFor({ state: "hidden" });
      }
    },
  })),
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
              headers: {
                "x-api-key":
                  "sk-map-api01-mock-owned-test-key-00000000000000000000001",
              },
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
      await populatedDashboard(page);
      const form = await openApiKeyForm(page, "Get API key");
      await form.waitFor();
    },
  },
  {
    id: "dashboard-mobile",
    route: "/dashboard",
    fixture: "all surfaces, 390px viewport",
    description: "Dashboard cards and shortcuts wrap within a narrow viewport.",
    setup: (page) => populatedDashboard(page, { width: 390, height: 844 }),
  },
  {
    id: "dashboard-mobile-nav",
    route: "/dashboard",
    fixture: "390px viewport, navigation expanded",
    description: "The full-width sidebar shows both navigation sections.",
    setup: async (page) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.getByRole("button", { name: "Menu", exact: true }).click();
      await page.locator('[data-sidebar-state="expanded"]').waitFor();
    },
  },
  {
    id: "dashboard-resources-panel",
    route: "/dashboard",
    fixture: "Resources submenu open on Files",
    description:
      "The Resources link opens its submenu and the first available destination.",
    setup: async (page) => {
      await page.locator('[data-nav-group="Resources"]').click();
      await page.locator('[data-nav-view="Resources"]').waitFor();
      await page.waitForURL(/\/files$/);
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
    id: "dashboard",
    route: "/dashboard",
    fixture:
      "daily gateway usage and a signed-in operator with Playground access",
    description:
      "A personal greeting, usage overview, four provider model cards and resource links.",
    setup: populatedDashboard,
  },
  ...(["cost", "features"] as const).map((view): Surface => ({
    id: `dashboard-compare-${view}`,
    route: "/dashboard",
    fixture: "three selected upstream models",
    description: `Dashboard model comparison with the ${view} view selected.`,
    setup: async (page) => {
      await populatedDashboard(page);
      await page
        .getByRole("button", { name: "Compare models", exact: true })
        .click();
      const dialog = page.getByRole("dialog", { name: "Compare models" });
      if (view === "features") {
        await dialog
          .getByRole("combobox", { name: "Model 3", exact: true })
          .click();
        await page
          .getByRole("option", { name: "MiniMax M3", exact: true })
          .click();
        await dialog.getByText("Features", { exact: true }).click();
      }
      await dialog
        .getByRole("radio", {
          name: view === "cost" ? "Cost" : "Features",
          exact: true,
          checked: true,
        })
        .waitFor();
    },
  })),
  ...dashboardModelCases.map((model): Surface => ({
    id: `dashboard-model-popup-${model.brand}`,
    route: "/dashboard",
    fixture: model.alias
      ? `gateway alias ${model.alias} listed by Playground`
      : "no matching provider in the gateway",
    description: `Dashboard with the ${model.name} pricing and features dialog open.`,
    setup: async (page) => {
      await openDashboardModelDialog(page, model, {
        selectAlias: model.brand === "minimax",
      });
    },
  })),
  {
    id: "dashboard-model-popup-options",
    route: "/dashboard",
    fixture: "MiniMax CN with an accessible minimax-m3 gateway alias",
    description:
      "The single-model More options menu with the local guide and agent draft actions.",
    setup: async (page) => {
      const dialog = await openDashboardModelDialog(
        page,
        dashboardModelCases[3],
        { selectAlias: true },
      );
      await dialog
        .getByRole("button", { name: "More options", exact: true })
        .click();
      await page
        .getByRole("menuitem", { name: "Build an agent", exact: true })
        .waitFor();
    },
  },
  ...(["top", "scrolled"] as const).map((position): Surface => ({
    id: `dashboard-model-popup-mobile-${position}`,
    route: "/dashboard",
    viewportOnly: true,
    fixture: "MiniMax CN and the minimax-m3 alias on a 390px viewport",
    description:
      position === "top"
        ? "The initial model dialog at phone width."
        : "The model dialog after scrolling its content on a phone.",
    setup: async (page) => {
      const dialog = await openDashboardModelDialog(
        page,
        dashboardModelCases[3],
        {
          viewport: { width: 390, height: 600 },
          selectAlias: position === "scrolled",
        },
      );
      if (position === "scrolled") {
        await dialog.locator("[data-model-popup-scroll]").hover();
        await page.mouse.wheel(0, 650);
        await page.waitForFunction(() => {
          const pane = document.querySelector("[data-model-popup-scroll]");
          return (
            pane && pane.scrollTop >= pane.scrollHeight - pane.clientHeight - 1
          );
        });
      }
    },
  })),
  ...dashboardModelCases.map((model): Surface => ({
    id: `dashboard-model-${model.brand}`,
    route: `/dashboard/models/${model.brand}`,
    fixture: model.alias
      ? `gateway alias ${model.alias} listed by Playground`
      : "no matching provider in the gateway",
    description: `The ${model.name} overview, upstream identifier, pricing and current deployment.`,
    setup: (page) => settledDashboardModel(page, model),
  })),
  {
    id: "dashboard-model-minimax-mobile",
    route: "/dashboard/models/minimax",
    fixture: "MiniMax CN and the minimax-m3 alias on a 390px viewport",
    description:
      "The model reference and its active gateway routes on a narrow screen.",
    setup: async (page) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await settledDashboardModel(page, dashboardModelCases[3]);
    },
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
    id: "resources-overview",
    route: "/resources",
    fixture: "one uploaded file and two skills",
    description:
      "Workspace navigation, counts, recent rows and links to both libraries.",
    setup: async (page) => {
      await page
        .locator('[data-resource-overview] [data-source="custom"]')
        .waitFor();
    },
  },
  {
    id: "resources-overview-add",
    route: "/resources",
    fixture: "available Files and Skills",
    description: "Add destinations next to the workspace summary.",
    setup: async (page) => {
      await page.getByRole("button", { name: "Add", exact: true }).click();
      await page.getByRole("menuitem", { name: "Skill" }).waitFor();
    },
  },
  {
    id: "resources-workspace-list",
    route: "/resources",
    fixture: "reserved Default workspace",
    description: "Selected workspace and the Resources submenu.",
    setup: async (page) => {
      await page.getByRole("combobox", { name: "Workspace" }).click();
      await page.getByRole("option", { name: "Default" }).waitFor();
    },
  },
  {
    id: "resources-overview-narrow",
    route: "/resources",
    fixture: "one uploaded file and two skills at 390 px",
    description: "Single-column workspace summary and Add action.",
    setup: async (page) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page
        .locator('[data-resource-overview] [data-source="custom"]')
        .waitFor();
    },
  },
  {
    id: "skills-list",
    route: "/skills",
    fixture: "one custom and one catalog skill",
    description:
      "GA skill names, source labels, version IDs and upload action.",
  },
  {
    id: "files-list",
    route: "/files",
    // The session's output and mount copy list under its scope_id only (#578).
    fixture: "1 upload",
    description: "Resource list with byte sizes and an upload action.",
  },
  {
    id: "files-selection",
    route: "/files",
    fixture: "one selected file",
    description:
      "Selected count, clear and Delete at the bottom of the content pane.",
    viewportOnly: true,
    setup: async (page) => {
      await page
        .getByRole("checkbox", { name: "Select research-notes.md" })
        .check();
    },
  },
  {
    id: "skills-selection",
    route: "/skills",
    fixture: "one selected custom skill",
    description:
      "Bottom selection toolbar with Delete available for the custom skill.",
    viewportOnly: true,
    setup: async (page) => {
      await page
        .getByRole("checkbox", { name: "Select Weekly report writer" })
        .check();
    },
  },
  {
    id: "skills-selection-narrow",
    route: "/skills",
    fixture: "one selected catalog skill",
    description:
      "Selection toolbar in a narrow viewport with catalog deletion disabled.",
    viewportOnly: true,
    setup: async (page) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page
        .getByRole("checkbox", { name: "Select Excel spreadsheets" })
        .check();
    },
  },
  {
    id: "file-inspector",
    route: "/files?file=file_notes0000000000001",
    fixture: "uploaded research notes",
    description:
      "File metadata and preview availability with the list retained.",
  },
  {
    id: "file-inspector-api",
    route: "/files?file=file_notes0000000000001",
    fixture: "uploaded research notes",
    description: "The API representation of the inspected file.",
    setup: async (page) => {
      await page
        .getByRole("region", { name: "File details" })
        .getByText("API", { exact: true })
        .click();
    },
  },
  {
    id: "file-upload",
    route: "/files",
    fixture: "staged file",
    description: "File awaiting explicit upload.",
    setup: async (page) => {
      await page.getByRole("button", { name: "Upload file" }).first().click();
      await page.getByLabel("File to upload").setInputFiles({
        name: "notes.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("Test file."),
      });
    },
  },
  {
    id: "file-delete-confirmation",
    route: "/files",
    fixture: "one selected upload",
    description: "Named file deletion requires confirmation.",
    setup: async (page) => {
      await page
        .getByRole("button", { name: "Actions for research-notes.md" })
        .click();
      await page.getByRole("menuitem", { name: "Delete" }).click();
    },
  },
  {
    id: "skill-update",
    route: "/skills?skill=" + SKILL,
    fixture: SKILL,
    description: "Staged custom skill version dialog.",
    setup: async (page) => {
      await page
        .getByRole("region", { name: "Skill details" })
        .getByRole("button", { name: "Update" })
        .click();
    },
  },
  {
    id: "skill-lookup-miss",
    route: "/skills",
    fixture: "unknown skill ID",
    description: "Lookup miss in the list with clear search controls.",
    setup: async (page) => {
      await page
        .getByRole("textbox", { name: "Find skill by ID" })
        .fill("unknown-skill");
      await page.getByRole("heading", { name: "Skill not found" }).waitFor();
    },
  },
  {
    id: "models-list",
    route: "/models",
    fixture: "5 gateway models: chat, embedding, rerank",
    description:
      "Model gateway models: name and display name, kind, and the upstream models each routes to by tier and share.",
  },
  {
    id: "messages-overview",
    route: "/messages",
    fixture:
      "two direct Messages API calls in the last 30 days and active API keys",
    description:
      "Messages navigation, usage cards, API key shortcuts and resources.",
    setup: async (page) => {
      await openMessages(page, "/messages");
      await page.getByRole("link", { name: /ci-deploy/ }).waitFor();
    },
  },
  {
    id: "messages-workspace-menu",
    route: "/messages",
    fixture: "the platform's default workspace",
    description: "The selected workspace in the Messages sidebar.",
    setup: async (page) => {
      await openMessages(page, "/messages");
      await page.getByRole("link", { name: /ci-deploy/ }).waitFor();
      await page.getByRole("combobox", { name: "Workspace" }).click();
      await page
        .getByRole("option", { name: "Default", exact: true })
        .waitFor();
    },
  },
  {
    id: "messages-overview-narrow",
    route: "/messages",
    fixture: "Messages Overview at phone width",
    description: "Usage cards, Keys and Resources on a narrow viewport.",
    setup: async (page) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await openMessages(page, "/messages");
      await page.getByRole("link", { name: /ci-deploy/ }).waitFor();
    },
  },
  {
    id: "messages-playground",
    route: "/playground",
    fixture: "two discovered chat aliases and an empty prompt",
    description: "The request builder, starter templates and Messages sidebar.",
    setup: async (page) => {
      await openMessages(page, "/playground");
      await page.getByRole("button", { name: "Run prompt" }).waitFor();
      await page.locator('[data-model="deepseek-flash"]').waitFor();
    },
  },
  {
    id: "messages-playground-settings",
    route: "/playground",
    fixture:
      "a chat alias reporting a 32,000-token limit and supported thinking modes",
    description:
      "The Model panel with its model picker, thinking modes and token controls.",
    viewportOnly: true,
    setup: async (page) => {
      await openMessages(page, "/playground");
      await page.locator('[data-model="deepseek-flash"]').waitFor();
      await page.getByRole("button", { name: "Model settings" }).click();
      await page.getByRole("radiogroup", { name: "Thinking" }).waitFor();
    },
  },
  {
    id: "messages-playground-advanced-narrow",
    route: "/playground",
    fixture: "a model with no reported output limit on a 390px viewport",
    description:
      "Advanced settings with an editable output budget, a stop sequence and the streaming switch.",
    viewportOnly: true,
    setup: async (page) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await grantDashboardModelDiscovery(page, "minimax-m3");
      await page.reload();
      await page.locator('[data-model="deepseek-flash"]').waitFor();
      await page.getByRole("button", { name: "Model settings" }).click();
      const panel = page.getByRole("dialog", { name: "Model", exact: true });
      await panel.getByRole("combobox", { name: "Model" }).click();
      await page.getByRole("option", { name: "MiniMax M3" }).click();
      await panel
        .getByRole("spinbutton", { name: "Max tokens value" })
        .fill("8192");
      await panel.getByRole("button", { name: "Advanced" }).click();
      await panel.getByRole("button", { name: "Add", exact: true }).click();
      await panel.getByRole("textbox", { name: "Stop sequence 1" }).fill("END");
      await panel.getByRole("switch", { name: "Streaming" }).waitFor();
    },
  },
  {
    id: "messages-playground-add",
    route: "/playground",
    fixture: "a blank request with its system row and no tool definitions",
    description:
      "The top Add menu with system status, five tool presets and a custom tool.",
    viewportOnly: true,
    setup: async (page) => {
      await openMessages(page, "/playground");
      await page.locator('[data-model="deepseek-flash"]').waitFor();
      await page.getByRole("button", { name: "Add", exact: true }).click();
      await page.getByRole("menuitem", { name: "Custom tool" }).waitFor();
    },
  },
  ...[
    ...toolTemplates.map(({ id, title, name }) => ({
      id,
      title,
      tool:
        id === "search"
          ? "deepseek_web_search"
          : id === "fetch"
            ? "deepseek_read_url"
            : name,
    })),
    { id: "stream", title: "Stream tool arguments live", tool: "make_file" },
    { id: "parallel", title: "Call tools in parallel", tool: "get_time" },
  ].map(({ id, title, tool }): Surface => ({
    id: "messages-playground-template-" + id,
    route: "/playground",
    fixture: title,
    description:
      "The selected template card and its editable system, tool definitions and user prompt.",
    setup: async (page) => {
      await openMessages(page, "/playground");
      await page.locator('[data-model="deepseek-flash"]').waitFor();
      if (id === "browser")
        await page
          .getByRole("navigation", { name: "Template pages" })
          .getByRole("button", { name: "More" })
          .click();
      await page.getByRole("button", { name: title, exact: true }).click();
      await page.getByRole("button", { name: tool, exact: true }).waitFor();
      await page
        .getByRole("button", { name: title, exact: true, pressed: true })
        .waitFor();
    },
  })),
  ...(["client-calls", "client-results", "hosted-results"] as const).map(
    (view): Surface => ({
      id: "messages-playground-" + view,
      route: "/playground",
      fixture:
        view === "hosted-results"
          ? "DeepSeek web search and link-reading blocks"
          : "two independent client tool calls",
      description:
        view === "client-results"
          ? "Individual manual results with their call IDs and error state."
          : "The provider response in Rendered view, with arguments and tool output.",
      setup: async (page) => {
        await openMessages(page, "/playground");
        await page.locator('[data-model="deepseek-flash"]').waitFor();
        await serveToolReply(
          page,
          view === "hosted-results" ? hostedResults : clientCalls,
        );
        await disablePlaygroundStreaming(page);
        for (const label of view === "hosted-results"
          ? ["Web search", "Web fetch"]
          : ["Computer use", "Browser use"]) {
          await page.getByRole("button", { name: "Add", exact: true }).click();
          await page
            .getByRole("menuitem", { name: label, exact: true })
            .click();
        }
        await page
          .getByRole("textbox", { name: "Prompt", exact: true })
          .fill("Inspect the example page.");
        await page.getByRole("button", { name: "Run prompt" }).click();
        const response = page.getByRole("region", { name: "Response" });
        if (view === "hosted-results") {
          const result = response.getByRole("button", {
            name: "Server tool result deepseek_web_search",
          });
          await result.waitFor();
          if ((await result.getAttribute("aria-expanded")) !== "true")
            await result.click();
          await response.getByLabel("Result for deepseek_web_search").waitFor();
        } else if (view === "client-results") {
          await response
            .getByRole("button", { name: "Add to messages" })
            .click();
          await page
            .getByRole("textbox", { name: "Tool result computer" })
            .fill("Screenshot captured.");
          await page
            .getByRole("textbox", { name: "Tool result browser" })
            .fill("Page unavailable.");
          await page
            .getByRole("checkbox", { name: "Mark browser result as an error" })
            .check();
        } else {
          await response.getByLabel("Arguments for computer").waitFor();
        }
      },
    }),
  ),
  {
    id: "messages-playground-full-request",
    route: "/playground",
    fixture: "editable JSON body for a direct Messages request",
    description:
      "The Form tab's full request view with headers, body and Back.",
    setup: async (page) => {
      await openMessages(page, "/playground");
      await page.locator('[data-model="deepseek-flash"]').waitFor();
      await page
        .getByRole("textbox", { name: "Prompt", exact: true })
        .fill("Summarize this message.");
      await page.getByRole("button", { name: "More request options" }).click();
      await page.getByRole("menuitem", { name: "Edit full request" }).click();
      await page.getByRole("textbox", { name: "Request body" }).waitFor();
    },
  },
  {
    id: "messages-playground-snippet-settings",
    route: "/playground",
    fixture: "the stream option for the current Messages request",
    description:
      "The code editor's snippet settings and selected Streaming option.",
    setup: async (page) => {
      await openMessages(page, "/playground");
      await page.locator('[data-model="deepseek-flash"]').waitFor();
      await page.getByText("Code", { exact: true }).click();
      await page.getByRole("button", { name: "Code snippet settings" }).click();
      await page.getByRole("menuitemcheckbox", { name: "Streaming" }).waitFor();
    },
  },
  {
    id: "messages-playground-code-invalid",
    route: "/playground",
    fixture: "user edits an incomplete JSON request",
    description:
      "The editable request retains the operator's draft and shows why it cannot return to Form.",
    setup: async (page) => {
      await openMessages(page, "/playground");
      await page.locator('[data-model="deepseek-flash"]').waitFor();
      await page
        .getByRole("textbox", { name: "Prompt", exact: true })
        .fill("Summarize this message.");
      await page.getByText("Code", { exact: true }).click();
      await page.getByLabel("Code language").selectOption("JSON");
      const code = page.getByRole("textbox", { name: "JSON request code" });
      await code.fill('{"model": "deepseek-flash",');
      await page.getByText("Form", { exact: true }).click();
      await page.getByRole("main").getByRole("alert").waitFor();
    },
  },
  {
    id: "messages-logs",
    route: "/messages/logs",
    fixture: "a direct API key request and a failed Playground request",
    description:
      "Request metadata, copy controls, refresh and the last update time.",
    setup: async (page) => {
      await openMessages(page, "/messages/logs");
      await page
        .getByRole("button", { name: "Copy " + DIRECT_REQUEST })
        .waitFor();
    },
  },
  {
    id: "messages-logs-empty",
    route: "/messages/logs",
    fixture: "empty gateway ledger",
    description: "No Messages requests in the last 30 days.",
    setup: async (page) => {
      await openMessages(page, "/messages/logs", []);
      await page.getByText("No logs in the last 30 days.").waitFor();
    },
  },
  ...["", "-narrow", "-latency"].map((view): Surface => ({
    id: "messages-log-detail" + view,
    route: "/messages/logs?request=" + DIRECT_REQUEST,
    viewportOnly: true,
    fixture: "direct API key request with reported tokens and timing",
    description:
      view === "-latency"
        ? "The request's processing time and reported time to first token."
        : "Selected log and request metadata on " +
          (view ? "narrow" : "desktop") +
          " screens.",
    setup: async (page) => {
      if (view === "-narrow")
        await page.setViewportSize({ width: 390, height: 844 });
      await openMessages(page, "/messages/logs?request=" + DIRECT_REQUEST);
      const details = page.getByRole("dialog", { name: "Request details" });
      await details
        .getByRole("button", { name: "Copy " + DIRECT_REQUEST })
        .waitFor();
      if (view === "-latency") {
        await details.getByRole("button", { name: "About latency" }).click();
        await details.getByRole("dialog", { name: "Latency" }).waitFor();
      }
    },
  })),
  {
    id: "usage-overview",
    route: "/usage",
    fixture: "14 days of the mock gateway's rollups",
    description:
      "Organization → Usage: tiles, cost per day, and the table grouped by model.",
    setup: async (page) => {
      await page.locator("table[data-by]").waitFor();
    },
  },
  {
    id: "usage-chart-tooltip",
    route: "/usage",
    fixture: "the latest day's bar, hovered",
    description: "A bar's hover answer: its UTC day and its cost.",
    setup: async (page) => {
      await page.locator("table[data-by]").waitFor();
      await page.getByRole("listitem").last().hover();
      await page.getByRole("tooltip").waitFor();
    },
  },
  {
    id: "usage-requests",
    route: "/usage/requests",
    fixture: "4 ledger rows: a session, an embedding, a 429 and a 502",
    description:
      "The per-request ledger: principal, key, model and upstream, session link, route, status, tokens, cost and timings.",
    setup: async (page) => {
      await page.locator("[data-status]").first().waitFor();
    },
  },
  {
    id: "providers-list",
    route: "/providers",
    fixture: "4 gateway providers, one disabled on plain HTTP",
    description:
      "Model gateway providers: vendor and site, endpoint protocols, key and upstream model counts, enabled state.",
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
    id: "model-inspector",
    route: "/models?model=agent-default",
    fixture: "agent-default: a 3:1 primary tier and one fallback",
    description:
      "Non-modal model inspector: kind, routing tiers with provider and share, organization limits and current owner-role authority.",
    setup: async (page) => {
      await page.getByRole("region", { name: "Model details" }).waitFor();
    },
  },
  {
    id: "environment-inspector",
    route: "/environments?environment=env_egress000000000000001",
    fixture: "cloud limited environment",
    description: "Non-modal structured environment inspector.",
  },
  {
    id: "environment-inspector-api",
    route: "/environments?environment=env_egress000000000000001",
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
    route: "/environments?environment=env_egress000000000000001",
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
    route: "/environments/env_egress000000000000001",
    fixture: "cloud environment",
    description:
      "Structured networking, packages, metadata and environment keys.",
  },
  {
    id: "environment-edit-inline",
    route: "/environments/env_egress000000000000001",
    fixture: "cloud environment edit",
    description: "Cancel and save without leaving the environment detail.",
    setup: async (page) => {
      await page.getByRole("button", { name: "Edit", exact: true }).click();
    },
  },
  {
    id: "environment-edit-rows",
    route: "/environments/env_egress000000000000001",
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
    route: "/environments/env_egress000000000000001",
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
      "environment-key table and self-hosted worker setup guide.",
  },
  {
    id: "vault-detail",
    route: `/vaults/${VAULT}`,
    fixture: VAULT,
    description: "Credential rows — the surface that must never show a secret.",
  },
  {
    id: "provider-detail",
    route: `/providers/${PROVIDER}`,
    fixture: PROVIDER,
    description:
      "A gateway provider's overview: endpoints fixed at creation, headers, stall timeout, trace context.",
  },
  {
    id: "provider-detail-plain-http",
    route: `/providers/${PLAIN_HTTP_PROVIDER}`,
    fixture: PLAIN_HTTP_PROVIDER,
    description:
      "The same page for a disabled provider whose endpoint is plain HTTP: the warning badge and the Enable action.",
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
      "A bookmarked missing skill leaves the list and close action available.",
  },
  {
    id: "deployment-detail",
    route: `/deployments/${DEPLOYMENT}`,
    fixture: DEPLOYMENT,
    description:
      "Inline deployment configuration, pinned Agent version and saved schedule timestamps.",
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
  ...["tree", "list"].map((view): Surface => ({
    id: `memory-${view}-end`,
    route: `/memory-stores/${MEMORY_STORE}`,
    fixture: "20 memories followed by an empty terminal page (#236)",
    description: `Memory ${view} end-of-walk message and enabled Previous control.`,
    setup: async (page) => {
      await page.route(
        `**/api/organizations/default/proxy/v1/memory_stores/${MEMORY_STORE}/memories?*`,
        async (route) => {
          if (new URL(route.request().url()).searchParams.has("page")) {
            await route.fulfill({ json: { data: [], next_page: null } });
            return;
          }
          const response = await route.fetch();
          const body = await response.json();
          const memory = body.data.find(
            (item: { type: string }) => item.type === "memory",
          );
          await route.fulfill({
            json: {
              data: Array.from({ length: 20 }, (_, index) => ({
                ...memory,
                id: `mem_page${index}`,
                path: `/item-${String(index).padStart(2, "0")}.md`,
              })),
              next_page: "terminal-page",
            },
          });
        },
      );
      await page.reload();
      await page.getByRole("treeitem", { name: /item-00.md/ }).waitFor();
      if (view === "list")
        await page
          .getByText("Store details and version history", { exact: true })
          .click();
      const target =
        view === "tree"
          ? page.getByRole("tree", { name: "Memories" })
          : page.getByTestId("memory-list");
      await target
        .getByRole("button", {
          name: view === "tree" ? "Next" : "Next page",
          exact: true,
        })
        .click();
      await target.locator('[data-memory-page-state="end"]').waitFor();
    },
  })),
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
        await page.getByRole("button", { name: "raw", exact: true }).click();
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
          headers: {
            "x-api-key":
              "sk-map-api01-mock-owned-test-key-00000000000000000000001",
          },
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
    description: "Drop zone for archives, loose files, and a skill directory.",
    setup: async (page) => {
      await page
        .getByRole("button", { name: "Create skill", exact: true })
        .click();
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
      "Deletion confirmation names the session's own files and retained uploads.",
    setup: async (page) => {
      await traceLive(page);
      await page.getByRole("button", { name: "More actions" }).click();
      await page.getByRole("menuitem", { name: "Delete" }).click();
      await page
        .getByRole("dialog", { name: "Delete this session?" })
        .waitFor();
    },
  },
  ...["menu", "narrow", "return", "error"].map((view): Surface => ({
    id: "session-archive-" + view,
    route: `/sessions/${view === "error" ? SESSION : GATED}`,
    fixture: view === "error" ? SESSION : GATED,
    description:
      "Direct Session archive, successful return to the list and visible running-session refusal.",
    setup: async (page) => {
      if (view === "narrow") {
        await page.setViewportSize({ width: 390, height: 844 });
        await page
          .getByRole("button", { name: "Close session inspector" })
          .click();
      }
      await traceLive(page);
      await page.getByRole("button", { name: "More actions" }).click();
      if (view === "return" || view === "error") {
        const response = page.waitForResponse(
          (response) =>
            response.request().method() === "POST" &&
            response.url().endsWith("/archive"),
        );
        await page.getByRole("menuitem", { name: "Archive" }).click();
        const archived = await response;
        if (view === "return") {
          if (!archived.ok()) throw new Error("Session archive fixture failed");
          await page.waitForURL("**/sessions");
          await page.getByRole("table").waitFor();
        } else {
          if (archived.status() !== 400)
            throw new Error("Expected running Session archive refusal");
          await page.getByText("Archive failed", { exact: true }).waitFor();
        }
      } else await page.getByRole("menuitem", { name: "Archive" }).waitFor();
    },
  })),
  // ---- the session trace, this console's densest surface ----------------
  {
    id: "session-transcript",
    route: `/sessions/${SESSION}`,
    fixture: SESSION,
    description:
      "Transcript: message and tool cards, inline approval and the Session inspector.",
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
    fixture: `${SESSION} with upload and session-file rubric suggestions`,
    description:
      "Define-outcome dialog using a file rubric with ID suggestions from uploads and the session's own files.",
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
  ...["parent", "child", "child-running", "child-narrow"].map(
    (view): Surface => ({
      id: "session-multiagent-" + view,
      route: `/sessions/${SESSION}?inspector=thread`,
      fixture: "recordings #7, coordinator and Alpha/Beta child threads",
      description:
        "Named timeline rows, parent-only approvals, child navigation and Session-wide interrupt.",
      setup: async (page) => {
        await page.request.post(
          `${MOCK_URL}/__multiagent${view === "child-running" ? "?running=true" : ""}`,
        );
        if (view === "child-narrow")
          await page.setViewportSize({ width: 480, height: 900 });
        await page.goto(
          `/sessions/${SESSION}?inspector=thread${view !== "parent" ? "&thread=sthr_membera0000000000001" : ""}`,
        );
        await traceLive(page);
        await page
          .locator('[data-thread-id="sthr_memberb0000000000001"]')
          .waitFor();
      },
    }),
  ),
  {
    id: "session-child-thread",
    route: `/sessions/${SESSION}?inspector=thread`,
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
    id: "session-debug-pending-approval",
    route: `/sessions/${GATED}`,
    fixture: GATED,
    description:
      "Debug tab with a standalone approval banner showing the tool and its full input.",
    setup: async (page) => {
      await traceLive(page);
      await page.getByRole("button", { name: "Debug", exact: true }).click();
      await page
        .locator('[data-testid="events-toolbar"][data-tab="debug"]')
        .waitFor();
      await page.getByTestId("approval-banner").waitFor();
    },
  },
  {
    id: "session-resources",
    route: `/sessions/${GATED}?inspector=resources`,
    fixture: `${GATED} with an attached file`,
    description:
      "Session resources: mounted-file row, its mount path and copy's size, and the attach affordance.",
    setup: async (page) => {
      await traceLive(page);
      const add = await page.request.post(
        `${MOCK_URL}/v1/sessions/${GATED}/resources`,
        {
          headers: {
            "x-api-key":
              "sk-map-api01-mock-owned-test-key-00000000000000000000001",
          },
          data: { type: "file", file_id: "file_notes0000000000001" },
        },
      );
      if (!add.ok()) {
        throw new Error(`Could not attach fidelity resource: ${add.status()}`);
      }
      await page.reload();
      await traceLive(page);
      await page
        .locator('[data-testid="session-resources"] [data-size-bytes="48213"]')
        .waitFor();
    },
  },
  {
    id: "session-files",
    route: `/sessions/${SESSION}?inspector=resources`,
    fixture: `${SESSION}: its mount's copy and a harvested output`,
    description:
      "A session's own files in Resources: the mounted copy's size, then the output with its download.",
    setup: async (page) => {
      await traceLive(page);
      await page
        .getByRole("link", {
          name: "Download summary.xlsx (file_output000000000001)",
        })
        .waitFor();
    },
  },
  {
    id: "session-file-delete",
    route: `/sessions/${SESSION}?inspector=resources`,
    fixture: `${SESSION}: its harvested output`,
    description:
      "Confirming a session file's delete: the dialog names what the delete takes.",
    setup: async (page) => {
      await traceLive(page);
      await page
        .getByRole("button", {
          name: "Delete summary.xlsx (file_output000000000001)",
        })
        .click();
      await page.getByRole("dialog", { name: "Delete file" }).waitFor();
    },
  },

  // ---- create / edit forms ---------------------------------------------
  {
    id: "agent-new",
    route: "/agents/new",
    fixture: "empty form",
    description: "The agent editor: the console's largest form.",
  },
  ...(["templates", "model", "raw", "narrow"] as const).map(
    (view): Surface => ({
      id: "agent-new-" + view,
      route: "/agents/new",
      fixture: "Manual creation in the Default workspace",
      description: "Directory creation with its " + view + " view.",
      setup: async (page) => {
        if (view === "narrow")
          await page.setViewportSize({ width: 390, height: 844 });
        await page
          .getByRole("button", { name: "Model", exact: true })
          .waitFor();
        if (view === "templates")
          await page.getByRole("radio", { name: "Template" }).check();
        if (view === "model") {
          await page
            .getByRole("button", { name: "Model", exact: true })
            .click();
          await page.getByRole("dialog", { name: "Model settings" }).waitFor();
        }
        if (view === "raw")
          await page.getByRole("radio", { name: "raw", exact: true }).click();
      },
    }),
  ),
  {
    id: "agent-edit",
    route: `/agents/${AGENT}/edit`,
    fixture: AGENT,
    description: "The same editor populated, with the curl block.",
  },
  {
    id: "agent-model-select",
    route: `/agents/${AGENT}/edit`,
    fixture: AGENT + " on a gateway that lacks its model",
    description:
      "The model field as a select of the gateway's chat models (plan 10 decision 6).",
    setup: async (page) => {
      // Tall enough for the whole form: the full-page shot resizes a shorter
      // viewport, and the resize closes the popup.
      await page.setViewportSize({ width: 1440, height: 1200 });
      await page.getByRole("combobox", { name: "Model", exact: true }).click();
      await page.getByRole("option", { name: "agent-default" }).waitFor();
    },
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
    id: "session-create-selected",
    route: "/sessions",
    fixture: GATED,
    description:
      "Session creation retains Agent/version and Environment/hosting labels after selection.",
    setup: async (page) => {
      await page
        .getByRole("button", { name: "Create session", exact: true })
        .click();
      const dialog = page.getByRole("dialog", { name: "Create session" });
      await dialog
        .getByRole("combobox", { name: "Agent", exact: true })
        .click();
      await page.getByRole("option", { name: /General task agent/ }).click();
      await dialog
        .getByRole("combobox", { name: "Environment", exact: true })
        .click();
      await page.getByRole("option", { name: /byoc-workers/ }).click();
      await dialog
        .getByRole("combobox", { name: "Agent", exact: true })
        .getByText("General task agent · v1")
        .waitFor();
      await dialog
        .getByRole("combobox", { name: "Environment", exact: true })
        .getByText("byoc-workers · Self-hosted")
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
    id: "deployment-create-selected",
    route: "/deployments",
    fixture: "selected Agent and Environment retain their display names",
    description: "Creation choices after their option popups unmount.",
    setup: async (page) => {
      await page
        .getByRole("button", { name: "Create deployment", exact: true })
        .click();
      const dialog = page.getByRole("dialog");
      await dialog
        .getByRole("combobox", { name: "Agent", exact: true })
        .click();
      await page
        .getByRole("option", { name: /General task agent · v1/ })
        .click();
      await dialog
        .getByRole("combobox", { name: "Environment", exact: true })
        .click();
      await page.getByRole("option", { name: /byoc-workers/ }).click();
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
      "Legacy edit URL redirects to inline configuration, preserving write-only resource credentials.",
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
      "A refused collection read: the existing calm ErrorState quotes the platform, while navigation drops only the denied entry. This is not an absent feature.",
    setup: async (page) => {
      await page.request.post(`${MOCK_URL}/__forbid`, {
        data: { paths: ["v1/skills"] },
      });
      await page.reload();
      await page.getByTestId("error-state").waitFor();
    },
  },
  // The native mock session supplies presentation state. The mock injects the
  // refusals; these states do not establish the platform's stored-role mapping.
  ...["dashboard", "palette", "bookmark"].map((view): Surface => ({
    id: "read-denied-" + view,
    mode: "sso",
    route: view === "bookmark" ? `/skills/${SKILL}` : "/dashboard",
    fixture: "native mock session with injected resource-read permission_error",
    description:
      "No resource entry points after refused reads; direct bookmarks explain the refusal: " +
      view,
    setup: async (page) => {
      const refused = await page.request.post(`${MOCK_URL}/__forbid`, {
        data: { paths: ["v1/", "api/console/", "admin/v1/"] },
      });
      if (!refused.ok()) throw new Error("Cannot stage denied reads");
      await page.reload();
      await page.waitForFunction(
        () =>
          !document.querySelector("nav [data-nav-group], nav a[data-surface]"),
      );
      await page
        .locator('[data-testid="connection-dot"][data-state="denied"]')
        .waitFor();
      if (view === "bookmark") {
        await page
          .locator('[data-testid="error-state"][data-denied="true"]')
          .waitFor();
      } else {
        await page.waitForFunction(
          () => !document.querySelector("[data-dashboard-card]"),
        );
        if (view === "palette") {
          await page.keyboard.press("Control+k");
          await page
            .getByRole("option", { name: "Dashboard", exact: true })
            .waitFor();
          if ((await page.getByRole("option").count()) !== 1)
            throw new Error("Denied resource in palette");
        }
      }
      // Resolve against this page, not the walker's password-mode baseURL.
      const write = await browserPost(
        page,
        new URL("/api/organizations/default/proxy/v1/agents", page.url()).href,
        { data: {} },
      );
      if (write.status() !== 403)
        throw new Error("Expected injected write refusal");
      const session = await page.request.get(
        new URL("/api/auth/session", page.url()).href,
      );
      if (!session.ok() || !(await session.json()).signed_in)
        throw new Error("403 ended identity session");
    },
  })),
  {
    id: "api-keys-denied",
    mode: "sso",
    route: "/api-keys",
    fixture: "stub OIDC session; management-key collection alone refuses reads",
    description:
      "Admin-only key refusal leaves readable resource navigation intact.",
    setup: async (page) => {
      const refused = await page.request.post(`${MOCK_URL}/__forbid`, {
        data: { paths: ["api/console/organizations/default/workspaces"] },
      });
      if (!refused.ok()) throw new Error("Cannot stage denied API keys");
      await page.reload();
      await page
        .locator('[data-testid="error-state"][data-denied="true"]')
        .waitFor();
      await page
        .locator('nav [data-surface="api-keys"]')
        .waitFor({ state: "detached" });
      await page
        .locator('nav [data-nav-group="Agents"]')
        .waitFor({ state: "attached" });
      const session = await page.request.get(
        new URL("/api/auth/session", page.url()).href,
      );
      if (!session.ok() || !(await session.json()).signed_in)
        throw new Error("403 ended identity session");
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
  // because it is the write-only-secret form. `model-edit` earns one for its
  // routing tiers, `model-setup` for its step list and `provider-add` for its
  // vendor grid, layouts no other dialog has; `provider-key-add` for the gateway's write-only key, and
  // `upstream-model-edit` for its price grid.
  {
    id: "model-edit",
    route: "/models?model=agent-default",
    fixture: "agent-default",
    description:
      "Edit routing: tiers of upstream models with weights and shares, add a target or a fallback tier.",
    setup: async (page) => {
      await page
        .getByRole("button", { name: "Edit routing", exact: true })
        .click();
    },
  },
  {
    id: "model-setup",
    route: "/models",
    fixture: "a gateway with no models",
    description:
      "First-run setup: the empty-gateway callout and the one form that makes a provider, its key, an upstream model and a model.",
    setup: async (page) => {
      const emptied = await page.request.post(MOCK_URL + "/__empty-gateway");
      if (!emptied.ok()) throw new Error("Could not empty the mock gateway");
      await page.reload();
      await page
        .getByRole("button", { name: "Set up a model", exact: true })
        .click();
      const dialog = page.getByRole("dialog", { name: "Set up a model" });
      await dialog.getByLabel("Vendor").selectOption("minimax");
      await dialog.getByLabel("Upstream model ID").fill("MiniMax-M3");
    },
  },
  {
    id: "provider-add",
    route: "/providers",
    fixture: "the mock gateway's profiles",
    description:
      "Add provider: the vendor grid, the region switch a two-site vendor shows, and its prefilled endpoints.",
    setup: async (page) => {
      await page
        .getByRole("button", { name: "Add provider", exact: true })
        .first()
        .click();
      await page.locator("[role=dialog] [data-profile=minimax]").click();
    },
  },
  {
    id: "provider-key-add",
    route: `/providers/${PROVIDER}`,
    fixture: PROVIDER,
    description:
      "Add key: a write-only vendor key, its protocols and weight. The gateway seals it.",
    setup: async (page) => {
      await page.getByRole("button", { name: "Add key", exact: true }).click();
      await page.getByLabel("API key").fill("sk-fidelity-0123456789");
    },
  },
  {
    id: "upstream-model-edit",
    route: `/providers/${PROVIDER}`,
    fixture: "gwdep_dspro0001",
    description:
      "Edit upstream model: the id and kind fixed at creation, capabilities, and the four prices.",
    setup: async (page) => {
      await page
        .getByRole("button", { name: "Edit deepseek-v4-pro", exact: true })
        .click();
    },
  },
  {
    id: "command-palette",
    route: "/agents",
    fixture: "all resources, searched",
    description:
      "Ctrl+K overlay: grouped options over the whole resource space.",
    setup: async (page) => {
      await page.keyboard.press("Control+k");
      await page
        .getByRole("combobox", { name: "Search pages and resources" })
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
    fixture:
      "one owned service-account key and one inactive historical unowned key",
    description:
      "Search, filters, a live count and sortable columns above owned and historical keys.",
    setup: async (page) => {
      await page
        .getByRole("button", { name: "ci-deploy", exact: true })
        .waitFor();
      await page.locator('[data-visible-count="2"]').waitFor();
    },
  },
  {
    id: "api-key-archived-only",
    route: "/api-keys",
    fixture: "workspace containing only archived keys",
    description: "The Keys page shows its empty state and a count of zero.",
    setup: async (page) => {
      await page.route(
        "**/api/console/organizations/default/workspaces/default/api_keys",
        async (route) => {
          const response = await route.fetch();
          const keys: ApiKeyListItem[] = await response.json();
          await route.fulfill({
            json: keys.map((key) => ({ ...key, status: "archived" })),
          });
        },
      );
      await page.reload();
      await page.getByText("No API keys yet.", { exact: true }).waitFor();
      await page.locator('[data-visible-count="0"]').waitFor();
    },
  },
  {
    id: "api-key-filtered",
    route: "/api-keys",
    fixture: "one disabled historical key",
    description: "A selected status, the matching count and Reset.",
    setup: async (page) => {
      await page.getByRole("combobox", { name: "Status", exact: true }).click();
      await page.getByRole("option", { name: "Disabled", exact: true }).click();
      await page.locator('[data-visible-count="1"]').waitFor();
    },
  },
  {
    id: "api-key-empty-search",
    route: "/api-keys",
    fixture: "search that matches neither seeded key",
    description: "No matching results while a search is applied.",
    setup: async (page) => {
      await page
        .getByRole("searchbox", { name: "Search keys" })
        .fill("no-such-key");
      await page.getByText("No matching API keys", { exact: true }).waitFor();
    },
  },
  ...[false, true].map((mobile) => ({
    id: mobile ? "api-key-details-mobile" : "api-key-details",
    route: "/api-keys",
    fixture: "ci-deploy service-account key",
    description:
      "Key metadata, resource ID, model access and adjacent-key controls.",
    setup: async (page: Page) => {
      if (mobile) await page.setViewportSize({ width: 390, height: 844 });
      await page
        .getByRole("button", { name: "ci-deploy", exact: true })
        .click();
      await page.getByRole("dialog", { name: "ci-deploy" }).waitFor();
    },
  })),
  {
    id: "api-key-delete-menu",
    route: "/api-keys",
    fixture: "ci-deploy action menu",
    description: "Cost, disable and delete actions for an active key.",
    setup: async (page) => {
      const menu = await openApiKeyMenu(page, "ci-deploy");
      await menu.getByRole("menuitem", { name: "Delete API key" }).waitFor();
    },
  },
  {
    id: "api-key-delete-confirm",
    route: "/api-keys",
    fixture: "ci-deploy awaiting deletion confirmation",
    description:
      "Deletion names the key and explains immediate, irreversible revocation.",
    setup: async (page) => {
      const menu = await openApiKeyMenu(page, "ci-deploy");
      await menu.getByRole("menuitem", { name: "Delete API key" }).click();
      await page
        .getByRole("button", { name: "Delete API key", exact: true })
        .waitFor();
    },
  },
  {
    id: "api-key-cost",
    route: "/api-keys",
    fixture: "ci-deploy current-month gateway usage",
    description:
      "View cost opens the usage page filtered to this credential and period.",
    setup: async (page) => {
      const menu = await openApiKeyMenu(page, "ci-deploy");
      await menu.getByRole("menuitem", { name: "View cost" }).click();
      await page.getByRole("combobox", { name: "Key", exact: true }).waitFor();
    },
  },
  {
    id: "api-key-connect",
    route: "/api-keys",
    fixture: "supported self-hosted authentication methods",
    description: "The first step offers CLI sign-in or an API key.",
    setup: async (page) => {
      await page.getByRole("button", { name: "Create key" }).click();
      await page.getByRole("button", { name: "Your own machine" }).waitFor();
    },
  },
  {
    id: "api-key-cli",
    route: "/api-keys",
    fixture: "interactive CLI sign-in",
    description: "A copyable login command for the current Console origin.",
    setup: async (page) => {
      await page.getByRole("button", { name: "Create key" }).click();
      await page
        .getByRole("button", { name: "Your own machine", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Copy sign-in command" })
        .waitFor();
    },
  },
  {
    id: "api-key-create",
    route: "/api-keys",
    fixture: "empty dialog form",
    description: "Name, expiry, linked account and the platform's fixed scope.",
    setup: async (page) => {
      const form = await openApiKeyForm(page);
      await form.waitFor();
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
    fixture: "blank configuration form",
    description: "The list opens the standalone configuration editor.",
    setup: async (page) => {
      await page.getByRole("link", { name: "Create agent" }).first().click();
      await page.getByRole("heading", { name: "Create agent" }).waitFor();
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
        .getByRole("link", { name: "Create agent", exact: true })
        .click();
      await page
        .getByLabel("Name", { exact: true })
        .fill("Unsaved agent draft");
      await page.getByRole("button", { name: "Cancel", exact: true }).click();
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
      await page.getByRole("link", { name: "Create agent" }).first().click();
      await page.getByRole("heading", { name: "Create agent" }).waitFor();
      await page.getByRole("button", { name: "Tools", exact: true }).click();
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
      await page.getByRole("button", { name: "Skills", exact: true }).click();
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
        .getByRole("link", { name: "Create agent", exact: true })
        .click();
      await page.getByRole("button", { name: "Tools", exact: true }).click();
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
    id: "agent-archive-pending",
    route: `/agents/${AGENT}`,
    fixture: AGENT,
    description:
      "An archive-only action menu cannot reopen while its request is pending.",
    setup: async (page) => {
      await page.route(
        "**/api/organizations/default/proxy/v1/agents/*/archive",
        async (route) => {
          await new Promise<void>((resolve) =>
            page.once("close", () => resolve()),
          );
          await route.abort().catch(() => {});
        },
      );
      await page
        .getByRole("main")
        .getByRole("button", { name: "More actions" })
        .click();
      await page.getByRole("menuitem", { name: "Archive" }).click();
      await page.getByRole("button", { name: "Archive agent" }).click();
      await page.getByRole("dialog").waitFor({ state: "hidden" });
      await page
        .locator('button[aria-label="More actions"]:disabled')
        .waitFor();
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
    id: "sign-out-unconfirmed",
    route: "/members",
    fixture: "unavailable logout endpoint",
    description:
      "Retry sign-out surface when the platform cannot confirm revocation. Private console content is hidden.",
    setup: async (page) => {
      await page.route("**/api/auth/logout", (route) =>
        route.fulfill({ status: 503 }),
      );
      await page.getByRole("button", { name: "Account menu" }).click();
      await page.getByTestId("sign-out").click();
      await page
        .locator('[data-native-identity="sign-out-unconfirmed"]')
        .waitFor();
    },
  },
  {
    id: "sign-out-account-changed",
    route: "/members",
    fixture: "replacement account metadata",
    description:
      "Reopen console action after the active account changes during sign-out.",
    setup: async (page) => {
      await page.evaluate(() => {
        const fetcher = window.fetch;
        window.fetch = (input, init) => {
          // The sign-out metadata check has a timeout signal. Leave the
          // console's background session query on the signed-in fixture.
          if (input === "/api/auth/session" && init?.signal)
            return Promise.resolve(
              Response.json({
                signed_in: true,
                id: "user_replacement_fixture",
                csrf_token: "unused-fidelity-fixture",
              }),
            );
          return fetcher(input, init);
        };
      });
      await page.getByRole("button", { name: "Account menu" }).click();
      await page.getByTestId("sign-out").click();
      await page
        .locator('[data-native-identity="sign-out-account-changed"]')
        .waitFor();
    },
  },
  {
    id: "login",
    route: "/login",
    fixture: "n/a",
    description:
      "Native password login with a named account and a first-admin setup link.",
  },
  {
    id: "login-invalid",
    route: "/login",
    fixture: "n/a",
    description:
      "Native password login after refused credentials, with the platform error announced as an alert.",
    setup: async (page) => {
      await page.getByLabel("Login name").fill("operator");
      await page.getByLabel("Password").fill("not-the-password");
      await page.getByRole("button", { name: "Sign in" }).click();
      // The border and the sentence appear together; wait on the sentence.
      await page.getByText("invalid login name or password").waitFor();
    },
  },

  // Login IDs retain their visible state while moving authority to the platform.
  {
    id: "login-sso",
    mode: "sso",
    route: "/login",
    fixture: "n/a",
    description:
      "Native OIDC sign-in offer: one SSO link and a setup link, with no password field. The real RP is covered by the native tier.",
  },
  {
    id: "account-offline",
    route: "/dashboard",
    fixture: "signed-in browser offline after loading the dashboard",
    description:
      "The account indicator turns red and the menu explains the outage.",
    setup: async (page) => {
      await page.context().setOffline(true);
      await page
        .locator('[data-testid="connection-dot"][data-state="down"]')
        .waitFor();
      await page.getByRole("button", { name: "Account menu" }).click();
      await page.getByText("Network offline").waitFor();
    },
  },
  {
    id: "account-block",
    mode: "sso",
    route: "/agents",
    fixture:
      "3 agents, one archived — the list is the backdrop, not the subject",
    description:
      "The account panel lists the Platform and Console builds above Sign out. The avatar indicates connectivity.",
    setup: async (page) => {
      await page.getByRole("button", { name: "Account menu" }).click();
      await page.getByRole("dialog", { name: "Account settings" }).waitFor();
    },
  },
];
