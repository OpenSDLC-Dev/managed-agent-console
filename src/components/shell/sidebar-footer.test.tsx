import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { resetSignedOutBounceForTests } from "@/lib/identity/signed-out";
import { ConsoleSessionBoundary } from "./console-session";
import { SidebarFooter } from "./sidebar-footer";

beforeEach(resetSignedOutBounceForTests);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  resetSignedOutBounceForTests();
});

it("probes the connection with the account panel closed and shows account actions on demand", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) =>
      String(input).includes("/api/auth/session")
        ? Response.json({
            signed_in: true,
            id: "user_operator",
            name: "Stub Operator",
            email: "op@x.test",
            role: "admin",
            platform_version: "1.2.3",
          })
        : Response.json({ data: [] }),
    ),
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const user = userEvent.setup();
  render(
    <QueryClientProvider client={client}>
      <ConsoleSessionBoundary>
        <SidebarFooter consoleVersion="9.9.9" />
      </ConsoleSessionBoundary>
    </QueryClientProvider>,
  );

  const trigger = await screen.findByRole("button", {
    name: "Stub Operator admin, account menu",
  });
  await screen.findByTitle("Platform Connected");
  expect(trigger).toHaveTextContent("Stub Operator admin");
  expect(trigger).toHaveAccessibleDescription("Platform Connected");
  expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();

  await user.click(trigger);
  const panel = screen.getByRole("dialog", { name: "Account settings" });
  expect(within(panel).getByText("op@x.test")).toBeVisible();
  expect(within(panel).queryByText("Platform Connected")).toBeNull();
  expect(within(panel).queryByText("Theme")).toBeNull();
  expect(panel.querySelector("[data-platform-version]")).toHaveAttribute(
    "data-platform-version",
    "1.2.3",
  );
  expect(within(panel).getByText("Console v9.9.9")).toBeVisible();
  expect(within(panel).getByRole("button", { name: "Sign out" })).toBeVisible();
});

it("derives Playground connectivity from the native session without reading management resources", async () => {
  let available = true;
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    if (String(input) !== "/api/auth/session")
      throw new Error("Unexpected management read");
    if (!available) return new Response("unavailable", { status: 503 });
    return Response.json({
      signed_in: true,
      id: "user_1",
      role: "user",
      playground_access: true,
    });
  });
  vi.stubGlobal("fetch", fetcher);
  const client = new QueryClient({
    defaultOptions: { queries: { retryDelay: 0 } },
  });
  render(
    <QueryClientProvider client={client}>
      <ConsoleSessionBoundary>
        <SidebarFooter consoleVersion="9.9.9" />
      </ConsoleSessionBoundary>
    </QueryClientProvider>,
  );
  const dot = await screen.findByTitle("Platform Connected");
  expect(dot).toHaveAttribute("data-state", "up");
  available = false;
  await act(async () => {
    await client.refetchQueries({ queryKey: ["console-session"] });
  });
  expect(await screen.findByTitle("Platform Unreachable")).toHaveAttribute(
    "data-state",
    "down",
  );
  expect(
    fetcher.mock.calls.every(([url]) => String(url) === "/api/auth/session"),
  ).toBe(true);
});
