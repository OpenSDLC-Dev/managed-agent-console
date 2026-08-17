import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ComponentProps } from "react";
import DashboardPage from "./page";
import { SURFACES } from "@/lib/platform/surfaces";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: ComponentProps<"a">) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

/**
 * The probe answers 404 for `unimplemented` and 200 for the rest. With no
 * argument it never settles, which is the state a page renders in before the
 * platform has said anything — and the one where everything shows.
 */
function renderDashboard(unimplemented?: string[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: string) => {
      if (unimplemented === undefined) return new Promise<Response>(() => {});
      const absent = unimplemented.some((s) =>
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
                    message: "no such endpoint",
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
      <DashboardPage />
    </QueryClientProvider>,
  );
}

const card = (surface: string) =>
  document.querySelector(`[data-dashboard-card="${surface}"]`);
const headings = () =>
  [...document.querySelectorAll("h2")].map((h) => h.textContent);

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("DashboardPage", () => {
  // The one test that asserts the human strings, so a copy edit reddens this
  // and not a suite (CLAUDE.md).
  it("titles the page and describes what it is", () => {
    renderDashboard();
    expect(
      screen.getByRole("heading", { level: 1, name: "Dashboard" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Everything this deployment serves."),
    ).toBeInTheDocument();
    // A card's line is the surface's own `blurb`, the same string its page
    // header uses — read from the registry rather than repeated here.
    expect(screen.getByText(SURFACES.agents.blurb)).toBeInTheDocument();
  });

  it("groups the cards under the nav's own headings, in the nav's order", () => {
    renderDashboard();
    expect(headings()).toEqual(["Manage", "Build", "Managed Agents"]);
  });

  it("gives every surface a card pointing at it", () => {
    renderDashboard();
    const routes: [string, string][] = [
      ["api-keys", "/api-keys"],
      ["files", "/files"],
      ["skills", "/skills"],
      ["agents", "/agents"],
      ["sessions", "/sessions"],
      ["environments", "/environments"],
      ["vaults", "/vaults"],
    ];
    for (const [surface, href] of routes) {
      expect(card(surface), surface).not.toBeNull();
      expect(card(surface)?.getAttribute("href"), surface).toBe(href);
    }
    // No card for the page you are standing on.
    expect(document.querySelectorAll("[data-dashboard-card]")).toHaveLength(
      routes.length,
    );
  });

  it("drops a card the deployment does not serve, and only that one", async () => {
    renderDashboard(["skills"]);
    await waitFor(() => expect(card("skills")).toBeNull());
    expect(card("files")).not.toBeNull();
    expect(card("agents")).not.toBeNull();
    // Build still has Files, so its heading stays.
    expect(headings()).toContain("Build");
  });

  it("drops a whole section when the deployment serves none of it", async () => {
    renderDashboard(["files", "skills"]);
    await waitFor(() => expect(headings()).not.toContain("Build"));
    expect(headings()).toEqual(["Manage", "Managed Agents"]);
  });

  it("shows every card while the probe has not answered", () => {
    renderDashboard();
    expect(document.querySelectorAll("[data-dashboard-card]")).toHaveLength(7);
  });
});
