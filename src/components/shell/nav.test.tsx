import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
  waitForElementToBeRemoved,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ComponentProps } from "react";
import { Nav } from "./nav";
import { SURFACES } from "@/lib/platform/surfaces";

const ALL_SURFACES = Object.values(SURFACES);

const navState = vi.hoisted(() => ({ pathname: "/" }));

vi.mock("next/navigation", () => ({
  usePathname: () => navState.pathname,
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: ComponentProps<"a">) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

/** Every destination, in nav order. `surface` absent = console-local. */
const EXPECTED = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Agents", href: "/agents", surface: "agents", group: "Agents" },
  {
    label: "Sessions",
    href: "/sessions",
    surface: "sessions",
    group: "Agents",
  },
  {
    label: "Deployments",
    href: "/deployments",
    surface: "deployments",
    group: "Agents",
  },
  { label: "Files", href: "/files", surface: "files", group: "Resources" },
  { label: "Skills", href: "/skills", surface: "skills", group: "Resources" },
  {
    label: "Environments",
    href: "/environments",
    surface: "environments",
    group: "Resources",
  },
  {
    label: "Credential Vaults",
    href: "/vaults",
    surface: "vaults",
    group: "Resources",
  },
  {
    label: "Memory Stores",
    href: "/memory-stores",
    surface: "memory-stores",
    group: "Resources",
  },
  {
    label: "Dreams",
    href: "/dreams",
    surface: "dreams",
    group: "Resources",
  },
  { label: "API Keys", href: "/api-keys", surface: "api-keys" },
  { label: "Usage", href: "/usage", surface: "usage" },
  {
    label: "Models",
    href: "/models",
    surface: "models",
    group: "Model Gateway",
  },
  {
    label: "Providers",
    href: "/providers",
    surface: "providers",
    group: "Model Gateway",
  },
];

const GROUPS = [
  { label: "Agents", surfaces: ["agents", "sessions", "deployments"] },
  {
    label: "Resources",
    surfaces: [
      "files",
      "skills",
      "environments",
      "vaults",
      "memory-stores",
      "dreams",
    ],
  },
  { label: "Model Gateway", surfaces: ["models", "providers"] },
];

const SURFACE_ITEMS = EXPECTED.filter((i) => i.surface);

/**
 * Renders the nav with the surface probe answering 404 for `unimplemented`
 * and 200 for everything else. With no argument the probe never settles, so
 * availability stays unknown — the state every routing assertion below runs
 * in, and the one a healthy deployment spends its first moments in.
 */
function renderNav(
  unimplemented?: string[],
  props: ComponentProps<typeof Nav> = {},
  status = 404,
) {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: string) => {
      if (unimplemented === undefined) return new Promise<Response>(() => {});
      const absent = unimplemented.some((s) =>
        // Three namespaces: the wire surfaces are probed at
        // `/v1/<name>?limit=1`, the console-namespace surface and the gateway's
        // at their own BFF paths — which carry no query string and no name that
        // matches the pattern above.
        s === "api-keys"
          ? String(input).includes("/api_keys")
          : s === "providers" || s === "models" || s === "usage"
            ? String(input).includes(`/admin/v1/${SURFACES[s].path}`)
            : String(input).includes(
                `/api/organizations/default/proxy/${SURFACES[s as keyof typeof SURFACES].path}?`,
              ),
      );
      return Promise.resolve(
        new Response(
          JSON.stringify(
            absent
              ? {
                  type: "error",
                  error: {
                    type:
                      status === 403 ? "permission_error" : "not_found_error",
                    message:
                      status === 403
                        ? String(input).includes("/api/console/")
                          ? "this route requires the admin role"
                          : "this route requires the developer role"
                        : "Not found",
                  },
                }
              : { data: [] },
          ),
          { status: absent ? status : 200 },
        ),
      );
    }),
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <Nav {...props} />
    </QueryClientProvider>,
  );
}

