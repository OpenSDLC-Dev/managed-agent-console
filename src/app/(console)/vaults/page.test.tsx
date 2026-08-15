import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import VaultsPage from "./page";
import type { Vault } from "@/lib/platform/types";

const pushSpy = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushSpy,
    back: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => "/vaults",
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

const vault = (
  over: Partial<Vault> & { id: string; display_name: string },
): Vault => ({
  type: "vault",
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
      <VaultsPage />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("VaultsPage", () => {
  it("shows skeleton rows while the list loads", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})),
    );
    const { container } = renderPage();
    expect(screen.getByText("Credential vaults")).toBeInTheDocument();
    expect(container.querySelectorAll("tbody tr")).toHaveLength(3);
  });

  it("surfaces the platform error envelope", async () => {
    stubFetch(() =>
      json(
        { type: "error", error: { type: "api_error", message: "vaults down" } },
        500,
      ),
    );
    renderPage();
    expect(await screen.findByText("vaults down")).toBeInTheDocument();
  });

  it("hides the surface when the deployment does not implement it", async () => {
    stubFetch(() =>
      json(
        {
          type: "error",
          error: {
            type: "not_found_error",
            message: "no such endpoint: /v1/vaults",
          },
        },
        404,
      ),
    );
    renderPage();
    const standIn = await screen.findByTestId("unavailable-surface");
    expect(standIn.getAttribute("data-surface")).toBe("vaults");
    expect(screen.queryByTestId("error-state")).toBeNull();
    // Nothing left to act on a surface the platform does not serve.
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("shows the empty state and the create action", async () => {
    stubFetch(() => json({ data: [] }));
    renderPage();
    expect(await screen.findByText("No vaults yet")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Create vault/ }),
    ).toBeInTheDocument();
  });

  it("renders vault rows and navigates on row click", async () => {
    stubFetch(() =>
      json({
        data: [
          vault({ id: "vlt_1", display_name: "Team creds" }),
          vault({
            id: "vlt_2",
            display_name: "Old creds",
            archived_at: "2026-07-01T00:00:00Z",
          }),
        ],
      }),
    );
    renderPage();

    expect(await screen.findByText("Team creds")).toBeInTheDocument();
    expect(screen.getByText("Old creds")).toBeInTheDocument();
    expect(screen.getByText("Archived")).toHaveAttribute(
      "data-status",
      "archived",
    );

    await userEvent.click(screen.getByText("Team creds"));
    expect(pushSpy).toHaveBeenCalledWith("/vaults/vlt_1");
  });

  it("refetches with include_archived when the filter flips to All", async () => {
    const fetchMock = stubFetch(() =>
      json({ data: [vault({ id: "vlt_1", display_name: "Team creds" })] }),
    );
    renderPage();
    await screen.findByText("Team creds");

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
        ? json({ data: [vault({ id: "vlt_9", display_name: "Page two" })] })
        : json({
            data: [vault({ id: "vlt_1", display_name: "Team creds" })],
            next_page: "cur_2",
          }),
    );
    renderPage();
    await screen.findByText("Team creds");

    await userEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(await screen.findByText("Page two")).toBeInTheDocument();
    const last = new URL(
      String(fetchMock.mock.calls.at(-1)?.[0]),
      "http://console.test",
    );
    expect(last.searchParams.get("page")).toBe("cur_2");
  });
});
