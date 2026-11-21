import "@testing-library/jest-dom/vitest";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiKeysTable } from "./api-keys";
import type { ApiKeyListItem } from "@/lib/platform/types";

const key = (over: Partial<ApiKeyListItem>): ApiKeyListItem => ({
  id: "apikey_owned",
  type: "api_key",
  name: "Owned key",
  workspace_id: null,
  created_at: "2026-08-02T10:30:00Z",
  created_by: { id: "user_operator", type: "user" },
  partial_key_hint: "sk-map-api01-hint",
  status: "active",
  expires_at: null,
  principal: { type: "user_actor", user_id: "user_operator" },
  can_manage: true,
  ...over,
});

const show = (keys: ApiKeyListItem[]) => {
  const fetcher = vi.fn(async () => Response.json({ data: [] }));
  vi.stubGlobal("fetch", fetcher);
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <ApiKeysTable keys={keys} loading={false} error={null} />
    </QueryClientProvider>,
  );
  return fetcher;
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("probe: key inventory never reads or offers obsolete model grants", async () => {
  const fetcher = show([
    key({}),
    key({
      id: "apikey_history",
      name: "Historical key",
      principal: null,
      can_manage: false,
    }),
  ]);
  await userEvent.click(screen.getByRole("button", { name: "Owned key" }));
  expect(fetcher).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: "Model access" })).toBeNull();
  expect(
    screen.queryByRole("button", { name: /Remove model policy/ }),
  ).toBeNull();
});

it.each([
  { type: "user_actor", user_id: "user_operator" } as const,
  { type: "service_account_actor", service_account_id: "svac_ci" } as const,
])(
  "describes owned model authority without inferring the current role ($type)",
  async (principal) => {
    show([key({ principal })]);
    await userEvent.click(screen.getByRole("button", { name: "Owned key" }));
    expect(
      within(screen.getByRole("dialog")).getByText(
        "Owner's role · organization limits",
      ),
    ).toHaveAttribute("data-models", "owner");
  },
);

it("keeps a historical unowned row without claiming a built-in grant", async () => {
  show([key({ principal: null, created_by: null, can_manage: false })]);
  await userEvent.click(screen.getByRole("button", { name: "Owned key" }));
  expect(screen.getByText("No owner")).toHaveAttribute(
    "data-models",
    "unowned",
  );
  expect(screen.queryByText(/built-in/)).toBeNull();
  expect(screen.queryByText(/Rotate them/)).toBeNull();
  expect(screen.queryByTestId("toggle-apikey_owned")).toBeNull();
});
