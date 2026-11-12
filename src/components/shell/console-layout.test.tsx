import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { useEffect, type ReactNode } from "react";
import {
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import ConsoleLayout from "@/app/(console)/layout";
import { Members } from "@/components/console/members";
import { nativeGet } from "@/lib/platform/native";
import { useSessionTrace } from "@/lib/session-trace/use-session-trace";
import { resetSignedOutBounceForTests } from "@/lib/identity/signed-out";

const state = vi.hoisted(() => ({
  client: undefined as QueryClient | undefined,
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/members",
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("./theme-toggle", () => ({ ThemeToggle: () => null }));
vi.mock("./providers", async (original) => {
  const { Providers } = await original<typeof import("./providers")>();
  function Capture() {
    const client = useQueryClient();
    client.setDefaultOptions({
      queries: { ...client.getDefaultOptions().queries, retryDelay: 0 },
    });
    useEffect(() => {
      state.client = client;
    }, [client]);
    return null;
  }
  return {
    Providers: ({ children }: { children: ReactNode }) => (
      <Providers>
        <Capture />
        {children}
      </Providers>
    ),
  };
});
const accountA = {
  signed_in: true,
  id: "user_a",
  role: "admin",
  role_source: "manual",
  name: "Actor A",
  email: "",
  csrf_token: "csrf-a",
  expires_at: "2099-01-01T00:00:00Z",
};
const accountB = { ...accountA, id: "user_b", role: "user", name: "Actor B" };
let actor = accountA;
let metadata: () => Promise<Response>;
let mounts = 0;
let assign: ReturnType<typeof vi.fn>;
let fetcher: ReturnType<typeof vi.fn>;
function PrivatePage() {
  useEffect(() => {
    mounts++;
  }, []);
  const { data } = useQuery({
    queryKey: ["private-members"],
    queryFn: () =>
      nativeGet<{ owner: string }>(
        "/api/console/organizations/default/private-members",
      ),
  });
  const { connection } = useSessionTrace("sesn_private");
  return (
    <div
      data-testid="private-page"
      data-owner={data?.owner}
      data-connection={connection}
    >
      Private page
    </div>
  );
}
function held() {
  let release!: (response: Response) => void;
  const promise = new Promise<Response>((r) => {
    release = r;
  });
  return { promise, release };
}
const refresh = () =>
  act(async () => {
    await state.client!.invalidateQueries({ queryKey: ["console-session"] });
  });
beforeEach(() => {
  resetSignedOutBounceForTests();
  vi.stubEnv("CONSOLE_AUTH_MODE", "platform");
  mounts = 0;
  actor = accountA;
  document.documentElement.dataset.consoleAuth = "platform";
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  assign = vi.fn();
  vi.stubGlobal(
    "window",
    Object.create(window, {
      location: {
        value: {
          origin: "http://localhost",
          pathname: "/members",
          search: "",
          assign,
        },
      },
    }),
  );
  metadata = async () => Response.json(actor);
  fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    if (path === "/api/auth/session") return metadata();
    if (path.includes("/stream?"))
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(": live\n\n"));
            init!.signal!.addEventListener("abort", () => controller.close(), {
              once: true,
            });
          },
        }),
      );
    if (
      path.includes("private-members") ||
      (path.includes("/organizations/default/members") &&
        actor.id !== accountA.id)
    )
      return actor.id === accountA.id
        ? Response.json({ owner: "A-private" })
        : Response.json(
            { error: { type: "permission_error", message: "requires admin" } },
            { status: 403 },
          );
    return Response.json({ data: [], next_page: null });
  });
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => {
  cleanup();
  state.client?.clear();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  localStorage.clear();
  delete document.documentElement.dataset.consoleAuth;
  resetSignedOutBounceForTests();
});
it("probe: actual layout prevents A-private population before a held initial 503 then first successful B retry", async () => {
  const initial = held();
  metadata = () => initial.promise;
  render(
    <ConsoleLayout>
      <PrivatePage />
    </ConsoleLayout>,
  );
  await waitFor(() =>
    expect(fetcher).toHaveBeenCalledWith("/api/auth/session", {
      cache: "no-store",
    }),
  );
  await act(async () => {
    await new Promise((r) => setTimeout(r, 30));
  });
  expect.soft(mounts).toBe(0);
  expect.soft(screen.queryByTestId("private-page")).toBeNull();
  expect.soft(state.client!.getQueryData(["private-members"])).toBeUndefined();
  expect
    .soft(
      state
        .client!.getQueriesData({ queryKey: ["surfaces"] })
        .filter(([, data]) => data !== undefined),
    )
    .toHaveLength(0);
  expect
    .soft(
      fetcher.mock.calls.filter(
        ([path]) =>
          String(path).includes("/api/console/") ||
          String(path).includes("/stream?"),
      ),
    )
    .toHaveLength(0);
  actor = accountB;
  metadata = async () => Response.json(actor);
  await act(async () => {
    initial.release(
      Response.json(
        { error: { type: "api_error", message: "initial outage" } },
        { status: 503 },
      ),
    );
  });
  await screen.findByText("Actor B");
  await waitFor(() =>
    expect(screen.getByTestId("error-state")).toHaveAttribute(
      "data-denied",
      "true",
    ),
  );
  expect(state.client!.getQueryData(["private-members"])).toBeUndefined();
  expect(mounts).toBe(0);
  expect(assign).not.toHaveBeenCalled();
});
it("admits private queries and streams only after a successful initial principal", async () => {
  const initial = held();
  metadata = () => initial.promise;
  render(
    <ConsoleLayout>
      <PrivatePage />
    </ConsoleLayout>,
  );
  expect(screen.queryByTestId("private-page")).toBeNull();
  await act(async () => {
    initial.release(Response.json(actor));
  });
  await waitFor(() =>
    expect(screen.getByTestId("private-page")).toHaveAttribute(
      "data-owner",
      "A-private",
    ),
  );
  await waitFor(() =>
    expect(screen.getByTestId("private-page")).toHaveAttribute(
      "data-connection",
      "live",
    ),
  );
  expect(mounts).toBe(1);
  expect(assign).not.toHaveBeenCalled();
});
it("keeps the initial boundary through persistent unmarked errors and recovers through the same session query", async () => {
  metadata = async () =>
    Response.json(
      { error: { type: "api_error", message: "metadata unavailable" } },
      { status: 503 },
    );
  render(
    <ConsoleLayout>
      <PrivatePage />
    </ConsoleLayout>,
  );
  await screen.findByText("metadata unavailable");
  expect(mounts).toBe(0);
  expect(
    state
      .client!.getQueriesData({ queryKey: ["surfaces"] })
      .filter(([, data]) => data !== undefined),
  ).toHaveLength(0);
  expect(screen.queryByTestId("unavailable-surface")).toBeNull();
  expect(assign).not.toHaveBeenCalled();
  metadata = async () => Response.json(actor);
  await refresh();
  await screen.findByTestId("private-page");
  expect(mounts).toBe(1);
});
it("keeps same-id metadata updates but departs exactly once for a later different principal", async () => {
  render(
    <ConsoleLayout>
      <PrivatePage />
    </ConsoleLayout>,
  );
  await screen.findByTestId("private-page");
  actor = {
    ...accountA,
    name: "Renamed A",
    role: "developer",
    email: "a@example.test",
    csrf_token: "new-csrf",
    expires_at: "2098-01-01T00:00:00Z",
  };
  await refresh();
  await screen.findByText("Renamed A");
  expect(mounts).toBe(1);
  expect(assign).not.toHaveBeenCalled();
  actor = accountB;
  await refresh();
  await waitFor(() =>
    expect(assign).toHaveBeenCalledExactlyOnceWith("http://localhost/"),
  );
  expect(screen.queryByTestId("private-page")).toBeNull();
  await refresh();
  expect(assign).toHaveBeenCalledTimes(1);
});
it.each([false, true])(
  "probe: pending deliberate logout preserves its private boundary (different principal=%s)",
  async (different) => {
    const logout = held();
    const privateRead = held();
    const row = {
      id: "user_sensitive",
      type: "user",
      name: "Sensitive A row",
      email: "private@example.test",
      login_name: "private-member",
      role: "user",
      role_source: "manual",
      status: "active",
      added_at: "2026-10-01T00:00:00Z",
    };
    const originalFetch = fetcher.getMockImplementation()! as typeof fetch;
    fetcher.mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = String(input);
        if (path === "/api/auth/logout") return logout.promise;
        if (path === "/api/auth/config")
          return Response.json({ mode: "password", native_login: true });
        if (
          actor.id === accountB.id &&
          (path.startsWith("/api/console/") ||
            path.startsWith("/api/organizations/") ||
            path.startsWith("/admin/v1/"))
        )
          return privateRead.promise;
        if (path.includes("/api/console/organizations/default/members"))
          return Response.json({
            data: [row],
            has_more: false,
            first_id: row.id,
            last_id: row.id,
          });
        return originalFetch(input, init);
      },
    );
    try {
      render(
        <ConsoleLayout>
          <PrivatePage />
          <Members />
        </ConsoleLayout>,
      );
      await screen.findByText("Sensitive A row");
      await screen.findByText("Actor A");
      expect(mounts).toBe(1);
      const client = state.client;
      fireEvent.click(screen.getByTestId("sign-out"));
      await waitFor(() =>
        expect(fetcher).toHaveBeenCalledWith(
          "/api/auth/logout",
          expect.objectContaining({ method: "POST" }),
        ),
      );
      expect(screen.getByTestId("sign-out")).toBeDisabled();
      actor = different
        ? { ...accountB, csrf_token: "csrf-b" }
        : {
            ...accountA,
            name: "Renamed A",
            role: "developer",
            email: "a@example.test",
            csrf_token: "new-csrf",
            expires_at: "2098-01-01T00:00:00Z",
          };
      await refresh();
      // Drain query notifications and the admission effect before inspecting UI.
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 30));
      });
      expect(state.client).toBe(client);
      expect(
        state.client!.getQueryData<{ id: string }>(["console-session"])?.id,
      ).toBe(actor.id);
      // Retain the cache hazard: withholding, not clearing, isolates B from A.
      expect(
        JSON.stringify(state.client!.getQueriesData({ queryKey: ["members"] })),
      ).toContain("Sensitive A row");
      expect(assign).not.toHaveBeenCalled();
      if (different) {
        expect.soft(screen.queryByText("Sensitive A row")).toBeNull();
        expect.soft(screen.queryByTestId("private-page")).toBeNull();
        expect.soft(screen.queryByText("Actor B")).toBeNull();
        const signOut = screen.queryByTestId("sign-out");
        if (signOut) expect.soft(signOut).toBeDisabled();
      } else {
        expect(screen.queryByText("Sensitive A row")).toBeNull();
        expect(screen.queryByTestId("private-page")).toBeNull();
        expect(screen.getByText("Renamed A")).toBeVisible();
        expect(screen.getByTestId("sign-out")).toBeDisabled();
      }
      expect.soft(mounts).toBe(1);
    } finally {
      await act(async () => {
        privateRead.release(
          Response.json(
            { error: { type: "permission_error", message: "requires admin" } },
            { status: 403 },
          ),
        );
        logout.release(Response.json({ ok: true }));
      });
    }
    await waitFor(() =>
      expect(assign).toHaveBeenCalledExactlyOnceWith("/login"),
    );
    expect(
      fetcher.mock.calls.filter(([path]) => path === "/api/auth/logout"),
    ).toHaveLength(1);
  },
);

