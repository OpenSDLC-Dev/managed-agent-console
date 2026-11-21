import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { ServiceAccountDetail } from "@/components/console/service-account-detail";
import { resetSignedOutBounceForTests } from "@/lib/identity/signed-out";
import { ORGANIZATION, type ServiceAccount } from "@/lib/platform/native";
import { ConsoleSessionBoundary } from "./console-session";
import { SurfaceGuard } from "./surface-guard";

vi.mock("next/navigation", () => ({
  usePathname: () => "/service-accounts/svac_release",
}));

const account: ServiceAccount = {
  id: "svac_release",
  type: "service_account",
  name: "release-runner",
  description: null,
  organization_role: "developer",
  created_at: "2026-10-01T12:30:00Z",
  updated_at: "2026-10-01T12:30:00Z",
  created_by_actor_id: null,
  updated_by_actor_id: null,
  archived_at: null,
  archived_by_actor_id: null,
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  resetSignedOutBounceForTests();
});

it("delivers and then discards a key issued while the service account access check was unavailable", async () => {
  const directory = ORGANIZATION + "/service_accounts";
  const keys = ORGANIZATION + "/workspaces/default/api_keys";
  const secret = "synthetic-one-time-value";
  const issue = Promise.withResolvers<Response>();
  const owners: string[] = [];
  let status = 200;
  vi.stubGlobal("fetch", async (input: string, init?: RequestInit) => {
    const url = new URL(input, "http://console");
    if (url.pathname === "/api/auth/session")
      return Response.json({
        signed_in: true,
        id: "user_admin",
        role: "admin",
        csrf_token: "fixture",
      });
    if (
      url.pathname === directory &&
      url.searchParams.get("limit") === "1" &&
      status === 503
    )
      return Response.json(
        {
          type: "error",
          error: { type: "api_error", message: "Directory unavailable" },
        },
        { status },
      );
    if (url.pathname === directory + "/" + account.id)
      return Response.json(account);
    if (url.pathname === keys && init?.method === "POST") {
      owners.push(JSON.parse(String(init.body)).principal_id);
      return issue.promise;
    }
    if (url.pathname === keys) return Response.json([]);
    return Response.json({ data: [], next_page: null });
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <ConsoleSessionBoundary>
        <SurfaceGuard>
          <ServiceAccountDetail id={account.id} listHref="/service-accounts" />
        </SurfaceGuard>
      </ConsoleSessionBoundary>
    </QueryClientProvider>,
  );
  async function probe(next: number) {
    status = next;
    await act(async () => {
      await client.invalidateQueries({ queryKey: ["surfaces"] });
    });
  }
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Create key" }));
  const form = within(
    await screen.findByRole("dialog", { name: "Create API key" }),
  );
  await user.type(
    form.getByLabelText("Name", { exact: true }),
    "deployment-key",
  );
  await user.selectOptions(form.getByLabelText("Expires"), "30d");
  await user.click(form.getByRole("button", { name: "Add" }));
  await waitFor(() => expect(owners).toEqual([account.id]));
  await probe(503);
  await screen.findByText("Unable to confirm access to this surface.");
  expect(screen.queryByRole("dialog", { name: "Create API key" })).toBeNull();

  // Use boolean projections while the one-time response exists so failures never serialize its value.
  const reveals = () =>
    screen.queryAllByRole("dialog", { name: "Save your API key" });
  await act(async () => {
    issue.resolve(
      Response.json({
        id: "apikey_build",
        type: "api_key",
        name: "deployment-key",
        status: "active",
        workspace_id: null,
        created_at: account.created_at,
        created_by: { id: "user_admin", type: "user" },
        expires_at: "2026-10-31T12:30:00Z",
        principal: {
          type: "service_account_actor",
          service_account_id: account.id,
        },
        partial_key_hint: "",
        raw_key: secret,
      }),
    );
  });
  await vi.waitFor(() => expect(client.isMutating()).toBe(0));
  expect(reveals().length).toBe(0);
  await probe(200);
  await vi.waitFor(() => {
    const dialogs = reveals();
    expect(
      dialogs.length === 1 &&
        dialogs[0].querySelector('[data-testid="revealed-api-key"]')
          ?.textContent === secret,
    ).toBe(true);
  });
  const close = reveals()[0].querySelector<HTMLButtonElement>(
    '[data-testid="close-revealed-api-key"]',
  );
  if (!close) throw new Error("Missing close control for the issued key");
  await user.click(close);
  await vi.waitFor(() =>
    expect(document.body.textContent?.includes(secret)).toBe(false),
  );
  await probe(503);
  await probe(200);
  expect(reveals().length).toBe(0);
  expect(owners).toEqual([account.id]);
  client.clear();
});
