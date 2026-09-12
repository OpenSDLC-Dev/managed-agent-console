import "@testing-library/jest-dom/vitest";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { memories } from "../../../test/mock-platform/fixtures.mjs";
import { MemoryTree } from "./memory-tree";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function setup(reply: (url: URL) => Response, revealPath?: string) {
  const fetch = vi.fn(async (input: RequestInfo | URL) =>
    reply(new URL(String(input), location.origin)),
  );
  vi.stubGlobal("fetch", fetch);
  const onSelect = vi.fn();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryTree
        storeId="store"
        selectedId={memories[1].id}
        revealPath={revealPath}
        onSelect={onSelect}
      />
    </QueryClientProvider>,
  );
  return { fetch, onSelect };
}

it("uses server rollups, keyboard traversal and explicit folder expansion", async () => {
  const { fetch, onSelect } = setup((url) =>
    Response.json({
      data:
        url.searchParams.get("path_prefix") === "/decisions/"
          ? [memories[1]]
          : [memories[0], { type: "memory_prefix", path: "/decisions/" }],
      next_page: null,
    }),
  );
  const first = await screen.findByRole("treeitem", { name: /brief.md/ });
  const folder = screen.getByRole("treeitem", { name: "decisions" });
  await userEvent.tab();
  expect(first).toHaveFocus();
  await userEvent.keyboard("{ArrowDown}{ArrowRight}");
  const child = await screen.findByRole("treeitem", {
    name: /architecture.md/,
  });
  await userEvent.keyboard("{ArrowRight}");
  expect(child).toHaveFocus();
  expect(child).toHaveAttribute("aria-selected", "true");
  await userEvent.keyboard("{Enter}");
  expect(onSelect).toHaveBeenCalledWith(memories[1].id);
  await userEvent.keyboard("{ArrowLeft}");
  expect(folder).toHaveFocus();
  await userEvent.keyboard("{ArrowLeft}");
  expect(
    screen.queryByRole("treeitem", { name: /architecture.md/ }),
  ).toBeNull();
  await userEvent.keyboard("{Home}");
  expect(first).toHaveFocus();
  await userEvent.keyboard("{End}");
  expect(folder).toHaveFocus();
  await userEvent.keyboard("{ArrowUp}");
  expect(first).toHaveFocus();
  expect(
    fetch.mock.calls.some(([url]) =>
      String(url).includes("path_prefix=%2Fdecisions%2F&depth=1"),
    ),
  ).toBe(true);
});

it("keeps a keyboard entry after paging and permits returning to the prior cursor", async () => {
  setup((url) =>
    Response.json({
      data: [url.searchParams.has("page") ? memories[1] : memories[0]],
      next_page: url.searchParams.has("page") ? null : "cursor2",
    }),
  );
  await userEvent.click(
    await screen.findByRole("treeitem", { name: /brief.md/ }),
  );
  await userEvent.click(screen.getByRole("button", { name: "Next" }));
  const next = await screen.findByRole("treeitem", { name: /architecture.md/ });
  expect(next).toHaveAttribute("tabindex", "0");
  await userEvent.click(screen.getByRole("button", { name: "Previous" }));
  expect(
    await screen.findByRole("treeitem", { name: /brief.md/ }),
  ).toHaveAttribute("tabindex", "0");
});

it("reveals the selected prefix and allows it to be collapsed", async () => {
  setup(
    (url) =>
      Response.json({
        data:
          url.searchParams.get("path_prefix") === "/"
            ? [{ type: "memory_prefix", path: "/decisions/" }]
            : [memories[1]],
        next_page: null,
      }),
    memories[1].path,
  );
  await screen.findByRole("treeitem", { name: /architecture.md/ });
  await userEvent.click(screen.getByRole("treeitem", { name: "decisions" }));
  expect(
    screen.queryByRole("treeitem", { name: /architecture.md/ }),
  ).toBeNull();
});

it("renders an empty tree without inventing a folder", async () => {
  setup(() => Response.json({ data: [], next_page: null }));
  expect(await screen.findByText("No memories")).toBeVisible();
  expect(screen.queryAllByRole("treeitem")).toHaveLength(0);
});

it("reports a failed prefix query", async () => {
  setup(
    () =>
      new Response(
        JSON.stringify({
          error: { type: "api_error", message: "Cannot load contents" },
        }),
        { status: 503 },
      ),
  );
  await waitFor(() =>
    expect(screen.getByText("Cannot load contents")).toBeVisible(),
  );
});
