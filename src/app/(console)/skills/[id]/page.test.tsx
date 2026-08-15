import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Suspense } from "react";
import SkillDetailPage from "./page";
import type { Skill, SkillVersion } from "@/lib/platform/types";

const pushSpy = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushSpy,
    back: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => "/skills/skl_1",
  useSearchParams: () => new URLSearchParams(),
}));

const skill = (over?: Partial<Skill>): Skill => ({
  id: "skl_1",
  type: "skill",
  display_title: "PDF tools",
  latest_version: "1759178010641556",
  source: "custom",
  created_at: "2026-08-01T09:12:00Z",
  updated_at: "2026-08-01T10:00:00Z",
  ...over,
});

const version = (
  over: Partial<SkillVersion> & { id: string },
): SkillVersion => ({
  type: "skill_version",
  skill_id: "skl_1",
  version: "1759178010641556",
  name: "pdf-tools",
  description: "Split and merge PDFs",
  directory: "pdf-tools",
  created_at: "2026-08-01T09:12:00Z",
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

/** Pre-resolved params thenable: React's `use` reads .status/.value directly. */
function asParams(id: string): Promise<{ id: string }> {
  const value = { id };
  return {
    status: "fulfilled",
    value,
    then: (onFulfilled: (v: { id: string }) => void) => onFulfilled(value),
  } as unknown as Promise<{ id: string }>;
}

function renderPage(id = "skl_1") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <Suspense fallback={null}>
        <SkillDetailPage params={asParams(id)} />
      </Suspense>
    </QueryClientProvider>,
  );
}

function routes(over?: {
  skill?: Skill;
  versions?: Response;
  onMutate?: (url: URL, init: RequestInit) => Response | undefined;
}) {
  return stubFetch((url, init) => {
    if (init?.method && over?.onMutate) {
      const handled = over.onMutate(url, init);
      if (handled) return handled;
    }
    if (url.pathname === "/api/platform/v1/skills/skl_1/versions")
      return over?.versions ?? json({ data: [version({ id: "sklv_1" })] });
    if (url.pathname === "/api/platform/v1/skills/skl_1")
      return json(over?.skill ?? skill());
    return undefined;
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("SkillDetailPage", () => {
  it("shows the detail skeleton while the skill loads", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})),
    );
    renderPage();
    await waitFor(() =>
      expect(document.querySelector('[aria-busy="true"]')).not.toBeNull(),
    );
  });

  it("surfaces the platform error envelope", async () => {
    stubFetch(() =>
      json(
        {
          type: "error",
          error: { type: "not_found_error", message: "skill not found" },
        },
        404,
      ),
    );
    renderPage();
    expect(await screen.findByText("skill not found")).toBeInTheDocument();
  });

  it("renders a custom skill with its versions and download links", async () => {
    routes();
    renderPage();

    expect(
      await screen.findByRole("heading", { name: "PDF tools" }),
    ).toBeInTheDocument();
    expect(screen.getByText("custom")).toBeInTheDocument();
    expect(screen.getAllByText("1759178010641556")).toHaveLength(2);
    expect(screen.getByText("pdf-tools")).toBeInTheDocument();
    expect(screen.getByText("Split and merge PDFs")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Download version 1759178010641556"),
    ).toHaveAttribute(
      "href",
      "/api/platform/v1/skills/skl_1/versions/1759178010641556/content",
    );
    expect(
      screen.getByRole("button", { name: /New version/ }),
    ).toBeInTheDocument();
  });

  it("uploads picked files as a new version", async () => {
    const posts: [URL, RequestInit][] = [];
    routes({
      onMutate: (url, init) => {
        if (init.method === "POST") {
          posts.push([url, init]);
          return json(version({ id: "sklv_2", version: "1760000000000000" }));
        }
        return undefined;
      },
    });
    renderPage();
    await screen.findByRole("heading", { name: "PDF tools" });

    // The visible button forwards the click to the hidden file input.
    await userEvent.click(screen.getByRole("button", { name: /New version/ }));
    fireEvent.change(screen.getByLabelText("New version files"), {
      target: {
        files: [
          new File(["# skill"], "SKILL.md", { type: "text/markdown" }),
          new File(["print()"], "run.py"),
        ],
      },
    });

    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0][0].pathname).toBe("/api/platform/v1/skills/skl_1/versions");
    const form = posts[0][1].body as FormData;
    expect(form.getAll("files[]").map((f) => (f as File).name)).toEqual([
      "SKILL.md",
      "run.py",
    ]);
  });

  it("deletes a version after dialog confirmation", async () => {
    const deletes: URL[] = [];
    routes({
      onMutate: (url, init) => {
        if (init.method === "DELETE") {
          deletes.push(url);
          return json({ id: "sklv_1", type: "skill_version" });
        }
        return undefined;
      },
    });
    renderPage();
    await screen.findByRole("heading", { name: "PDF tools" });

    await userEvent.click(
      screen.getByRole("button", { name: "Delete version 1759178010641556" }),
    );
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Delete version" }),
    );

    await waitFor(() => expect(deletes).toHaveLength(1));
    expect(deletes[0].pathname).toBe(
      "/api/platform/v1/skills/skl_1/versions/1759178010641556",
    );
  });

  it("deletes the skill and returns to the list", async () => {
    const deletes: URL[] = [];
    routes({
      onMutate: (url, init) => {
        if (init.method === "DELETE") {
          deletes.push(url);
          return json({ id: "skl_1", type: "skill" });
        }
        return undefined;
      },
    });
    renderPage();
    await screen.findByRole("heading", { name: "PDF tools" });

    await userEvent.click(screen.getByRole("button", { name: "More actions" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Delete skill" }),
    );

    await waitFor(() => expect(deletes).toHaveLength(1));
    expect(deletes[0].pathname).toBe("/api/platform/v1/skills/skl_1");
    await waitFor(() => expect(pushSpy).toHaveBeenCalledWith("/skills"));
  });

  it("renders an anthropic skill read-only with no versions", async () => {
    routes({
      skill: skill({
        id: "skl_1",
        display_title: "Excel",
        source: "anthropic",
        latest_version: "",
      }),
      versions: json({ data: [] }),
    });
    renderPage();

    expect(
      await screen.findByRole("heading", { name: "Excel" }),
    ).toBeInTheDocument();
    expect(screen.getByText("anthropic")).toBeInTheDocument();
    expect(screen.getByText("none")).toBeInTheDocument();
    expect(screen.getByText("No versions")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /New version/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
  });

  it("shows the versions error without dropping the rest of the page", async () => {
    routes({
      versions: json(
        {
          type: "error",
          error: { type: "api_error", message: "versions down" },
        },
        500,
      ),
    });
    renderPage();

    expect(
      await screen.findByRole("heading", { name: "PDF tools" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("versions down")).toBeInTheDocument();
  });
});
