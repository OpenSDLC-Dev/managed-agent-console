import "@testing-library/jest-dom/vitest";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  sessions,
  environments,
  vaults,
  memoryResources,
  sessionEvents,
} from "../../../test/mock-platform/fixtures.mjs";
import type { Session, SessionEvent } from "@/lib/platform/types";
import { SessionInspector } from "./session-inspector";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function setup({
  missing = false,
  eventsError = false,
  empty = false,
  resources = false,
} = {}) {
  const base = structuredClone(sessions[0]) as Session;
  let session = {
    ...base,
    ...(resources
      ? {
          resources: structuredClone(memoryResources),
          vault_ids: [vaults[0].id],
          deployment_id: "depl_weeklyresearch000001",
        }
      : {}),
  } as Session;
  const events = empty
    ? []
    : (structuredClone(
        sessionEvents[base.id as keyof typeof sessionEvents],
      ) as SessionEvent[]);
  const onSelect = vi.fn();
  const onClose = vi.fn();
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://console.test");
    if (url.pathname.endsWith("/events"))
      return eventsError
        ? Response.json(
            { error: { type: "api_error", message: "Activity unavailable" } },
            { status: 500 },
          )
        : Response.json({ data: events, next_page: "older" });
    if (url.pathname.endsWith("/archive")) {
      if (init?.method !== "POST")
        return Response.json(
          { error: { message: "Method not allowed" } },
          { status: 405 },
        );
      session = { ...session, archived_at: "2026-09-12T00:00:00Z" };
      return Response.json(session);
    }
    if (url.pathname.includes("/environments/"))
      return Response.json(environments[1]);
    if (url.pathname.includes("/vaults/")) return Response.json(vaults[0]);
    if (init?.method === "DELETE")
      return Response.json({ id: base.id, type: "session_deleted" });
    if (missing)
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
      <SessionInspector
        id={base.id}
        previous="previous"
        next="next"
        onSelect={onSelect}
        onClose={onClose}
      />
    </QueryClientProvider>,
  );
  return { client, fetch, onSelect, onClose, session };
}

it("renders pinned resources and bounded activity without inventing runtime or billing stats", async () => {
  const { fetch, session } = setup({ resources: true });
  await screen.findByRole("heading", { name: session.title });
  expect(screen.queryByText("Duration", { exact: true })).toBeNull();
  expect(screen.queryByText("Active time", { exact: true })).toBeNull();
  expect(document.querySelector("[data-input-tokens]")).toHaveAttribute(
    "data-input-tokens",
    "5412",
  );
  expect(document.querySelector("[data-agent-version]")).toHaveAttribute(
    "data-agent-version",
    "1",
  );
  await screen.findByRole("link", { name: vaults[0].display_name });
  expect(
    screen.getByRole("link", { name: memoryResources[0].name }),
  ).toHaveAttribute(
    "href",
    "/memory-stores/" + memoryResources[0].memory_store_id,
  );
  expect(
    screen.getByRole("link", {
      name: session.agent.name + " · v" + session.agent.version,
    }),
  ).toHaveAttribute(
    "href",
    "/agents/" + session.agent.id + "?version=" + session.agent.version,
  );
  expect(screen.getByRole("link", { name: "Open" })).toHaveAttribute(
    "href",
    "/sessions/" + session.id,
  );
  expect(screen.queryByText("Cost", { exact: true })).toBeNull();
  await waitFor(() =>
    expect(document.querySelectorAll("[data-event-id]").length).toBeGreaterThan(
      0,
    ),
  );
  const eventCall = fetch.mock.calls.find(([input]) =>
    String(input).includes("/events"),
  );
  const params = new URL(String(eventCall?.[0]), "http://console.test")
    .searchParams;
  expect(params.get("order")).toBe("desc");
  expect(params.get("limit")).toBe("40");
  await userEvent.click(screen.getByRole("button", { name: "API" }));
  expect(screen.getByText(/"next_page": "older"/)).toBeVisible();
  expect(screen.getByText(/"stats":/)).toBeVisible();
});

it("retains empty activity and closes or traverses the visible page", async () => {
  const { onSelect, onClose } = setup({ empty: true });
  await screen.findByText("No events yet.");
  await userEvent.click(screen.getByRole("button", { name: "Next session" }));
  await userEvent.click(
    screen.getByRole("button", { name: "Previous session" }),
  );
  expect(onSelect.mock.calls).toEqual([["next"], ["previous"]]);
  await userEvent.click(screen.getByRole("button", { name: "Close details" }));
  expect(onClose).toHaveBeenCalledOnce();
});

it("shows missing sessions and allows the inspector to close", async () => {
  const { onClose } = setup({ missing: true });
  await screen.findByText("Session not found");
  await userEvent.click(screen.getByRole("button", { name: "Close details" }));
  expect(onClose).toHaveBeenCalledOnce();
});

it("keeps session details when only the activity endpoint fails", async () => {
  const { session } = setup({ eventsError: true });
  await screen.findByText("Activity unavailable");
  expect(screen.getByRole("heading", { name: session.title })).toBeVisible();
  expect(screen.queryByText("No events yet.")).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "API" }));
  expect(screen.getByText(/"stats":/)).toBeVisible();
  expect(screen.getByText("Activity unavailable")).toBeVisible();
});

it("archives in place and closes after deletion without resetting list filters", async () => {
  const { onClose } = setup();
  await screen.findByRole("heading", { name: sessions[0].title });
  await userEvent.click(screen.getByRole("button", { name: "More actions" }));
  await userEvent.click(screen.getByRole("menuitem", { name: "Archive" }));
  await userEvent.click(
    screen.getByRole("button", { name: "Archive session" }),
  );
  await screen.findByText("archived", { exact: true });
  await userEvent.click(screen.getByRole("button", { name: "More actions" }));
  await userEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
  await userEvent.click(screen.getByRole("button", { name: "Delete session" }));
  await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
});
