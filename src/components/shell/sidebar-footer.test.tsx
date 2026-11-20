import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
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
        <SidebarFooter version="v9.9.9" />
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
  expect(within(panel).getByText("Platform Connected")).toBeVisible();
  expect(within(panel).getByText("v9.9.9")).toBeVisible();
  expect(within(panel).getByRole("button", { name: "Sign out" })).toBeVisible();
});
