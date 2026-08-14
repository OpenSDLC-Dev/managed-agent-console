import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ComponentProps } from "react";
import { Nav } from "./nav";

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

const EXPECTED = [
  { label: "Agents", href: "/agents", surface: "agents" },
  { label: "Sessions", href: "/sessions", surface: "sessions" },
  { label: "Environments", href: "/environments", surface: "environments" },
  { label: "Credential vaults", href: "/vaults", surface: "vaults" },
  { label: "Skills", href: "/skills", surface: "skills" },
  { label: "Files", href: "/files", surface: "files" },
  // Last, and top-level rather than under a Settings area we do not have
  // (plan 07 D2).
  { label: "API keys", href: "/api-keys", surface: "api-keys" },
];

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

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("Nav", () => {
  it("renders the section header and every item with its href", () => {
    navState.pathname = "/";
    renderNav();
    expect(screen.getByText("Managed Agents")).toBeDefined();
    for (const { label, href, surface } of EXPECTED) {
      const item = screen.getByRole("link", { name: label });
      expect(item.getAttribute("href")).toBe(href);
      expect(item.getAttribute("data-surface")).toBe(surface);
    }
  });

  it("marks the exact-match route active and leaves the rest inactive", () => {
    navState.pathname = "/agents";
    renderNav();
    const active = screen.getByRole("link", { name: "Agents" });
    expect(active.classList.contains("bg-sidebar-accent")).toBe(true);
    expect(active.classList.contains("font-medium")).toBe(true);
    for (const { label } of EXPECTED.slice(1)) {
      const item = screen.getByRole("link", { name: label });
      expect(item.classList.contains("bg-sidebar-accent")).toBe(false);
    }
  });

  it("marks a nested route active via the prefix match", () => {
    navState.pathname = "/sessions/sess_01/trace";
    renderNav();
    const sessions = screen.getByRole("link", { name: "Sessions" });
    expect(sessions.classList.contains("bg-sidebar-accent")).toBe(true);
    const agents = screen.getByRole("link", { name: "Agents" });
    expect(agents.classList.contains("bg-sidebar-accent")).toBe(false);
  });

  it("activates nothing on an unrelated route", () => {
    navState.pathname = "/settings";
    renderNav();
    for (const { label } of EXPECTED) {
      const item = screen.getByRole("link", { name: label });
      expect(item.classList.contains("bg-sidebar-accent")).toBe(false);
    }
  });

  it("keeps every item once the platform answers for all of them", async () => {
    navState.pathname = "/";
    renderNav([]);
    await waitFor(() =>
      expect(vi.mocked(fetch)).toHaveBeenCalledTimes(EXPECTED.length),
    );
    for (const { label } of EXPECTED) expect(link(label)).not.toBeNull();
  });

  // One per surface: a deployment that does not serve it loses the item, and
  // only that item (CLAUDE.md principle 3).
  for (const { label, surface } of EXPECTED) {
    it(`hides ${label} when the deployment does not implement ${surface}`, async () => {
      navState.pathname = "/";
      renderNav([surface]);
      await waitFor(() => expect(link(label)).toBeNull());
      for (const other of EXPECTED.filter((i) => i.surface !== surface)) {
        expect(link(other.label)).not.toBeNull();
      }
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
      expect(vi.mocked(fetch)).toHaveBeenCalledTimes(EXPECTED.length),
    );
    for (const { label } of EXPECTED) expect(link(label)).not.toBeNull();
  });
});
