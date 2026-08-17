import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ComponentProps } from "react";
import { Nav } from "./nav";
import { SURFACE_NAMES } from "@/lib/platform/surfaces";

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
  // Top level, and first: the landing page, which is not a platform surface.
  { label: "Dashboard", href: "/dashboard" },
  // Top level and second, which is where the reference puts it.
  { label: "API keys", href: "/api-keys", surface: "api-keys" },
  { label: "Files", href: "/files", surface: "files", group: "Build" },
  { label: "Skills", href: "/skills", surface: "skills", group: "Build" },
  {
    label: "Agents",
    href: "/agents",
    surface: "agents",
    group: "Managed Agents",
  },
  {
    label: "Sessions",
    href: "/sessions",
    surface: "sessions",
    group: "Managed Agents",
  },
  {
    label: "Environments",
    href: "/environments",
    surface: "environments",
    group: "Managed Agents",
  },
  {
    label: "Credential vaults",
    href: "/vaults",
    surface: "vaults",
    group: "Managed Agents",
  },
];

/** The groups, in nav order, and what each holds. */
const GROUPS = [
  { label: "Build", surfaces: ["files", "skills"] },
  {
    label: "Managed Agents",
    surfaces: ["agents", "sessions", "environments", "vaults"],
  },
];

const SURFACE_ITEMS = EXPECTED.filter((i) => i.surface);

/**
 * Renders the nav with the surface probe answering 404 for `unimplemented`
 * and 200 for everything else. With no argument the probe never settles, so
 * availability stays unknown — the state every routing assertion below runs
 * in, and the one a healthy deployment spends its first moments in.
 */
function renderNav(unimplemented?: string[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: string) => {
      if (unimplemented === undefined) return new Promise<Response>(() => {});
      const absent = unimplemented.some((s) =>
        // Two namespaces: the wire surfaces are probed at `/v1/<name>?limit=1`,
        // and the one console-namespace surface at its own path — which carries
        // no query string and no name that matches the pattern above.
        s === "api-keys"
          ? String(input).includes("/api/console/")
          : String(input).includes(`/v1/${s}?`),
      );
      return Promise.resolve(
        new Response(
          JSON.stringify(
            absent
              ? {
                  type: "error",
                  error: {
                    type: "not_found_error",
                    message: `no such endpoint: ${input}`,
                  },
                }
              : { data: [] },
          ),
          { status: absent ? 404 : 200 },
        ),
      );
    }),
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <Nav />
    </QueryClientProvider>,
  );
}

const link = (label: string) => screen.queryByRole("link", { name: label });
const groupHeader = (label: string) =>
  screen.queryByRole("button", { name: new RegExp(`^${label}$`) });

/** Every row the nav draws, top to bottom: group headers and links alike. */
const rowOrder = () =>
  [...document.querySelectorAll("nav a, nav button")].map((el) =>
    (el.textContent ?? "").trim(),
  );

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("Nav", () => {
  it("renders every item with its href and surface", () => {
    navState.pathname = "/";
    renderNav();
    for (const { label, href, surface } of EXPECTED) {
      const item = screen.getByRole("link", { name: label });
      expect(item.getAttribute("href")).toBe(href);
      expect(item.getAttribute("data-surface")).toBe(surface ?? null);
    }
  });

  // The order is the point of the grouping, and the assertion the flat nav did
  // not have: every routing test below passed against the ungrouped list too,
  // so without this one a regrouping could be undone and the suite stay green.
  it("draws the reference's order: two top-level rows, then Build, then Managed Agents", () => {
    navState.pathname = "/";
    renderNav();
    expect(rowOrder()).toEqual([
      "Dashboard",
      "API keys",
      "Build",
      "Files",
      "Skills",
      "Managed Agents",
      "Agents",
      "Sessions",
      "Environments",
      "Credential vaults",
    ]);
  });

  // The reference draws an icon on top-level rows and on group headers, and
  // none on the rows inside a group; a nested row pads left instead, so every
  // label lands in one column (docs/design-reference.md).
  it("gives top-level rows an icon and rows inside a group an indent instead", () => {
    navState.pathname = "/";
    renderNav();
    for (const { label, group } of EXPECTED) {
      const row = screen.getByRole("link", { name: label });
      expect(row.querySelector("svg") !== null, label).toBe(!group);
      expect(row.classList.contains("pl-9"), label).toBe(Boolean(group));
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
    const build = groupHeader("Build")!;
    expect(build.getAttribute("aria-expanded")).toBe("true");

    await userEvent.click(build);

    expect(build.getAttribute("aria-expanded")).toBe("false");
    // Unmounted rather than hidden, so a collapsed group's links are not
    // tabbable and there is one less state to keep in step with aria-expanded.
    expect(link("Files")).toBeNull();
    expect(link("Skills")).toBeNull();
    expect(link("Agents")).not.toBeNull();
    expect(link("Dashboard")).not.toBeNull();

    await userEvent.click(build);
    expect(build.getAttribute("aria-expanded")).toBe("true");
    expect(link("Files")).not.toBeNull();
  });

  it("keeps Dashboard without probing for it", async () => {
    navState.pathname = "/";
    renderNav([]);
    // One probe per platform surface and not one more: Dashboard is a console
    // page, so no answer from the platform can take it away.
    await waitFor(() =>
      expect(vi.mocked(fetch)).toHaveBeenCalledTimes(SURFACE_NAMES.length),
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
      expect(vi.mocked(fetch)).toHaveBeenCalledTimes(SURFACE_NAMES.length),
    );
    for (const { label } of EXPECTED) expect(link(label)).not.toBeNull();
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
      // The other group, and both top-level rows, are untouched.
      for (const other of GROUPS.filter((g) => g.label !== label)) {
        expect(groupHeader(other.label), other.label).not.toBeNull();
      }
      expect(link("Dashboard")).not.toBeNull();
      expect(link("API keys")).not.toBeNull();
    });
  }

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
      expect(vi.mocked(fetch)).toHaveBeenCalledTimes(SURFACE_NAMES.length),
    );
    for (const { label } of EXPECTED) expect(link(label)).not.toBeNull();
  });
});
