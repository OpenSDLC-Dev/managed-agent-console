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
  useSearchParams: () => new URLSearchParams(),
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

  it("shows the empty state with a create CTA when there are no environments", async () => {
    stubFetch(() => json({ data: [] }));
    renderPage();
    expect(await screen.findByText("No environments yet")).toBeInTheDocument();
    await userEvent.click(
      screen.getAllByRole("button", { name: /Create environment/ })[1],
    );
    expect(pushSpy).toHaveBeenCalledWith("/environments/new");
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
    expect(screen.getByText("self_hosted")).toBeInTheDocument();
    expect(screen.getByText("cloud")).toBeInTheDocument();
    expect(screen.getByText("archived")).toBeInTheDocument();

    await userEvent.click(screen.getByText("Prod sandbox"));
    expect(pushSpy).toHaveBeenCalledWith("/environments/env_1");
  });

  it("navigates to the create page from the header action", async () => {
    stubFetch(() => json({ data: [] }));
    renderPage();
    await userEvent.click(
      screen.getByRole("button", { name: /Create environment/ }),
    );
    expect(pushSpy).toHaveBeenCalledWith("/environments/new");
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
