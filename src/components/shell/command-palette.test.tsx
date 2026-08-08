import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CommandPalette } from "./command-palette";

const routerState = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: routerState.push,
    back: vi.fn(),
    replace: vi.fn(),
  }),
  usePathname: () => "/agents",
  useSearchParams: () => new URLSearchParams(),
}));

/** First page of every list, keyed by BFF path (wire shapes from types.ts). */
const LISTS: Record<string, unknown> = {
  "/api/platform/v1/agents": {
    data: [{ id: "agent_01", type: "agent", name: "Support triage" }],
    next_page: null,
  },
  "/api/platform/v1/sessions": {
    data: [
      { id: "sess_01", type: "session", title: "Nightly run" },
      { id: "sess_02", type: "session", title: "" },
    ],
    next_page: null,
  },
  "/api/platform/v1/environments": {
    data: [{ id: "env_01", type: "environment", name: "Prod sandbox" }],
    next_page: null,
  },
  "/api/platform/v1/vaults": {
    data: [{ id: "vault_01", type: "vault", display_name: "GitHub tokens" }],
    next_page: null,
  },
  "/api/platform/v1/skills": {
    data: [{ id: "skill_01", type: "skill", display_title: "PDF filler" }],
    next_page: null,
  },
  "/api/platform/v1/files": {
    data: [{ id: "file_01", type: "file", filename: "report.pdf" }],
    has_more: false,
    first_id: "file_01",
    last_id: "file_01",
  },
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const path = String(input).split("?")[0];
    const body = LISTS[path];
    if (!body) throw new Error(`unexpected fetch: ${String(input)}`);
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function renderPalette() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={client}>
      <CommandPalette />
    </QueryClientProvider>,
  );
}

async function openPalette() {
  fireEvent.keyDown(document, { key: "k", ctrlKey: true });
  return await screen.findByRole("combobox");
}

const setQuery = (input: HTMLElement, value: string) =>
  fireEvent.change(input, { target: { value } });

