import "@testing-library/jest-dom/vitest";
import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  deploymentRuns,
  sessions,
  environments,
} from "../../../test/mock-platform/fixtures.mjs";
import type { DeploymentRun } from "@/lib/platform/types";
import { DeploymentRunInspector } from "./deployment-run-inspector";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function setup({
  failed = false,
  missingSession = false,
  foreign = false,
  missingRun = false,
} = {}) {
  const run = {
    ...structuredClone(deploymentRuns[failed ? 1 : 0]),
    session_id: failed ? null : sessions[0].id,
  } as DeploymentRun;
  const session = { ...sessions[0], deployment_id: run.deployment_id };
  const fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/deployment_runs/"))
      return missingRun
        ? Response.json(
            { error: { type: "not_found_error", message: "Run not found" } },
            { status: 404 },
          )
        : Response.json(run);
    if (url.includes("/events"))
      return Response.json({ data: [], next_page: null });
    if (url.includes("/environments/")) return Response.json(environments[0]);
    if (missingSession)
      return Response.json(
        { error: { type: "not_found_error", message: "Session not found" } },
        { status: 404 },
      );
    return Response.json(session);
  });
  vi.stubGlobal("fetch", fetch);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <DeploymentRunInspector
        deploymentId={foreign ? "depl_other" : run.deployment_id}
        id={run.id}
        onClose={vi.fn()}
        onSelect={vi.fn()}
      />
    </QueryClientProvider>,
  );
  return { run, session, fetch };
}

it("inspects the run's Session and retains run context in Open and API views", async () => {
  const { run, session } = setup();
  const pane = await screen.findByRole("region", { name: "Session details" });
  await within(pane).findByRole("heading", { name: session.title });
  expect(within(pane).getByRole("link", { name: "Open" })).toHaveAttribute(
    "href",
    `/sessions/${session.id}?from_deployment=${run.deployment_id}&from_run=${run.id}`,
  );
  expect(pane.querySelector("[data-run-result]")).toHaveAttribute(
    "data-run-result",
    "succeeded",
  );
  expect(within(pane).getByText("Session created")).toBeVisible();
  await userEvent.click(within(pane).getByRole("button", { name: "API" }));
  expect(pane.querySelector("pre")).toHaveTextContent(run.id);
});

it("keeps a failed scheduled run with no Session inspectable", async () => {
  const { run } = setup({ failed: true });
  const pane = await screen.findByRole("region", {
    name: "Deployment run details",
  });
  await within(pane).findByText(run.error!.message);
  expect(pane.querySelector("[data-trigger-type]")).toHaveAttribute(
    "data-trigger-type",
    "schedule",
  );
  expect(pane.querySelector("[data-run-result]")).toHaveAttribute(
    "data-run-result",
    "failed",
  );
  await userEvent.click(within(pane).getByText("Run API response"));
  expect(pane.querySelector("pre")).toHaveTextContent(run.id);
});

it("retains run metadata after its Session has been deleted", async () => {
  const { run } = setup({ missingSession: true });
  expect(await screen.findByTestId("error-state")).toHaveAttribute(
    "data-error-status",
    "404",
  );
  expect(document.querySelector("[data-run-id]")).toHaveAttribute(
    "data-run-id",
    run.id,
  );
});

it.each([{ foreign: true }, { missingRun: true }])(
  "keeps an unavailable run inside the inspector without loading a Session: %j",
  async (options) => {
    const { fetch } = setup(options);
    await waitFor(() =>
      expect(screen.getByTestId("error-state")).toHaveAttribute(
        "data-error-status",
        "404",
      ),
    );
    expect(
      fetch.mock.calls.every(
        ([input]) => !String(input).includes("/sessions/"),
      ),
    ).toBe(true);
  },
);