const link = (label: string) => screen.queryByRole("link", { name: label });
const groupHeader = (label: string) =>
  screen.queryByRole("button", { name: new RegExp(`^${label}$`) });

/** Every row the nav draws, top to bottom: group headers and links alike. */
const rowOrder = () =>
  [...document.querySelectorAll("nav h2, nav a, nav button")].map((el) =>
    (el.textContent ?? "").trim(),
  );

const RESOURCES_PREFERENCE = "managed-agent-console:nav:nav-group-resources";

beforeEach(() => {
  localStorage.setItem(RESOURCES_PREFERENCE, "true");
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("Nav", () => {
  for (const compact of [false, true]) {
    it(`probe: hides only denied read destinations in ${compact ? "compact" : "expanded"} navigation`, async () => {
      renderNav(["api-keys", "files", "skills"], { compact }, 403);
      // Capture the initial link before starting the timeout. Polling its
      // removal avoids repeating a role/name scan while query notifications
      // are queued, which can exhaust waitFor's 1 s budget under load (#242).
      await waitForElementToBeRemoved(
        screen.getByRole("link", { name: "API Keys" }),
      );
      expect(link("API Keys")).toBeNull();
      expect(link("Files")).toBeNull();
      expect(link("Skills")).toBeNull();
      expect(groupHeader("Resources")).not.toBeNull();
      expect(link("Dashboard")).not.toBeNull();
      if (compact) expect(groupHeader("Agents")).not.toBeNull();
      else expect(link("Agents")).not.toBeNull();
    });
  }

  it("renders every item with its href and surface", () => {
    navState.pathname = "/";
    renderNav();
    for (const { label, href, surface } of EXPECTED) {
      const item = screen.getByRole("link", { name: label });
      expect(item.getAttribute("href")).toBe(href);
      expect(item.getAttribute("data-surface")).toBe(surface ?? null);
    }
  });

  it("orders the destinations under Build and Organization", () => {
    navState.pathname = "/";
    renderNav();
    expect(rowOrder()).toEqual([
      "Dashboard",
      "Build",
      "Agents",
      "Agents",
      "Sessions",
      "Deployments",
      "Resources",
      "Files",
      "Skills",
      "Environments",
      "Credential Vaults",
      "Memory Stores",
      "Dreams",
      "Organization",
      "API Keys",
      "Usage",
      "Model Gateway",
      "Models",
      "Providers",
    ]);
  });

  it("scrolls the current page's row into view", () => {
    const scrolled: Element[] = [];
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (this: Element) {
      scrolled.push(this);
    };
    try {
      navState.pathname = "/usage";
      renderNav();
      expect(scrolled.map((el) => el.getAttribute("href"))).toContain("/usage");
    } finally {
      Element.prototype.scrollIntoView = original;
    }
  });

  // Expanding a collapsed sidebar changes only `compact` (PR #223 review).
  it("probe: scrolls the current page's row into view when the sidebar expands", () => {
    const scrolled: Element[] = [];
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (this: Element) {
      scrolled.push(this);
    };
    try {
      navState.pathname = "/usage";
      vi.stubGlobal(
        "fetch",
        vi.fn(() => new Promise<Response>(() => {})),
      );
      const client = new QueryClient();
      const nav = (compact: boolean) => (
        <QueryClientProvider client={client}>
          <Nav compact={compact} />
        </QueryClientProvider>
      );
      const { rerender } = render(nav(true));
      scrolled.length = 0;
      rerender(nav(false));
      expect(scrolled.map((el) => el.getAttribute("href"))).toContain("/usage");
    } finally {
      Element.prototype.scrollIntoView = original;
    }
  });

  it("gives top-level rows an icon and rows inside a group an indent instead", () => {
    navState.pathname = "/";
    renderNav();
    for (const { label, group } of EXPECTED) {
      const row = screen.getByRole("link", { name: label });
      expect(row.querySelector("svg") !== null, label).toBe(!group);
      expect(row.classList.contains("pl-10"), label).toBe(Boolean(group));
    }
    for (const { label } of GROUPS) {
      expect(groupHeader(label)?.querySelector("svg"), label).not.toBeNull();
    }
  });

  it("marks the exact-match route active and leaves the rest inactive", () => {
    navState.pathname = "/agents";
    renderNav();
    const active = screen.getByRole("link", { name: "Agents" });
    expect(active.classList.contains("bg-sidebar-accent")).toBe(true);
    expect(active.classList.contains("font-medium")).toBe(true);
    for (const { label } of EXPECTED.filter((i) => i.label !== "Agents")) {
      const item = screen.getByRole("link", { name: label });
      expect(item.classList.contains("bg-sidebar-accent")).toBe(false);
    }
  });

  it("marks a nested route active via the prefix match", () => {
    navState.pathname = "/sessions/sess_01/trace";
    renderNav();
    expect(
      screen
        .getByRole("link", { name: "Sessions" })
        .classList.contains("bg-sidebar-accent"),
    ).toBe(true);
    expect(
      screen
        .getByRole("link", { name: "Agents" })
        .classList.contains("bg-sidebar-accent"),
    ).toBe(false);
  });

  it("activates nothing on an unrelated route", () => {
    navState.pathname = "/settings";
    renderNav();
    for (const { label } of EXPECTED) {
      const item = screen.getByRole("link", { name: label });
      expect(item.classList.contains("bg-sidebar-accent")).toBe(false);
    }
  });

  it("collapses a group and leaves its neighbours alone", async () => {
    navState.pathname = "/";
    renderNav();
    const resources = groupHeader("Resources")!;
    expect(resources.getAttribute("aria-expanded")).toBe("true");
    // The machine-readable half of the contract: a test reads the attribute,
    // not the chevron it rotates.
    expect(resources.getAttribute("data-state")).toBe("open");

    await userEvent.click(resources);

    expect(resources.getAttribute("aria-expanded")).toBe("false");
    expect(resources.getAttribute("data-state")).toBe("closed");
    expect(link("Files")).toBeNull();
    expect(link("Skills")).toBeNull();
    expect(link("Agents")).not.toBeNull();
    expect(link("Dashboard")).not.toBeNull();

    await userEvent.click(resources);
    expect(resources.getAttribute("aria-expanded")).toBe("true");
    expect(resources.getAttribute("data-state")).toBe("open");
    expect(link("Files")).not.toBeNull();
  });

  it("keeps Dashboard without probing for it", async () => {
    navState.pathname = "/";
    renderNav([]);
    // One probe per platform surface and not one more: Dashboard is a console
    // page, so no answer from the platform can take it away.
    await waitFor(() =>
      expect(vi.mocked(fetch)).toHaveBeenCalledTimes(ALL_SURFACES.length),
    );
    expect(link("Dashboard")).not.toBeNull();
    const probed = vi
      .mocked(fetch)
      .mock.calls.map(([input]) => String(input))
      .join(" ");
    expect(probed).not.toContain("dashboard");
  });

  it("keeps every item once the platform answers for all of them", async () => {
    navState.pathname = "/";
    renderNav([]);
    await waitFor(() =>
      expect(vi.mocked(fetch)).toHaveBeenCalledTimes(ALL_SURFACES.length),
    );
    for (const { label } of EXPECTED) expect(link(label)).not.toBeNull();
    await screen.findByRole("button", { name: "Settings" });
    expect(link("Members")?.getAttribute("href")).toBe("/members");
    expect(link("Service accounts")?.getAttribute("href")).toBe(
      "/service-accounts",
    );
  });

  // One per surface: a deployment that does not serve it loses the item, and
  // only that item (CLAUDE.md principle 3).
  for (const { label, surface } of SURFACE_ITEMS) {
    it(`hides ${label} when the deployment does not implement ${surface}`, async () => {
      navState.pathname = "/";
      renderNav([surface!]);
      await waitFor(() => expect(link(label)).toBeNull());
      for (const other of EXPECTED.filter((i) => i.label !== label)) {
        expect(link(other.label), other.label).not.toBeNull();
      }
    });
  }

  // A group is its items. With none of them served there is nothing to title,
  // and a header alone would advertise a section this deployment lacks.
  for (const { label, surfaces } of GROUPS) {
    it(`drops the ${label} header when it serves none of ${surfaces.join(", ")}`, async () => {
      navState.pathname = "/";
      renderNav(surfaces);
      await waitFor(() => expect(groupHeader(label)).toBeNull());
      for (const other of GROUPS.filter((g) => g.label !== label)) {
        expect(groupHeader(other.label), other.label).not.toBeNull();
      }
      expect(link("Dashboard")).not.toBeNull();
      expect(link("API Keys")).not.toBeNull();
    });
  }

  it.each([false, true])(
    "omits an empty Build section (compact=%s)",
    async (compact) => {
      renderNav(
        GROUPS.filter(({ label }) => label !== "Model Gateway").flatMap(
          ({ surfaces }) => surfaces,
        ),
        { compact },
      );
      await waitForElementToBeRemoved(
        screen.getByRole("heading", { name: "Build" }),
      );
      expect(
        screen.getByRole("heading", { name: "Organization" }),
      ).toBeDefined();
      expect(link("API Keys")).not.toBeNull();
    },
  );

  it("probe: keeps every item when the probe fails rather than 404s", async () => {
    navState.pathname = "/";
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("console server unreachable"))),
    );
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <Nav />
      </QueryClientProvider>,
    );
    await waitFor(() =>
      expect(vi.mocked(fetch)).toHaveBeenCalledTimes(ALL_SURFACES.length),
    );
    for (const { label } of EXPECTED) expect(link(label)).not.toBeNull();
  });
});

