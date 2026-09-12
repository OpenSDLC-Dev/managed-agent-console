import { useTestSearchParams } from "../../../test/search-params";
import "@testing-library/jest-dom/vitest";
import { afterEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { memories } from "../../../test/mock-platform/fixtures.mjs";
import { copyText } from "@/lib/copy-text";
import { toast } from "sonner";
import { MemoryContents } from "./memory-contents";
import { UnsavedChangesProvider } from "../shell/unsaved-changes";

vi.mock("@/lib/copy-text", () => ({ copyText: vi.fn(async () => true) }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => useTestSearchParams(),
  useRouter: () => ({ push: vi.fn() }),
}));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function setup({
  selected = memories[0].id,
  archived = false,
  failSave = false,
} = {}) {
  history.replaceState(
    null,
    "",
    "/memory-stores/" +
      memories[0].memory_store_id +
      (selected ? "?memory=" + selected : ""),
  );
  let head = structuredClone(memories[0]);
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), location.origin);
    if (init?.method === "POST") {
      if (failSave)
        return new Response(
          JSON.stringify({
            error: {
              type: "memory_precondition_failed_error",
              message: "The memory changed.",
            },
          }),
          { status: 409 },
        );
      const body = JSON.parse(String(init.body));
      head = { ...head, content: body.content, content_sha256: "saved-digest" };
      return Response.json(head);
    }
    if (init?.method === "DELETE")
      return Response.json({ type: "memory_deleted", id: head.id });
    if (url.pathname.endsWith("/memories"))
      return Response.json({
        data:
          url.searchParams.get("path_prefix") === "/decisions/"
            ? [memories[1]]
            : [head, { type: "memory_prefix", path: "/decisions/" }],
        next_page: null,
      });
    if (url.pathname.endsWith(memories[1].id))
      return Response.json(memories[1]);
    if (!url.pathname.endsWith(head.id))
      return new Response(
        JSON.stringify({
          error: { type: "not_found_error", message: "Memory not found" },
        }),
        { status: 404 },
      );
    return Response.json(head);
  });
  vi.stubGlobal("fetch", fetch);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <UnsavedChangesProvider>
        <MemoryContents storeId={head.memory_store_id} archived={archived} />
      </UnsavedChangesProvider>
    </QueryClientProvider>,
  );
  return { fetch, client, head };
}

it("opens URL-selected content, renders Markdown and preserves exact raw/download bytes", async () => {
  setup();
  expect(
    await screen.findByRole("heading", { name: "Project brief" }),
  ).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Raw" }));
  expect(screen.getByTestId("memory-preview-content").textContent).toBe(
    memories[0].content,
  );
  await userEvent.click(screen.getByRole("button", { name: "Copy code" }));
  expect(copyText).toHaveBeenCalledWith(memories[0].content);
  await userEvent.click(screen.getByRole("button", { name: "Rendered" }));
  const create = vi.fn(() => "blob:download");
  class MockURL extends URL {
    static createObjectURL = create;
    static revokeObjectURL = vi.fn();
  }
  vi.stubGlobal("URL", MockURL);
  const click = vi
    .spyOn(HTMLAnchorElement.prototype, "click")
    .mockImplementation(() => {});
  await userEvent.click(screen.getByRole("button", { name: "Memory actions" }));
  await userEvent.click(screen.getByRole("menuitem", { name: "Download" }));
  expect(create).toHaveBeenCalledWith(expect.any(Blob));
  expect(click.mock.instances[0]).toHaveProperty("download", "brief.md");
});

it("retains the edited snapshot digest and draft across a refetch and rejected save", async () => {
  const { client, fetch, head } = setup({ failSave: true });
  await userEvent.click(
    await screen.findByRole("button", { name: "Edit memory" }),
  );
  fireEvent.change(screen.getByRole("textbox", { name: "Memory content" }), {
    target: { value: "Unsaved bytes\n" },
  });
  act(() =>
    client.setQueryData(["memory", head.memory_store_id, head.id], {
      ...head,
      content: "Remote edit",
      content_sha256: "remote-digest",
    }),
  );
  await userEvent.click(screen.getByRole("button", { name: /^Save/ }));
  expect(await screen.findByText("The memory changed.")).toBeVisible();
  expect(screen.getByRole("textbox", { name: "Memory content" })).toHaveValue(
    "Unsaved bytes\n",
  );
  const [, init] = fetch.mock.calls.find(
    ([, init]) => init?.method === "POST",
  )!;
  expect(JSON.parse(String(init?.body))).toEqual({
    content: "Unsaved bytes\n",
    precondition: {
      type: "content_sha256",
      content_sha256: head.content_sha256,
    },
  });
  await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.getByTestId("memory-preview-content")).toHaveTextContent(
    "Remote edit",
  );
});

