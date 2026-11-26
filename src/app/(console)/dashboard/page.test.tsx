import { TEST_SESSION, withTestSession } from "@/../test/session-fixture";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ComponentProps } from "react";
import DashboardPage from "./page";
import {
  ConsoleSessionContext,
  type useConsoleSession,
} from "@/components/shell/console-session";

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
 * platform has said anything.
 */
function renderDashboard(
  unimplemented?: string[],
  status = 404,
  playgroundAccess?: boolean,
  name: string = TEST_SESSION.name,
  loginName?: string,
) {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      withTestSession((input: string) => {
        if (unimplemented === undefined) return new Promise<Response>(() => {});
        const absent = unimplemented.some((s) =>
          s === "api-keys"
            ? String(input).includes("/api_keys")
            : s === "model-gateway"
              ? String(input).includes("/admin/v1/")
              : String(input).includes(`/v1/${s}?`),
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
    ),
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ConsoleSessionContext.Provider
        value={
          {
            data: {
              ...TEST_SESSION,
              name,
              login_name: loginName,
              playground_access: playgroundAccess,
            },
          } as ReturnType<typeof useConsoleSession>
        }
      >
        <DashboardPage />
      </ConsoleSessionContext.Provider>
    </QueryClientProvider>,
  );
}

const card = (surface: string) =>
  document.querySelector(`[data-dashboard-card="${surface}"]`);
const headings = () =>
  [...document.querySelectorAll("h2")].map((h) => h.textContent);

afterEach(() => {
  cleanup();
  delete document.documentElement.dataset.consoleAuth;
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("DashboardPage", () => {
  it.each([true, false, undefined])(
    "gates both Playground resource links on the session grant (%s)",
    (access) => {
      renderDashboard(undefined, 404, access);
      const links = screen.queryAllByRole("link", {
        name: /^(open )?playground$/i,
      });
      expect(links.map((link) => link.getAttribute("href"))).toEqual(
        access
          ? ["/workspaces/default/playground", "/workspaces/default/playground"]
          : [],
      );
    },
  );
  it("probe: drops denied-read cards and shortcuts without hiding readable resources", async () => {
    renderDashboard(["api-keys", "agents", "files", "skills"], 403);
    await waitFor(() => expect(card("files")).toBeNull());
    expect(card("skills")).toBeNull();
    expect(screen.queryByRole("button", { name: "Get API key" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Build an agent" })).toBeNull();
    expect(card("models")).toHaveAttribute("href", "/models");
    expect(headings()).toEqual(["Usage overview", "Models", "Resources"]);
    expect(
      screen.getByRole("link", { name: "API documentation" }),
    ).toBeVisible();
    expect(document.querySelector("[data-no-resource-access]")).toBeNull();
  });

  it.each([
    [8, "Test administrator", "operator", "Good morning, Test"],
    [12, "Amélie Dupont", "operator", "Good afternoon, Amélie"],
    [18, "   ", "operator", "Good evening, operator"],
    [23, "", undefined, "Good evening"],
  ] as const)(
    "greets the visitor at local hour %i",
    (hour, name, login, text) => {
      const clock = vi.spyOn(Date.prototype, "getHours").mockReturnValue(hour);
      try {
        renderDashboard(undefined, 404, true, name, login);
        expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
          text,
        );
      } finally {
        clock.mockRestore();
      }
    },
  );

  it("puts the enabled shortcuts above the Models and Resources sections", () => {
    renderDashboard(undefined, 404, true);
    expect(headings()).toEqual(["Models", "Resources"]);
    expect(screen.getByRole("button", { name: "Get API key" })).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Build an agent" }),
    ).toHaveAttribute("href", "/workspaces/default/agents/new");
    expect(
      [...document.querySelectorAll("[data-dashboard-card]")].map((a) =>
        a.getAttribute("href"),
      ),
    ).toEqual([
      "/workspaces/default/playground",
      "/models",
      "/workspaces/default/skills",
      "/workspaces/default/files",
    ]);
    expect(screen.queryByRole("region", { name: "Usage overview" })).toBeNull();
  });

  it("loads usage only when its probe succeeds", async () => {
    renderDashboard([]);
    await screen.findByRole("region", { name: "Usage overview" });
    await waitFor(() =>
      expect(
        vi
          .mocked(fetch)
          .mock.calls.some(([url]) => String(url).includes("usage/daily")),
      ).toBe(true),
    );
  });

  it("keeps public model information when gateway reads are unavailable", async () => {
    renderDashboard(["model-gateway"]);
    await waitFor(() => expect(card("models")).toBeNull());
    expect(screen.queryByRole("region", { name: "Usage overview" })).toBeNull();
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(([url]) => String(url).includes("usage/daily")),
    ).toBe(false);
    expect(
      screen.getByRole("button", { name: "Compare models" }),
    ).toBeVisible();
    expect(card("files")).toBeVisible();
  });

  it("omits an empty Resources section and keeps the remaining shortcuts", async () => {
    renderDashboard(["model-gateway", "skills", "files"]);
    await waitFor(() => expect(headings()).toEqual(["Models"]));
    expect(screen.getByRole("link", { name: "Build an agent" })).toBeVisible();
    expect(document.querySelector("[data-no-resource-access]")).toBeNull();
  });
});

// Probe status is authoritative; an absent route is not an account refusal.
it.each([
  ["all-unimplemented", 404, false, false],
  ["all-denied", 403, false, true],
  ["mixed-denied-unimplemented", 404, true, true],
  ["unknown-outage", 503, false, false],
])("native dashboard diagnosis: %s", async (_name, status, mixed, denied) => {
  document.documentElement.dataset.consoleAuth = "platform";
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  vi.stubGlobal(
    "fetch",
    withTestSession(
      vi.fn(async (url: string) => {
        const code = mixed && url.includes("/members?") ? 403 : status;
        return Response.json(
          {
            error: {
              type:
                code === 403
                  ? "permission_error"
                  : code === 404
                    ? "not_found_error"
                    : "api_error",
              message: "probe refused",
            },
          },
          { status: code },
        );
      }),
    ),
  );
  render(
    <QueryClientProvider client={client}>
      <DashboardPage />
    </QueryClientProvider>,
  );
  await waitFor(() =>
    expect(
      client.getQueryState(["surfaces", undefined, undefined])?.status,
    ).toBe("success"),
  );
  expect(document.querySelectorAll("[data-dashboard-card]").length).toBe(
    status === 503 ? 3 : 0,
  );
  expect(!!document.querySelector("[data-no-resource-access]")).toBe(denied);
  client.clear();
});
