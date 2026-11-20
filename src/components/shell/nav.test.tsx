import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ComponentProps } from "react";
import { Nav } from "./nav";
import { SURFACES, type Surface } from "@/lib/platform/surfaces";

const navState = vi.hoisted(() => ({ pathname: "/dashboard" }));

vi.mock("next/navigation", () => ({
  usePathname: () => navState.pathname,
}));

vi.mock("next/link", () => ({
  default: ({ href, children, onClick, ...props }: ComponentProps<"a">) => (
    <a
      href={href}
      {...props}
      onClick={(event) => {
        event.preventDefault();
        onClick?.(event);
      }}
    >
      {children}
    </a>
  ),
}));

const GROUPS = {
  Agents: [
    "agents",
    "sessions",
    "deployments",
    "environments",
    "memory-stores",
    "vaults",
    "dreams",
  ],
  Resources: ["files", "skills"],
  Keys: ["api-keys", "service-accounts"],
  "Spending & usage": ["usage"],
  Settings: ["members"],
  "Model Gateway": ["models", "providers"],
} as const satisfies Record<string, readonly Surface[]>;

function renderNav(
  unavailable?: readonly Surface[],
  props: ComponentProps<typeof Nav> = {},
  status = 404,
) {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: string) => {
      if (!unavailable) return new Promise<Response>(() => {});
      const path = new URL(input, "http://console.test").pathname;
      const absent = unavailable.some(
        (surface) =>
          path.endsWith("/" + SURFACES[surface].path.replace(/^\//, "")) ||
          path === SURFACES[surface].path,
      );
      return Promise.resolve(
        absent
          ? Response.json(
              {
                type: "error",
                error: {
                  type: status === 403 ? "permission_error" : "not_found_error",
                  message:
                    status === 403
                      ? "this route requires the developer role"
                      : "Not found",
                },
              },
              { status },
            )
          : Response.json({ data: [] }),
      );
    }),
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<Nav {...props} />, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}

const navigation = () =>
  screen.getByRole("navigation", { name: "Main navigation" });
const groupButton = (name: string) =>
  within(navigation()).getByRole("button", { name });
const back = () =>
  within(navigation()).getByRole("button", { name: /back to all sections/i });

