import "@testing-library/jest-dom/vitest";
import { useRef, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { copyText } from "@/lib/copy-text";
import { useUpdateApiKey } from "@/lib/platform/queries";
import type { ApiKeyListItem } from "@/lib/platform/types";
import { ApiKeyDetails } from "./api-key-detail";
import { ApiKeysTable } from "./api-key-list";

vi.mock("@/lib/copy-text", () => ({ copyText: vi.fn(async () => true) }));

const first: ApiKeyListItem = {
  id: "apikey_first",
  type: "api_key",
  name: "First key",
  created_at: "2026-11-01T00:00:00Z",
  expires_at: null,
  created_by: { id: "user_owner", type: "user" },
  principal: { type: "user_actor", user_id: "user_owner" },
  can_manage: true,
  status: "active",
  partial_key_hint: "sk…first",
  workspace_id: null,
};
const second: ApiKeyListItem = {
  ...first,
  id: "apikey_second/old",
  name: "Second key",
  status: "expired",
  can_manage: false,
  principal: null,
  created_by: null,
  partial_key_hint: "sk…second",
};

async function openDetails() {
  function View() {
    const update = useUpdateApiKey();
    const [id, setId] = useState<string | null>(null);
    const opener = useRef<HTMLButtonElement>(null);
    const rows = [first, second];
    return (
      <>
        <button ref={opener} onClick={() => setId(first.id)}>
          Open first key
        </button>
        <ApiKeyDetails
          apiKey={rows.find((row) => row.id === id)}
          rows={rows}
          onSelect={setId}
          onClose={() => setId(null)}
          finalFocus={opener}
          update={update}
          canViewCost
        />
      </>
    );
  }
  render(
    <QueryClientProvider client={new QueryClient()}>
      <View />
    </QueryClientProvider>,
  );
  const user = userEvent.setup();
  const opener = screen.getByRole("button", { name: "Open first key" });
  await user.click(opener);
  return { user, opener };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("switches the open drawer by clicking another visible key in the real table", async () => {
  const user = userEvent.setup();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ApiKeysTable
        keys={[first, second]}
        loading={false}
        error={null}
        canViewCost
      />
    </QueryClientProvider>,
  );
  const firstRowButton = screen.getByRole("button", { name: first.name });
  await user.click(firstRowButton);
  const panel = await screen.findByRole("dialog", { name: first.name });
  const nextRow = screen.getByRole("button", { name: second.name });
  await user.click(nextRow);
  expect(await screen.findByRole("dialog", { name: second.name })).toBe(panel);
  await user.click(within(firstRowButton.closest("tr")!).getByText("Never"));
  expect(await screen.findByRole("dialog", { name: first.name })).toBe(panel);
  await user.click(nextRow);
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  await waitFor(() => expect(nextRow).toHaveFocus());
});

it("dismisses the nonmodal details on a page heading or a search click and preserves the external focus", async () => {
  const user = userEvent.setup();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ApiKeysTable
        keys={[first, second]}
        loading={false}
        error={null}
        canViewCost
      />
    </QueryClientProvider>,
  );
  const open = screen.getByRole("button", { name: first.name });
  await user.click(open);
  expect(await screen.findByRole("dialog", { name: first.name })).toBeVisible();
  await user.click(screen.getByRole("heading", { level: 1 }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  await user.click(open);
  expect(await screen.findByRole("dialog", { name: first.name })).toBeVisible();
  const search = screen.getByPlaceholderText("Search keys");
  await user.click(search);
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(search).toHaveFocus();
  await user.keyboard("Second");
  expect(search).toHaveValue("Second");
});

it("copies the resource ID, follows the supplied row order, and restores the opener on Escape", async () => {
  const { user, opener } = await openDetails();
  let panel = within(await screen.findByRole("dialog", { name: first.name }));
  expect(panel.getByRole("button", { name: "Previous" })).toBeDisabled();
  await user.click(panel.getByRole("button", { name: `Copy ${first.id}` }));
  expect(copyText).toHaveBeenCalledExactlyOnceWith(first.id);
  await user.click(panel.getByRole("button", { name: "Next" }));
  panel = within(screen.getByRole("dialog", { name: second.name }));
  expect(panel.getByText("Control plane")).toBeVisible();
  expect(panel.getByText("Unowned")).toBeVisible();
  expect(panel.getByRole("button", { name: "Next" })).toBeDisabled();
  await user.click(panel.getByRole("button", { name: "Previous" }));
  expect(screen.getByRole("dialog", { name: first.name })).toBeVisible();
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(opener).toHaveFocus();
});

it("allows cost inspection of a read-only key without offering writes", async () => {
  const { user } = await openDetails();
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.click(
    screen.getByRole("button", { name: `More actions for ${second.name}` }),
  );
  const menu = within(await screen.findByRole("menu"));
  expect(menu.getAllByRole("menuitem")).toHaveLength(1);
  expect(menu.getByRole("menuitem", { name: "View cost" })).toHaveAttribute(
    "href",
    "/usage?api_key=apikey_second%2Fold&range=mtd",
  );
  await user.keyboard("{Escape}");
  expect(screen.getByRole("dialog", { name: second.name })).toBeVisible();
});

it("discards a pending deletion confirmation when refreshed authority revokes management", async () => {
  const user = userEvent.setup();
  const client = new QueryClient();
  const table = (canManage: boolean) => (
    <QueryClientProvider client={client}>
      <ApiKeysTable
        keys={[{ ...first, can_manage: canManage }]}
        loading={false}
        error={null}
        canViewCost
      />
    </QueryClientProvider>
  );
  const { rerender } = render(table(true));
  await user.click(
    screen.getByRole("button", { name: `More actions for ${first.name}` }),
  );
  await user.click(
    await screen.findByRole("menuitem", { name: "Delete API key" }),
  );
  expect(screen.getByRole("dialog", { name: "Delete API key" })).toBeVisible();
  rerender(table(false));
  expect(screen.queryByRole("dialog")).toBeNull();
  rerender(table(true));
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("cancels deletion inside the drawer without closing it or submitting a write", async () => {
  const { user } = await openDetails();
  const fetchMock = vi
    .spyOn(globalThis, "fetch")
    .mockRejectedValue(new Error("Unexpected key mutation"));
  try {
    const more = screen.getByRole("button", {
      name: `More actions for ${first.name}`,
    });
    await user.click(more);
    await user.click(
      await screen.findByRole("menuitem", { name: "Delete API key" }),
    );
    const confirm = await screen.findByRole("dialog", {
      name: "Delete API key",
    });
    expect(confirm).toHaveTextContent(first.name);
    await waitFor(() =>
      expect(
        within(confirm).getByRole("button", { name: "Cancel" }),
      ).toHaveFocus(),
    );
    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog", { name: first.name })).toBeVisible();
    await waitFor(() => expect(more).toHaveFocus());
    expect(fetchMock).not.toHaveBeenCalled();
  } finally {
    fetchMock.mockRestore();
  }
});