it("retains the document principal across actual layout remounts", async () => {
  const first = render(
    <ConsoleLayout>
      <PrivatePage />
    </ConsoleLayout>,
  );
  await screen.findByTestId("private-page");
  first.unmount();
  state.client!.clear();
  actor = accountB;
  render(
    <ConsoleLayout>
      <PrivatePage />
    </ConsoleLayout>,
  );
  await waitFor(() =>
    expect(assign).toHaveBeenCalledExactlyOnceWith("http://localhost/"),
  );
  expect(mounts).toBe(1);
});
it("preserves legacy pending-metadata admission", async () => {
  delete document.documentElement.dataset.consoleAuth;
  vi.stubEnv("CONSOLE_AUTH_MODE", "");
  metadata = () => new Promise(() => {});
  render(
    <ConsoleLayout>
      <PrivatePage />
    </ConsoleLayout>,
  );
  await screen.findByTestId("private-page");
  expect(mounts).toBe(1);
});

it("server-selected native mode withholds private markup before hydration", () => {
  delete document.documentElement.dataset.consoleAuth;
  const markup = renderToString(
    <ConsoleLayout>
      <p>Private server child</p>
    </ConsoleLayout>,
  );
  expect(markup).not.toContain("Private server child");
  expect(markup).toContain('data-native-identity="loading"');
});