beforeEach(() => {
  navState.pathname = "/dashboard";
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Nav", () => {
  it("starts with the ordered top-level categories and no submenu links", async () => {
    renderNav([]);
    await screen.findByRole("button", { name: "Settings" });
    expect(navigation().getAttribute("data-nav-view")).toBe("root");
    expect(
      Array.from(navigation().querySelectorAll("h2, a, button")).map((el) =>
        el.textContent?.trim(),
      ),
    ).toEqual([
      "Dashboard",
      "Build",
      "Agents",
      "Resources",
      "Organization",
      "Keys",
      "Spending & usage",
      "Settings",
      "Model Gateway",
    ]);
    expect(within(navigation()).getAllByRole("link")).toHaveLength(1);
    expect(
      within(navigation())
        .getByRole("link", { name: "Dashboard" })
        .getAttribute("aria-current"),
    ).toBe("page");
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(
      Object.keys(SURFACES).length,
    );
  });

  it.each(Object.entries(GROUPS))(
    "shows only the %s destinations in its panel",
    async (name, surfaces) => {
      renderNav([]);
      await screen.findByRole("button", { name: "Settings" });
      await userEvent.click(groupButton(name));

      expect(navigation().getAttribute("data-nav-view")).toBe(name);
      expect(within(navigation()).getByRole("heading", { name })).toBeDefined();
      expect(
        within(navigation())
          .getAllByRole("link")
          .map((el) => [
            el.textContent?.trim(),
            el.getAttribute("href"),
            el.getAttribute("data-surface"),
          ]),
      ).toEqual(
        surfaces.map((surface) => [
          SURFACES[surface].label,
          `/${surface}`,
          surface,
        ]),
      );
      expect(document.activeElement).toBe(back());

      await userEvent.click(back());
      expect(navigation().getAttribute("data-nav-view")).toBe("root");
      expect(document.activeElement).toBe(groupButton(name));
    },
  );

  it("opens the current route's panel and returns to the root without changing the route", async () => {
    navState.pathname = "/sessions/sess_01/trace";
    const view = renderNav();
    expect(navigation().getAttribute("data-nav-view")).toBe("Agents");
    expect(
      screen
        .getByRole("link", { name: "Sessions" })
        .getAttribute("aria-current"),
    ).toBe("page");
    expect(
      screen.getByRole("link", { name: "Agents" }).getAttribute("aria-current"),
    ).toBeNull();
    back().focus();
    await userEvent.keyboard("{Escape}");
    expect(navigation().getAttribute("data-nav-view")).toBe("root");
    expect(groupButton("Agents").getAttribute("data-active")).toBe("true");
    expect(document.activeElement).toBe(groupButton("Agents"));

    navState.pathname = "/files";
    view.rerender(<Nav />);
    expect(navigation().getAttribute("data-nav-view")).toBe("Resources");
    expect(
      screen.getByRole("link", { name: "Files" }).getAttribute("aria-current"),
    ).toBe("page");

    navState.pathname = "/dashboard";
    view.rerender(<Nav />);
    expect(navigation().getAttribute("data-nav-view")).toBe("root");
  });

  it("keeps a manual panel while switching sidebar width, with the rail showing the current route", async () => {
    const view = renderNav();
    await userEvent.click(groupButton("Resources"));
    view.rerender(<Nav compact />);
    expect(navigation().getAttribute("data-nav-view")).toBe("root");
    expect(groupButton("Resources").getAttribute("data-active")).toBe("false");
    view.rerender(<Nav />);
    expect(navigation().getAttribute("data-nav-view")).toBe("Resources");
  });

  it("probe: scrolls the current page's row into view when the sidebar expands", () => {
    const scrolled: Element[] = [];
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (this: Element) {
      scrolled.push(this);
    };
    try {
      navState.pathname = "/usage";
      const view = renderNav(undefined, { compact: true });
      scrolled.length = 0;
      view.rerender(<Nav />);
      expect(scrolled.map((el) => el.getAttribute("href"))).toContain("/usage");
    } finally {
      Element.prototype.scrollIntoView = original;
    }
  });

  it("keeps focus on the group just left when another group owns the current page", async () => {
    const original = Element.prototype.scrollIntoView;
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    try {
      navState.pathname = "/sessions";
      renderNav();
      await userEvent.click(back());
      await userEvent.click(groupButton("Model Gateway"));
      scroll.mockClear();
      await userEvent.click(back());
      expect(document.activeElement).toBe(groupButton("Model Gateway"));
      expect(scroll).not.toHaveBeenCalled();
    } finally {
      Element.prototype.scrollIntoView = original;
    }
  });

  it.each([false, true])(
    "probe: hides only denied read destinations (compact=%s)",
    async (compact) => {
      renderNav(["api-keys", "files", "skills"], { compact }, 403);
      await waitFor(() =>
        expect(
          within(navigation()).queryByRole("button", { name: "Resources" }),
        ).toBeNull(),
      );
      expect(groupButton("Agents")).toBeDefined();
      await userEvent.click(groupButton("Keys"));
      const scope = compact
        ? screen.getByRole("dialog", { name: "Keys" })
        : navigation();
      expect(
        within(scope).queryByRole("link", { name: "API Keys" }),
      ).toBeNull();
      expect(
        within(scope)
          .getByRole("link", { name: "Service accounts" })
          .getAttribute("href"),
      ).toBe("/service-accounts");
    },
  );

  it.each([false, true])(
    "omits empty groups and headings (compact=%s)",
    async (compact) => {
      renderNav(
        [...GROUPS.Agents, ...GROUPS.Resources, ...GROUPS["Spending & usage"]],
        { compact },
      );
      await waitFor(() =>
        expect(
          within(navigation()).queryByRole("heading", { name: "Build" }),
        ).toBeNull(),
      );
      expect(
        within(navigation()).queryByRole("button", {
          name: "Spending & usage",
        }),
      ).toBeNull();
      expect(groupButton("Keys")).toBeDefined();
      expect(
        within(navigation()).getByRole("heading", { name: "Organization" }),
      ).toBeDefined();
    },
  );

  it("drops an absent link and keeps its available sibling", async () => {
    navState.pathname = "/files";
    renderNav(["skills"]);
    await waitFor(() =>
      expect(screen.queryByRole("link", { name: "Skills" })).toBeNull(),
    );
    expect(
      screen.getByRole("link", { name: "Files" }).getAttribute("href"),
    ).toBe("/files");
  });

  it("probe: keeps reachable categories when the network fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("console server unreachable"))),
    );
    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <Nav />
      </QueryClientProvider>,
    );
    await waitFor(() =>
      expect(vi.mocked(fetch)).toHaveBeenCalledTimes(
        Object.keys(SURFACES).length,
      ),
    );
    expect(groupButton("Resources")).toBeDefined();
    await userEvent.click(groupButton("Resources"));
    expect(screen.getByRole("link", { name: "Files" })).toBeDefined();
    expect(screen.getByRole("link", { name: "Skills" })).toBeDefined();
  });

  it("compact groups use a keyboard-accessible flyout", async () => {
    renderNav(["skills"], { compact: true });
    const user = userEvent.setup();
    await user.click(groupButton("Resources"));
    const popup = await screen.findByRole("dialog", { name: "Resources" });
    await waitFor(() =>
      expect(within(popup).queryByRole("link", { name: "Skills" })).toBeNull(),
    );
    expect(
      within(popup).getByRole("link", { name: "Files" }).getAttribute("href"),
    ).toBe("/files");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(groupButton("Resources"));
    await user.click(groupButton("Resources"));
    await user.click(screen.getByRole("link", { name: "Files" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});
