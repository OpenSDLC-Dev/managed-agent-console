import "@testing-library/jest-dom/vitest";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  agents,
  deployments,
  environments,
  files,
  memoryStores,
  vaults,
} from "../../../test/mock-platform/fixtures.mjs";
import type { Deployment } from "@/lib/platform/types";
import { DeploymentInspector } from "./deployment-inspector";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
const failed = (status = 404) =>
  json(
    {
      type: "error",
      error: { type: "not_found_error", message: "Unavailable resource" },
    },
    status,
  );
function setup(
  deployment: Deployment = deployments[0] as Deployment,
  missing?: "deployment" | "related",
) {
  const fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), "http://console.test");
    const path = url.pathname;
    if (path.endsWith(`/deployments/${deployment.id}`))
      return missing === "deployment" ? failed() : json(deployment);
    if (missing === "related") return failed(403);
    if (path.endsWith(`/agents/${deployment.agent.id}`)) {
      expect(url.searchParams.get("version")).toBe(
        String(deployment.agent.version),
      );
      return json(agents[0]);
    }
    if (path.endsWith(`/environments/${deployment.environment_id}`))
      return json(environments[0]);
    if (path.endsWith(`/files/${files[0].id}`)) return json(files[0]);
    if (path.endsWith(`/memory_stores/${memoryStores[0].id}`))
      return json(memoryStores[0]);
    if (path.endsWith(`/vaults/${vaults[0].id}`)) return json(vaults[0]);
    throw new Error(`Unexpected request: ${path}`);
  });
  vi.stubGlobal("fetch", fetch);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <DeploymentInspector
        id={deployment.id}
        onClose={vi.fn()}
        onSelect={vi.fn()}
      />
    </QueryClientProvider>,
  );
  return fetch;
}

it("renders resolved resources, pinned Agent metadata and server-provided upcoming runs", async () => {
  const fetch = setup();
  const panel = screen.getByRole("region", { name: "Deployment details" });
  expect(
    await within(panel).findByRole("heading", { name: deployments[0].name }),
  ).toBeVisible();
  expect(
    await within(panel).findByRole("link", { name: /Deep researcher/ }),
  ).toHaveAttribute(
    "href",
    `/agents/${deployments[0].agent.id}?version=${deployments[0].agent.version}`,
  );
  expect(
    await within(panel).findByRole("link", { name: files[0].filename }),
  ).toBeVisible();
  expect(
    await within(panel).findByRole("link", { name: memoryStores[0].name }),
  ).toBeVisible();
  expect(
    within(panel).getByRole("heading", { name: "Initial message" }),
  ).toBeVisible();
  for (const at of deployments[0].schedule!.upcoming_runs_at)
    expect(within(panel).getByTitle(at)).toBeVisible();
  expect(panel.querySelector("[data-access]")).toHaveAttribute(
    "data-access",
    "read_write",
  );
  await userEvent.click(within(panel).getByRole("button", { name: "API" }));
  expect(panel.querySelector("pre")).toHaveTextContent('"upcoming_runs_at"');
  await userEvent.click(
    within(panel).getByRole("button", { name: "Rendered" }),
  );
  expect(within(panel).getByRole("heading", { name: "Trigger" })).toBeVisible();
  expect(
    fetch.mock.calls.every(([url]) => !String(url).includes("/versions")),
  ).toBe(true);
});

it("retains advanced events and repository configuration without flattening them", async () => {
  setup({
    ...deployments[1],
    initial_events: [
      { type: "system.message", content: "Keep the complete configuration" },
    ],
    resources: [
      {
        type: "github_repository",
        url: "https://github.com/example/project",
        mount_path: "/mnt/repo",
        checkout: { type: "commit", sha: "abc123" },
      },
    ],
  } as Deployment);
  expect(
    await screen.findByRole("heading", { name: "Initial events" }),
  ).toBeVisible();
  expect(screen.getByText(/Keep the complete configuration/)).toBeVisible();
  expect(
    screen.getByRole("link", { name: "https://github.com/example/project" }),
  ).toBeVisible();
  expect(screen.getByText("abc123")).toBeVisible();
  expect(screen.queryByText("Next runs")).not.toBeInTheDocument();
  expect(screen.queryByText("Budget")).not.toBeInTheDocument();
});

it("keeps archived details readable when related metadata is forbidden", async () => {
  setup(
    {
      ...deployments[0],
      archived_at: "2026-09-12T00:00:00Z",
      schedule: { ...deployments[0].schedule!, upcoming_runs_at: [] },
    } as Deployment,
    "related",
  );
  expect(
    await screen.findByRole("heading", { name: deployments[0].name }),
  ).toBeVisible();
  expect(screen.getByRole("link", { name: "Open" })).toHaveAttribute(
    "href",
    `/deployments/${deployments[0].id}`,
  );
  expect(screen.getByText("No upcoming runs.")).toBeVisible();
  expect(document.querySelector("[data-status]")).toHaveAttribute(
    "data-status",
    "archived",
  );
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("shows a missing deployment inside the inspector", async () => {
  setup(deployments[0] as Deployment, "deployment");
  expect(await screen.findByTestId("error-state")).toHaveTextContent(
    "Unavailable resource",
  );
  expect(screen.getByRole("button", { name: "Close details" })).toBeVisible();
});
