import "@testing-library/jest-dom/vitest";
import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, Suspense } from "react";
import { useTestSearchParams } from "../../../../../test/search-params";
import {
  agents,
  sessions,
  deployments,
} from "../../../../../test/mock-platform/fixtures.mjs";
import { UnsavedChangesProvider } from "@/components/shell/unsaved-changes";
import type { Agent } from "@/lib/platform/types";
import AgentDetailPage from "./page";

vi.mock("next/navigation", () => ({
  useSearchParams: () => useTestSearchParams(),
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    refresh: vi.fn(),
  }),
}));
vi.mock("@/components/ui/select", async () => {
  const React = await import("react");
  const Ctx = React.createContext<{
    value?: string;
    onValueChange?: (value: string) => void;
  }>({});
  return {
    Select: ({
      value,
      onValueChange,
      children,
    }: {
      value?: string;
      onValueChange?: (value: string) => void;
      children: React.ReactNode;
    }) => (
      <Ctx.Provider value={{ value, onValueChange }}>{children}</Ctx.Provider>
    ),
    SelectTrigger: ({
      children,
      disabled,
      "aria-label": label,
    }: {
      children: React.ReactNode;
      disabled?: boolean;
      "aria-label"?: string;
    }) => (
      <button disabled={disabled} aria-label={label}>
        {children}
      </button>
    ),
    SelectValue: ({ children }: { children?: React.ReactNode }) => {
      const ctx = React.useContext(Ctx);
      return <span>{children ?? ctx.value}</span>;
    },
    SelectContent: ({ children }: { children: React.ReactNode }) => (
      <div>{children}</div>
    ),
    SelectItem: ({
      value,
      children,
    }: {
      value: string;
      children: React.ReactNode;
    }) => {
      const ctx = React.useContext(Ctx);
      return (
        <button onClick={() => ctx.onValueChange?.(value)}>{children}</button>
      );
    },
  };
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function setup({
  search = "",
  failSave = false,
  failVersions = false,
  archived = false,
  missing = false,
} = {}) {
  history.replaceState(null, "", "/agents/" + agents[0].id + search);
  let head = {
    ...structuredClone(agents[0]),
    archived_at: archived ? "2026-09-12T00:00:00Z" : null,
  } as Agent;
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), location.origin);
    const error = (message: string, status: number) =>
      Response.json({ error: { type: "api_error", message } }, { status });
    if (url.pathname.endsWith("/versions"))
      return failVersions
        ? error("Versions unavailable", 500)
        : Response.json({
            data: url.searchParams.has("page")
              ? [{ ...head, version: 1 }]
              : [head, { ...head, version: 2 }],
            next_page: url.searchParams.has("page") ? null : "older",
          });
    if (url.pathname.endsWith("/archive")) {
      if (init?.method !== "POST") return error("Method not allowed", 405);
      head = { ...head, archived_at: "2026-09-12T00:00:00Z" };
      return Response.json(head);
    }
    if (url.pathname.endsWith("/" + head.id)) {
      if (missing) return error("Agent not found", 404);
      if (init?.method === "POST") {
        if (failSave) return error("Concurrent update", 409);
        head = {
          ...head,
          ...JSON.parse(String(init.body)),
          version: head.version + 1,
        };
        return Response.json(head);
      }
      if (url.searchParams.has("version")) {
        if (url.searchParams.get("version") === "2")
          return Response.json({
            ...head,
            version: 2,
            description: "Historical description",
          });
        return error("Version not found", 404);
      }
      return Response.json(head);
    }
    if (url.pathname.endsWith("/agents"))
      return Response.json({ data: [head, agents[1]], next_page: null });
    if (url.pathname.endsWith("/sessions"))
      return Response.json({
        data: sessions.filter((row) => row.agent.id === head.id),
        next_page: null,
      });
    if (url.pathname.endsWith("/deployments"))
      return Response.json({
        data: deployments.filter((row) => row.agent.id === head.id),
        next_page: null,
      });
    return Response.json({ data: [], next_page: null });
  });
  vi.stubGlobal("fetch", fetch);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const value = { id: head.id };
  const params = {
    status: "fulfilled",
    value,
    then: (resolve: (value: { id: string }) => void) => resolve(value),
  } as unknown as Promise<{ id: string }>;
  render(
    <QueryClientProvider client={client}>
      <UnsavedChangesProvider>
        <Suspense fallback={null}>
          <AgentDetailPage params={params} />
        </Suspense>
      </UnsavedChangesProvider>
    </QueryClientProvider>,
  );
  return { fetch, client, head };
}
it("opens editable configuration and preserves the full server version on save", async () => {
  const { fetch } = setup();
  await screen.findByRole("heading", { name: "Deep researcher" });
  expect(screen.getByLabelText("Name")).toHaveValue("Deep researcher");
  expect(screen.queryByRole("button", { name: "Save new version" })).toBeNull();
  fireEvent.change(screen.getByLabelText("Description"), {
    target: { value: "Inline edit" },
  });
  await userEvent.click(
    screen.getByRole("button", { name: "Save new version" }),
  );
  await waitFor(() =>
    expect(
      screen.queryByRole("button", { name: "Save new version" }),
    ).toBeNull(),
  );
  expect(screen.getByLabelText("Description")).toHaveValue("Inline edit");
  const save = fetch.mock.calls.find(([, init]) => init?.method === "POST");
  expect(JSON.parse(String(save?.[1]?.body))).toMatchObject({
    version: 3,
    description: "Inline edit",
  });
  expect(
    screen.getByRole("button", { name: "Agent version" }),
  ).toHaveTextContent("Version: 4");
});
it("keeps the draft and its base version after a background update and conflict", async () => {
  const { client, head, fetch } = setup({ failSave: true });
  await screen.findByLabelText("Description");
  fireEvent.change(screen.getByLabelText("Description"), {
    target: { value: "Local draft" },
  });
  act(() =>
    client.setQueryData(["agent", head.id], {
      ...head,
      version: 4,
      description: "Remote edit",
    }),
  );
  expect(screen.getByLabelText("Description")).toHaveValue("Local draft");
  expect(
    screen.getByRole("button", { name: "Agent version" }),
  ).toHaveTextContent("Version: 3");
  await userEvent.click(
    screen.getByRole("button", { name: "Save new version" }),
  );
  await screen.findByText(/Someone else updated/);
  expect(
    JSON.parse(
      String(
        fetch.mock.calls.find(([, init]) => init?.method === "POST")?.[1]?.body,
      ),
    ).version,
  ).toBe(3);
  expect(screen.getByLabelText("Description")).toHaveValue("Local draft");
  await userEvent.click(screen.getByRole("button", { name: "Discard" }));
  expect(screen.getByLabelText("Description")).toHaveValue(head.description);
  expect(screen.queryByText(/Someone else updated/)).toBeNull();
});
it("reads historical versions without editing and exposes the selected version to Start session", async () => {
  setup({ search: "?version=2" });
  await screen.findByDisplayValue("Historical description");
  expect(screen.getByLabelText("Name")).toBeDisabled();
  await userEvent.click(screen.getByRole("button", { name: "Start session" }));
  expect(
    document.querySelector("[data-session-agent-version]"),
  ).toHaveAttribute("data-session-agent-version", "2");
  await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
  await userEvent.click(screen.getByRole("radio", { name: "raw" }));
  expect(screen.getByLabelText("Raw agent config")).toHaveAttribute("readonly");
  expect(screen.queryByRole("button", { name: "Save new version" })).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "v3 Latest" }));
  await waitFor(() => expect(screen.getByLabelText("Name")).toBeEnabled());
});
it("guards configuration changes before switching the version or related tab", async () => {
  setup();
  await screen.findByLabelText("Description");
  fireEvent.change(screen.getByLabelText("Description"), {
    target: { value: "Draft" },
  });
  await userEvent.click(
    await screen.findByRole("button", { name: /v2 · Created/ }),
  );
  await screen.findByRole("dialog", { name: "Unsaved changes" });
  await userEvent.click(screen.getByRole("button", { name: "Stay" }));
  expect(location.search).toBe("");
  expect(screen.getByLabelText("Description")).toHaveValue("Draft");
  await userEvent.click(screen.getByRole("button", { name: "sessions" }));
  await userEvent.click(await screen.findByRole("button", { name: "Leave" }));
  await screen.findByRole("region", { name: "Agent sessions" });
  expect(location.search).toBe("?tab=sessions");
});
it("uses server filters for related sessions and deployments", async () => {
  const { fetch } = setup({ search: "?tab=sessions&version=2" });
  await screen.findByRole("region", { name: "Agent sessions" });
  await waitFor(() =>
    expect(
      fetch.mock.calls.some(
        ([input]) =>
          String(input).includes("agent_version=2") &&
          String(input).includes("agent_id=" + agents[0].id),
      ),
    ).toBe(true),
  );
  await userEvent.click(screen.getByRole("button", { name: "deployments" }));
  await screen.findByRole("region", { name: "Agent deployments" });
  await waitFor(() =>
    expect(
      fetch.mock.calls.some(
        ([input]) =>
          String(input).includes("/deployments?") &&
          String(input).includes("agent_id=" + agents[0].id),
      ),
    ).toBe(true),
  );
});
it("retains configuration when loading version history fails", async () => {
  setup({ failVersions: true });
  await screen.findByText("Versions unavailable");
  expect(screen.getByLabelText("Name")).toBeEnabled();
});
it("loads another server page of versions", async () => {
  const { fetch } = setup();
  await userEvent.click(
    await screen.findByRole("button", { name: "Load older versions" }),
  );
  await waitFor(() =>
    expect(
      fetch.mock.calls.some(([input]) => String(input).includes("page=older")),
    ).toBe(true),
  );
});
it("shows missing resource and missing version errors", async () => {
  setup({ search: "?version=999" });
  expect(await screen.findByText("Version not found")).toBeVisible();
  expect(screen.getByRole("button", { name: "Agent version" })).toBeVisible();
});
it("shows the resource error without an editor", async () => {
  setup({ missing: true });
  expect(await screen.findByText("Agent not found")).toBeVisible();
  expect(screen.queryByLabelText("Name")).toBeNull();
});
it("archives with confirmation and then renders configuration read-only", async () => {
  setup();
  await screen.findByLabelText("Name");
  await userEvent.click(screen.getByRole("button", { name: "More actions" }));
  await userEvent.click(screen.getByRole("menuitem", { name: "Archive" }));
  await userEvent.click(screen.getByRole("button", { name: "Archive agent" }));
  await screen.findByText("Archived");
  expect(screen.getByLabelText("Name")).toBeDisabled();
  expect(screen.queryByRole("button", { name: "Start session" })).toBeNull();
});
