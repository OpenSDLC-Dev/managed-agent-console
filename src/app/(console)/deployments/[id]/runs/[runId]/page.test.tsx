import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Suspense } from "react";
import DeploymentRunPage from "./page";
import { deploymentRuns } from "../../../../../../../test/mock-platform/fixtures.mjs";

function params(id: string, runId: string) {
  const value = { id, runId };
  return {
    status: "fulfilled",
    value,
    then: (done: (resolved: { id: string; runId: string }) => void) =>
      done(value),
  } as unknown as Promise<{ id: string; runId: string }>;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderRun(routeDeploymentId: string) {
  const run = deploymentRuns[1];
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json(run, {
        status: 200,
      }),
    ),
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <Suspense fallback={null}>
        <DeploymentRunPage params={params(routeDeploymentId, run.id)} />
      </Suspense>
    </QueryClientProvider>,
  );
  return run;
}

describe("DeploymentRunPage", () => {
  it("renders a stored run error under its deployment", async () => {
    const run = renderRun(deploymentRuns[1].deployment_id);
    expect(await screen.findByText(run.error!.message)).toBeInTheDocument();
    expect(screen.getByTestId("deployment-run-error")).toBeInTheDocument();
  });

  it("returns not found when the run belongs to another deployment", async () => {
    renderRun("depl_another000000000001");
    expect(
      await screen.findByText("deployment run not found"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("error-state")).toHaveAttribute(
      "data-error-status",
      "404",
    );
  });
});