describe("CommandPalette", () => {
  it("opens with Ctrl+K, lists the Go to sections, and fetches every list", async () => {
    renderPalette();
    expect(screen.queryByRole("combobox")).toBeNull();
    await openPalette();

    expect(screen.getAllByText("Go to")).toHaveLength(1);
    const options = screen.getAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual([
      "Agents",
      "Sessions",
      "Environments",
      "Credential vaults",
      "Skills",
      "Files",
    ]);

    // Six list queries, plus the six surface probes the "Go to" entries are
    // gated on — each fired exactly once.
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(12));
    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls).toEqual(
      expect.arrayContaining([
        "/api/platform/v1/agents?limit=50",
        "/api/platform/v1/sessions?limit=20",
        "/api/platform/v1/environments?limit=50",
        "/api/platform/v1/vaults?limit=50",
        "/api/platform/v1/skills?limit=50",
        "/api/platform/v1/files?limit=20",
      ]),
    );
  });

  it("toggles closed on a second Ctrl/Cmd+K (case-insensitive)", async () => {
    renderPalette();
    await openPalette();
    fireEvent.keyDown(document, { key: "K", metaKey: true });
    await waitFor(() => expect(screen.queryByRole("combobox")).toBeNull());
  });

  it("opens from the sidebar Search button", async () => {
    renderPalette();
    fireEvent.click(screen.getByRole("button", { name: /search/i }));
    expect(await screen.findByRole("combobox")).toBeDefined();
  });

  it("searches every loaded resource list and shows group headers and ids", async () => {
    renderPalette();
    const input = await openPalette();
    setQuery(input, "01");

    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(6));
    // Sections no longer match, resource groups do.
    expect(screen.queryByText("Go to")).toBeNull();
    for (const header of [
      "Agents",
      "Sessions",
      "Environments",
      "Vaults",
      "Skills",
      "Files",
    ]) {
      expect(screen.getByText(header)).toBeDefined();
    }
    expect(screen.getByText("Support triage")).toBeDefined();
    expect(screen.getByText("agent_01")).toBeDefined();
    expect(screen.getByText("Nightly run")).toBeDefined();
    expect(screen.getByText("Prod sandbox")).toBeDefined();
    expect(screen.getByText("GitHub tokens")).toBeDefined();
    expect(screen.getByText("PDF filler")).toBeDefined();
    expect(screen.getByText("report.pdf")).toBeDefined();
  });

  it("keeps matching sections and falls back to the id for an untitled session", async () => {
    renderPalette();
    const input = await openPalette();
    setQuery(input, "sess");

    // "Sessions" section + both sessions (sess_02 matched and labeled by id).
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(3));
    expect(screen.getByText("Go to")).toBeDefined();
    // The untitled session renders its id as both label and detail.
    expect(screen.getAllByText("sess_02")).toHaveLength(2);
  });

  it("searches whatever lists have loaded while the rest are in flight", async () => {
    // Vaults, skills, and files never resolve; the palette searches the rest.
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const path = String(input).split("?")[0];
      if (
        path === "/api/platform/v1/vaults" ||
        path === "/api/platform/v1/skills" ||
        path === "/api/platform/v1/files"
      ) {
        return new Promise<Response>(() => {});
      }
      return new Response(JSON.stringify(LISTS[path]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    renderPalette();
    const input = await openPalette();
    setQuery(input, "01");

    await waitFor(() =>
      expect(screen.getByText("Support triage")).toBeDefined(),
    );
    expect(screen.getByText("Prod sandbox")).toBeDefined();
    expect(screen.queryByText("GitHub tokens")).toBeNull();
    expect(screen.queryByText("PDF filler")).toBeNull();
    expect(screen.queryByText("report.pdf")).toBeNull();
  });

  it("searches vaults, skills, and files while the first lists are in flight", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const path = String(input).split("?")[0];
      if (
        path === "/api/platform/v1/agents" ||
        path === "/api/platform/v1/sessions" ||
        path === "/api/platform/v1/environments"
      ) {
        return new Promise<Response>(() => {});
      }
      return new Response(JSON.stringify(LISTS[path]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    renderPalette();
    const input = await openPalette();
    setQuery(input, "01");

    await waitFor(() =>
      expect(screen.getByText("GitHub tokens")).toBeDefined(),
    );
    expect(screen.getByText("PDF filler")).toBeDefined();
    expect(screen.getByText("report.pdf")).toBeDefined();
    expect(screen.queryByText("Support triage")).toBeNull();
    expect(screen.queryByText("Nightly run")).toBeNull();
    expect(screen.queryByText("Prod sandbox")).toBeNull();
  });

  it("shows the empty state and ignores Enter when nothing matches", async () => {
    renderPalette();
    const input = await openPalette();
    setQuery(input, "zzz");

    expect(
      await screen.findByText("No matches in the loaded lists."),
    ).toBeDefined();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(routerState.push).not.toHaveBeenCalled();
    expect(screen.getByRole("combobox")).toBeDefined();
  });

  it("moves with arrow keys, clamps at both ends, and navigates on Enter", async () => {
    renderPalette();
    const input = await openPalette();
    setQuery(input, "01");
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(6));

    const selectedLabel = () =>
      screen
        .getAllByRole("option")
        .find((o) => o.getAttribute("aria-selected") === "true")?.textContent;

    expect(selectedLabel()).toContain("Support triage");

    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(selectedLabel()).toContain("Prod sandbox");

    // ArrowUp clamps at the first item.
    for (let i = 0; i < 5; i++) fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(selectedLabel()).toContain("Support triage");
    expect(input.getAttribute("aria-activedescendant")).toBe(
      "command-palette-results-0",
    );

    // ArrowDown past the end clamps back onto the last item.
    for (let i = 0; i < 10; i++) fireEvent.keyDown(input, { key: "ArrowDown" });
    await waitFor(() =>
      expect(input.getAttribute("aria-activedescendant")).toBe(
        "command-palette-results-5",
      ),
    );
    expect(selectedLabel()).toContain("report.pdf");

    fireEvent.keyDown(input, { key: "Enter" });
    expect(routerState.push).toHaveBeenCalledWith("/files");
    await waitFor(() => expect(screen.queryByRole("combobox")).toBeNull());
  });

  it("activates an option on hover and navigates on click", async () => {
    renderPalette();
    const input = await openPalette();
    setQuery(input, "01");
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(6));

    const sessionOption = screen
      .getAllByRole("option")
      .find((o) => o.textContent?.includes("Nightly run"));
    if (!sessionOption) throw new Error("session option not rendered");
    fireEvent.mouseEnter(sessionOption);
    expect(sessionOption.getAttribute("aria-selected")).toBe("true");

    fireEvent.click(sessionOption);
    expect(routerState.push).toHaveBeenCalledWith("/sessions/sess_01");
    await waitFor(() => expect(screen.queryByRole("combobox")).toBeNull());
  });

  it("closes on Escape and reopens with a cleared query", async () => {
    renderPalette();
    const input = await openPalette();
    setQuery(input, "01");
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(6));

    fireEvent.keyDown(input, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("combobox")).toBeNull());

    const reopened = await openPalette();
    expect((reopened as HTMLInputElement).value).toBe("");
    expect(screen.getAllByRole("option")).toHaveLength(6);
    expect(screen.getByText("Go to")).toBeDefined();
  });
});
