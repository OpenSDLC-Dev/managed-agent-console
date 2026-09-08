import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Suspense } from "react";
import DeploymentDetailPage from "./page";
import {
  deployments,
  deploymentRuns,
} from "../../../../../test/mock-platform/fixtures.mjs";

const push = vi.fn();
const LINKED_SESSION_ID = "sesn_linked000000000000001";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

function params(id: string): Promise<{ id: string }> {
  const value = { id };
  return {
    status: "fulfilled",
    value,
    then: (done: (value: { id: string }) => void) => done(value),
  } as unknown as Promise<{ id: string }>;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function setup() {
  const base = structuredClone(deployments[0]);
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (init?.method === "POST") {
      if (url.endsWith("/run"))
        return new Response(
          JSON.stringify({
            ...deploymentRuns[0],
            id: "drun_new",
            trigger_context: { type: "manual" },
          }),
          { status: 200 },
        );
      if (url.endsWith("/pause"))
        return new Response(
          JSON.stringify({
            ...base,
            status: "paused",
            paused_reason: { type: "manual" },
          }),
          { status: 200 },
        );
      if (url.endsWith("/unpause"))
        return new Response(
          JSON.stringify({ ...base, status: "active", paused_reason: null }),
          { status: 200 },
        );
      if (url.endsWith("/archive"))
        return new Response(
          JSON.stringify({ ...base, archived_at: "2026-09-01T00:00:00Z" }),
          { status: 200 },
        );
    }
    const payload = url.includes("deployment_runs")
      ? {
          data: [
            { ...deploymentRuns[0], session_id: LINKED_SESSION_ID },
            deploymentRuns[1],
          ],
        }
      : base;
    return new Response(JSON.stringify(payload), { status: 200 });
  });
  vi.stubGlobal("fetch", fetch);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <Suspense fallback={null}>
        <DeploymentDetailPage params={params(base.id)} />
      </Suspense>
    </QueryClientProvider>,
  );
  return { fetch, base };
}

describe("DeploymentDetailPage", () => {
  it("renders the contract and drives every lifecycle action", async () => {
    const { fetch, base } = setup();
    expect(
      await screen.findByRole("heading", { name: base.name }),
    ).toBeInTheDocument();
    expect(document.querySelector('[data-upcoming-count="4"]')).not.toBeNull();
    expect(screen.getByText("Show 1 more")).toBeInTheDocument();
    expect(screen.getByText("succeeded")).toBeInTheDocument();
    expect(screen.getByText("failed")).toBeInTheDocument();

    await userEvent.click(screen.getByText("Show 1 more"));
    expect(screen.getByText("Show less")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(push).toHaveBeenCalledWith(`/deployments/${base.id}/edit`);

    push.mockClear();
    await userEvent.click(
      screen.getByRole("link", { name: LINKED_SESSION_ID }),
    );
    expect(push).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(
      await screen.findByRole("button", { name: "Resume" }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Resume" }));
    expect(
      await screen.findByRole("button", { name: "Pause" }),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Run now" }));
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith(
        `/deployments/${base.id}/runs/drun_new`,
      ),
    );

    const rows = document.querySelectorAll("tbody tr");
    await userEvent.click(rows[0]);
    expect(push).toHaveBeenCalledWith(
      `/deployments/${base.id}/runs/${deploymentRuns[0].id}`,
    );

    await userEvent.click(screen.getByRole("button", { name: "More actions" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Archive" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Archive deployment" }),
    );
    await waitFor(() =>
      expect(screen.getAllByText("archived")).toHaveLength(2),
    );
    expect(screen.queryByRole("button", { name: "Run now" })).toBeNull();
    expect(
      fetch.mock.calls.filter(([, init]) => init?.method === "POST"),
    ).toHaveLength(4);
  });
});
