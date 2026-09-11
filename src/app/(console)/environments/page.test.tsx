import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import EnvironmentsPage from "./page";
import type { Environment } from "@/lib/platform/types";

const pushSpy = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushSpy,
    back: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => "/environments",
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

// Minimal harness for base-ui's portal Select (status-filter.test.tsx pattern).
vi.mock("@/components/ui/select", async () => {
  const React = await vi.importActual<typeof import("react")>("react");
  interface CtxShape {
    value: string;
    onValueChange: (value: string) => void;
  }
  const Ctx = React.createContext<CtxShape>({
    value: "",
    onValueChange: () => {},
  });
  return {
    Select: ({
      value,
      onValueChange,
      children,
    }: CtxShape & { children?: React.ReactNode }) =>
      React.createElement(
        Ctx.Provider,
        { value: { value, onValueChange } },
        children,
      ),
    SelectTrigger: (props: {
      children?: React.ReactNode;
      "aria-label"?: string;
    }) =>
      React.createElement(
        "button",
        { type: "button", "aria-label": props["aria-label"] },
        props.children,
      ),
    SelectValue: () => {
      const ctx = React.useContext(Ctx);
      return React.createElement(
        "span",
        { "data-testid": "select-value" },
        ctx.value,
      );
    },
    SelectContent: ({ children }: { children?: React.ReactNode }) =>
      React.createElement("div", null, children),
    SelectItem: ({
      value,
      children,
    }: {
      value: string;
      children?: React.ReactNode;
    }) => {
      const ctx = React.useContext(Ctx);
      return React.createElement(
        "button",
        { type: "button", onClick: () => ctx.onValueChange(value) },
        children,
      );
    },
  };
});

const environment = (
  over: Partial<Environment> & { id: string; name: string },
): Environment => ({
  type: "environment",
  description: "",
  config: { type: "self_hosted" },
  scope: "organization",
  metadata: {},
  created_at: "2026-08-01T09:12:00Z",
  updated_at: "2026-08-01T10:00:00Z",
  archived_at: null,
  ...over,
});

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });

