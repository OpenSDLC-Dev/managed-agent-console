import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import SkillsPage from "./page";
import type { Skill } from "@/lib/platform/types";

const pushSpy = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushSpy,
    back: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => "/skills",
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

const skill = (
  over: Partial<Skill> & { id: string; display_name: string },
): Skill => ({
  type: "skill",
  latest_version_id: "1759178010641556",
  source: { type: "custom" },
  created_at: "2026-08-01T09:12:00Z",
  updated_at: "2026-08-01T10:00:00Z",
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
      <SkillsPage />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("SkillsPage", () => {
  it("shows skeleton rows while the list loads", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})),
    );
    const { container } = renderPage();
    expect(screen.getByText("Skills")).toBeInTheDocument();
    expect(container.querySelectorAll("tbody tr")).toHaveLength(3);
  });

  it("surfaces the platform error envelope", async () => {
    stubFetch(() =>
      json(
        { type: "error", error: { type: "api_error", message: "skills down" } },
        500,
      ),
    );
    renderPage();
    expect(await screen.findByText("skills down")).toBeInTheDocument();
  });

  it("hides the surface when the deployment does not implement it", async () => {
    stubFetch(() =>
      json(
        {
          type: "error",
          error: {
            type: "not_found_error",
            message: "no such endpoint: /v1/skills",
          },
        },
        404,
      ),
    );
    renderPage();
    const standIn = await screen.findByTestId("unavailable-surface");
    expect(standIn.getAttribute("data-surface")).toBe("skills");
    expect(screen.queryByTestId("error-state")).toBeNull();
    // Nothing left to act on a surface the platform does not serve.
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("shows the empty state and the upload action", async () => {
    stubFetch(() => json({ data: [] }));
    renderPage();
    expect(await screen.findByText("No skills yet")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Upload skill/ }),
    ).toBeInTheDocument();
  });

  it("renders skill rows with source and latest version, and navigates", async () => {
    stubFetch(() =>
      json({
        data: [
          skill({ id: "skl_1", display_name: "PDF tools" }),
          skill({
            id: "xlsx",
            display_name: "Excel",
            source: { type: "anthropic" },
            latest_version_id: "",
          }),
        ],
      }),
    );
    renderPage();

    expect(await screen.findByText("PDF tools")).toBeInTheDocument();
    // Scope to the table — the mocked filter dropdown also renders source names.
    const table = within(screen.getByRole("table"));
    expect(table.getByText("custom")).toBeInTheDocument();
    expect(table.getByText("anthropic")).toBeInTheDocument();
    expect(table.getByText("1759178010641556")).toBeInTheDocument();
    expect(table.getByText("none")).toBeInTheDocument();

    await userEvent.click(screen.getByText("PDF tools"));
    expect(pushSpy).toHaveBeenCalledWith("/skills/skl_1");
  });

  it("refetches with source=custom when the source filter changes", async () => {
    const fetchMock = stubFetch(() =>
      json({ data: [skill({ id: "skl_1", display_name: "PDF tools" })] }),
    );
    renderPage();
    await screen.findByText("PDF tools");

    // The filter dropdown items render lowercase source names.
    await userEvent.click(screen.getByRole("button", { name: "custom" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const url = new URL(
      String(fetchMock.mock.calls[1][0]),
      "http://console.test",
    );
    expect(url.searchParams.get("source")).toBe("custom");
    expect(url.searchParams.get("page")).toBeNull();
  });

  it("pages forward with the cursor", async () => {
    const fetchMock = stubFetch((url) =>
      url.searchParams.get("page") === "cur_2"
        ? json({ data: [skill({ id: "skl_9", display_name: "Page two" })] })
        : json({
            data: [skill({ id: "skl_1", display_name: "PDF tools" })],
            next_page: "cur_2",
          }),
    );
    renderPage();
    await screen.findByText("PDF tools");

    await userEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(await screen.findByText("Page two")).toBeInTheDocument();
    const last = new URL(
      String(fetchMock.mock.calls.at(-1)?.[0]),
      "http://console.test",
    );
    expect(last.searchParams.get("page")).toBe("cur_2");
  });
});