it("opens Resources by default only on a resource route", () => {
  localStorage.removeItem(RESOURCES_PREFERENCE);
  navState.pathname = "/dashboard";
  const first = renderNav();
  expect(groupHeader("Resources")?.getAttribute("aria-expanded")).toBe("false");
  expect(link("Files")).toBeNull();
  first.unmount();

  navState.pathname = "/files";
  renderNav();
  expect(groupHeader("Resources")?.getAttribute("aria-expanded")).toBe("true");
  expect(link("Files")?.getAttribute("aria-current")).toBe("page");
});

it("restores a collapsed group after remount", async () => {
  navState.pathname = "/files";
  const user = userEvent.setup();
  const first = renderNav();
  await user.click(groupHeader("Resources")!);
  expect(link("Files")).toBeNull();
  first.unmount();
  renderNav();
  expect(groupHeader("Resources")?.getAttribute("aria-expanded")).toBe("false");
  expect(groupHeader("Resources")?.getAttribute("data-active")).toBe("true");
  expect(link("Files")).toBeNull();
  await user.click(groupHeader("Resources")!);
  expect(link("Files")).not.toBeNull();
});

it("compact groups open an accessible flyout without changing saved expansion", async () => {
  localStorage.setItem(
    "managed-agent-console:nav:nav-group-resources",
    "false",
  );
  renderNav(["skills"], { compact: true });
  const user = userEvent.setup();
  const trigger = screen.getByRole("button", { name: "Resources" });
  await user.click(trigger);
  await screen.findByRole("dialog", { name: "Resources" });
  await waitFor(() => expect(link("Skills")).toBeNull());
  expect(link("Files")?.getAttribute("href")).toBe("/files");
  expect(localStorage.getItem(RESOURCES_PREFERENCE)).toBe("false");
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(document.activeElement).toBe(trigger);
  await user.click(trigger);
  await user.click(screen.getByRole("link", { name: "Files" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});