function stubFetch(
  handler: (url: URL, init?: RequestInit) => Response | undefined,
) {
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://console.test");
      const response = handler(url, init);
      if (!response) throw new Error(`unmatched fetch: ${url.pathname}`);
      return response;
    },
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <EnvironmentsPage />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  window.history.replaceState({}, "", "/");
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("EnvironmentsPage", () => {
  it("shows skeleton rows while the list loads", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})),
    );
    const { container } = renderPage();
    expect(screen.getByText("Environments")).toBeInTheDocument();
    expect(container.querySelectorAll("tbody tr")).toHaveLength(3);
  });

  it("surfaces the platform error envelope", async () => {
    stubFetch(() =>
      json(
        {
          type: "error",
          error: { type: "api_error", message: "environments down" },
        },
        500,
      ),
    );
    renderPage();
    expect(await screen.findByText("environments down")).toBeInTheDocument();
  });

  it("hides the surface when the deployment does not implement it", async () => {
    stubFetch(() =>
      json(
        {
          type: "error",
          error: {
            type: "not_found_error",
            message: "no such endpoint: /v1/environments",
          },
        },
        404,
      ),
    );
    renderPage();
    const standIn = await screen.findByTestId("unavailable-surface");
    expect(standIn.getAttribute("data-surface")).toBe("environments");
    expect(screen.queryByTestId("error-state")).toBeNull();
    // Nothing left to act on a surface the platform does not serve.
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("shows the empty state with a create CTA when there are no environments", async () => {
    stubFetch(() => json({ data: [] }));
    renderPage();
    expect(await screen.findByText("No environments yet")).toBeInTheDocument();
    await userEvent.click(
      screen.getAllByRole("button", { name: /Create environment/ })[1],
    );
    expect(
      await screen.findByRole("heading", { name: "Create environment" }),
    ).toBeInTheDocument();
    expect(pushSpy).not.toHaveBeenCalled();
  });

  it("renders environment rows with config type and navigates on click", async () => {
    stubFetch(() =>
      json({
        data: [
          environment({ id: "env_1", name: "Prod sandbox" }),
          environment({
            id: "env_2",
            name: "Old env",
            config: {
              type: "cloud",
              networking: { type: "unrestricted" },
              packages: {
                apt: [],
                cargo: [],
                gem: [],
                go: [],
                npm: [],
                pip: [],
              },
            },
            archived_at: "2026-07-01T00:00:00Z",
          }),
        ],
      }),
    );
    renderPage();

    expect(await screen.findByText("Prod sandbox")).toBeInTheDocument();
    expect(screen.getByText("Self-hosted")).toHaveAttribute(
      "data-type",
      "self_hosted",
    );
    expect(screen.getByText("Cloud")).toHaveAttribute("data-type", "cloud");
    expect(screen.getByText("Jul 1, 2026")).toBeInTheDocument();

    await userEvent.click(screen.getByText("Prod sandbox"));
    expect(pushSpy).toHaveBeenCalledWith("/environments?environment=env_1", {
      scroll: false,
    });
  });

  it("opens the create dialog from the header action", async () => {
    stubFetch(() => json({ data: [] }));
    renderPage();
    await userEvent.click(
      screen.getByRole("button", { name: /Create environment/ }),
    );
    expect(
      await screen.findByRole("heading", { name: "Create environment" }),
    ).toBeInTheDocument();
    expect(pushSpy).not.toHaveBeenCalled();
  });

  it("refetches with include_archived when the filter flips to All", async () => {
    const fetchMock = stubFetch(() =>
      json({ data: [environment({ id: "env_1", name: "Prod sandbox" })] }),
    );
    renderPage();
    await screen.findByText("Prod sandbox");

    await userEvent.click(screen.getByRole("button", { name: "All" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const url = new URL(
      String(fetchMock.mock.calls[1][0]),
      "http://console.test",
    );
    expect(url.searchParams.get("include_archived")).toBe("true");
  });

  it("pages forward with the cursor", async () => {
    const fetchMock = stubFetch((url) =>
      url.searchParams.get("page") === "cur_2"
        ? json({ data: [environment({ id: "env_9", name: "Page two env" })] })
        : json({
            data: [environment({ id: "env_1", name: "Prod sandbox" })],
            next_page: "cur_2",
          }),
    );
    renderPage();
    await screen.findByText("Prod sandbox");

    await userEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(await screen.findByText("Page two env")).toBeInTheDocument();
    const last = new URL(
      String(fetchMock.mock.calls.at(-1)?.[0]),
      "http://console.test",
    );
    expect(last.searchParams.get("page")).toBe("cur_2");
  });
});
it("keeps only failed environment deletions selected and retries them", async () => {
  let rows = [
    environment({ id: "env_ok", name: "Disposable" }),
    environment({ id: "env_fail", name: "Referenced" }),
  ];
  let fail = true;
  const requests: string[] = [];
  stubFetch((url, init) => {
    if (init?.method === "DELETE") {
      const id = url.pathname.split("/").at(-1)!;
      requests.push(id);
      if (id === "env_fail" && fail)
        return json(
          {
            type: "error",
            error: { type: "conflict_error", message: "Still referenced" },
          },
          409,
        );
      rows = rows.filter((row) => row.id !== id);
      return json({ id, type: "environment_deleted" });
    }
    return json({ data: rows });
  });
  const user = userEvent.setup();
  renderPage();
  await screen.findByText("Disposable");
  await user.click(screen.getByRole("checkbox", { name: "Select all rows" }));
  await user.click(screen.getByRole("button", { name: "Delete" }));
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  expect(requests).toEqual([]);
  await user.click(screen.getByRole("button", { name: "Delete" }));
  await user.click(screen.getByRole("button", { name: "Delete environments" }));
  await screen.findByText("Still referenced");
  expect(
    screen.getByRole("checkbox", { name: "Select Referenced" }),
  ).toBeChecked();
  await waitFor(() => expect(screen.queryByText("Disposable")).toBeNull());
  fail = false;
  await user.click(screen.getByRole("button", { name: "Delete" }));
  await user.click(screen.getByRole("button", { name: "Delete environments" }));
  await waitFor(() =>
    expect(screen.queryByText("Still referenced")).toBeNull(),
  );
  expect(requests).toEqual(["env_ok", "env_fail", "env_fail"]);
});

it("does not archive rows which are already archived", async () => {
  const rows = [
    environment({ id: "env_1", name: "Active" }),
    environment({
      id: "env_old",
      name: "Old",
      archived_at: "2026-08-01T00:00:00Z",
    }),
  ];
  const requests: string[] = [];
  stubFetch((url, init) => {
    if (init?.method === "POST") {
      requests.push(url.pathname);
      return json({ ...rows[0], archived_at: "2026-08-02T00:00:00Z" });
    }
    return json({ data: rows });
  });
  const user = userEvent.setup();
  renderPage();
  await screen.findByText("Old");
  await user.click(screen.getByRole("checkbox", { name: "Select all rows" }));
  await user.click(screen.getByRole("button", { name: "Archive" }));
  expect(screen.getByRole("dialog")).toHaveAccessibleName(
    "Archive 1 environments?",
  );
  await user.click(
    screen.getByRole("button", { name: "Archive environments" }),
  );
  await waitFor(() =>
    expect(requests).toEqual(["/api/platform/v1/environments/env_1/archive"]),
  );
  await waitFor(() =>
    expect(
      screen.getByRole("checkbox", { name: "Select Active" }),
    ).not.toBeChecked(),
  );
  expect(screen.getByRole("checkbox", { name: "Select Old" })).toBeChecked();
  expect(screen.getByRole("button", { name: "Archive" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Clear selection" }));
  expect(
    screen.getByRole("checkbox", { name: "Select all rows" }),
  ).not.toBeChecked();
});
it("opens the URL-selected environment and preserves unrelated query state", async () => {
  window.history.replaceState(
    {},
    "",
    "/environments?environment=env_1&source=kept",
  );
  const first = environment({ id: "env_1", name: "Panel environment" });
  const next = environment({ id: "env_2", name: "Next environment" });
  stubFetch((url) =>
    json(url.pathname.endsWith("/env_1") ? first : { data: [first, next] }),
  );
  const user = userEvent.setup();
  renderPage();
  const panel = await screen.findByRole("region", {
    name: "Environment details",
  });
  await screen.findByRole("heading", { name: "Panel environment" });
  expect(panel).toHaveAttribute("data-environment-id", "env_1");
  expect(screen.queryByTestId("environment-keys")).toBeNull();
  await user.click(screen.getByRole("button", { name: "Next environment" }));
  expect(pushSpy).toHaveBeenLastCalledWith(
    "/environments?environment=env_2&source=kept",
    { scroll: false },
  );
  await user.click(screen.getByRole("button", { name: "Close details" }));
  expect(pushSpy).toHaveBeenLastCalledWith("/environments?source=kept", {
    scroll: false,
  });
});

it("looks up exact IDs without restricting lookup to the loaded page", async () => {
  stubFetch(() => json({ data: [] }));
  const user = userEvent.setup();
  renderPage();
  await user.click(screen.getByRole("button", { name: "Find" }));
  expect(pushSpy).not.toHaveBeenCalled();
  await user.type(
    screen.getByRole("textbox", { name: "Find environment by ID" }),
    " env_outside_page ",
  );
  await user.click(screen.getByRole("button", { name: "Find" }));
  expect(pushSpy).toHaveBeenCalledWith(
    "/environments?environment=env_outside_page",
    { scroll: false },
  );
});