it("saves an empty draft with the keyboard and clears dirty navigation after success", async () => {
  const { fetch } = setup();
  await userEvent.click(
    await screen.findByRole("button", { name: "Edit memory" }),
  );
  const input = screen.getByRole("textbox", { name: "Memory content" });
  fireEvent.change(input, { target: { value: "" } });
  fireEvent.keyDown(input, { key: "Enter", ctrlKey: true });
  await waitFor(() =>
    expect(
      screen.queryByRole("textbox", { name: "Memory content" }),
    ).toBeNull(),
  );
  expect(
    JSON.parse(
      String(
        fetch.mock.calls.find(([, init]) => init?.method === "POST")![1]?.body,
      ),
    ).content,
  ).toBe("");
  await userEvent.click(screen.getByRole("treeitem", { name: "decisions" }));
  await userEvent.click(
    await screen.findByRole("treeitem", { name: /architecture.md/ }),
  );
  expect(location.search).toContain(memories[1].id);
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("guards tree selection while editing, with Stay preserving and Leave discarding the draft", async () => {
  setup();
  await userEvent.click(
    await screen.findByRole("button", { name: "Edit memory" }),
  );
  fireEvent.change(screen.getByRole("textbox", { name: "Memory content" }), {
    target: { value: "Keep this" },
  });
  await userEvent.click(screen.getByRole("treeitem", { name: "decisions" }));
  const target = await screen.findByRole("treeitem", {
    name: /architecture.md/,
  });
  await userEvent.click(target);
  const dialog = screen.getByRole("dialog", { name: "Unsaved changes" });
  await userEvent.click(within(dialog).getByRole("button", { name: "Stay" }));
  expect(screen.getByRole("textbox", { name: "Memory content" })).toHaveValue(
    "Keep this",
  );
  await userEvent.click(target);
  await userEvent.click(screen.getByRole("button", { name: "Leave" }));
  expect(await screen.findByText(memories[1].content)).toBeVisible();
});

it("keeps archived content readable without mutation actions", async () => {
  setup({ archived: true });
  await screen.findByRole("heading", { name: "Project brief" });
  expect(screen.queryByRole("button", { name: "Edit memory" })).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "Memory actions" }));
  expect(screen.getByRole("menuitem", { name: "Download" })).toBeEnabled();
  expect(screen.queryByRole("menuitem", { name: "Delete" })).toBeNull();
});

it("does not retrieve an unselected memory and reports missing selected IDs", async () => {
  const { fetch } = setup({ selected: "" });
  await screen.findByRole("treeitem", { name: /brief.md/ });
  expect(
    screen.getByText("Select a memory to view its content."),
  ).toBeVisible();
  expect(
    fetch.mock.calls.every(([input]) =>
      new URL(String(input), location.origin).pathname.endsWith("/memories"),
    ),
  ).toBe(true);
  act(() => history.pushState(null, "", "?memory=missing"));
  expect(await screen.findByText("Memory not found")).toBeVisible();
});

it("copies the full path and reports clipboard failures", async () => {
  setup();
  await userEvent.click(
    await screen.findByRole("button", { name: "Copy path" }),
  );
  expect(copyText).toHaveBeenCalledWith(memories[0].path);
  const error = vi.spyOn(toast, "error");
  vi.mocked(copyText).mockResolvedValueOnce(false);
  await userEvent.click(screen.getByRole("button", { name: "Copy path" }));
  expect(error).toHaveBeenCalledWith("Could not copy to clipboard.");
});

it("deletes using the loaded digest and clears the selected URL after confirmation", async () => {
  const { fetch, head } = setup();
  await userEvent.click(
    await screen.findByRole("button", { name: "Memory actions" }),
  );
  await userEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
  await userEvent.click(screen.getByRole("button", { name: "Delete memory" }));
  await waitFor(() => expect(location.search).toBe(""));
  expect(
    fetch.mock.calls.find(([, init]) => init?.method === "DELETE")?.[0],
  ).toContain("expected_content_sha256=" + head.content_sha256);
});

it("preserves the editor when a background content refresh fails", async () => {
  const { fetch, client, head } = setup();
  await userEvent.click(
    await screen.findByRole("button", { name: "Edit memory" }),
  );
  fireEvent.change(screen.getByRole("textbox", { name: "Memory content" }), {
    target: { value: "Survives a failed refresh" },
  });
  fetch.mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        error: { type: "api_error", message: "Temporarily unavailable" },
      }),
      { status: 503 },
    ),
  );
  await act(() =>
    client.refetchQueries({
      queryKey: ["memory", head.memory_store_id, head.id],
      exact: true,
    }),
  );
  expect(screen.getByRole("textbox", { name: "Memory content" })).toHaveValue(
    "Survives a failed refresh",
  );
  await userEvent.click(screen.getByRole("button", { name: /^Save/ }));
  expect(await screen.findByText("Survives a failed refresh")).toBeVisible();
});

it("renders untrusted Markdown images as explicit links rather than automatic requests", async () => {
  const { client, head } = setup();
  await screen.findByRole("heading", { name: "Project brief" });
  act(() =>
    client.setQueryData(["memory", head.memory_store_id, head.id], {
      ...head,
      content: "![diagram](https://memory-assets.example/diagram.png)",
    }),
  );
  expect(
    await screen.findByRole("link", { name: "Open image: diagram" }),
  ).toHaveAttribute("href", "https://memory-assets.example/diagram.png");
  expect(screen.queryByRole("img")).toBeNull();
  act(() =>
    client.setQueryData(["memory", head.memory_store_id, head.id], {
      ...head,
      content: "![no source]()",
    }),
  );
  expect(await screen.findByText("no source")).toBeVisible();
  expect(screen.queryByRole("img")).toBeNull();
});
