import "@testing-library/jest-dom/vitest";
import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  sessions,
  memoryResources,
  memories,
  files,
} from "../../../test/mock-platform/fixtures.mjs";
import type {
  PlatformFile,
  Session,
  SessionResource,
} from "@/lib/platform/types";
import { SessionResources } from "./session-resources";

const fileResource: SessionResource = {
  id: "sesrsc_file",
  type: "file",
  file_id: files[0].id,
  mount_path: "/mnt/notes.md",
  created_at: files[0].created_at,
  updated_at: files[0].created_at,
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
const error = (status: number) =>
  json(
    {
      type: "error",
      error: { type: "not_found_error", message: "Resource unavailable" },
    },
    status,
  );

function setup(
  options: {
    file?: Partial<PlatformFile>;
    memoryContent?: string | null;
    archived?: boolean;
    get?: (path: string) => Response | Promise<Response> | undefined;
  } = {},
) {
  const session = {
    ...sessions[0],
    resources: [memoryResources[0], fileResource],
    archived_at: options.archived ? "2026-09-01T00:00:00Z" : null,
  } as unknown as Session;
  const fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), "http://console.test");
    const custom = options.get?.(url.pathname);
    if (custom) return custom;
    if (url.pathname === `/api/platform/v1/files/${files[0].id}`)
      return json({ ...files[0], ...options.file });
    if (
      url.pathname ===
      `/api/platform/v1/memory_stores/${memoryResources[0].memory_store_id}/memories`
    ) {
      expect(url.searchParams.get("depth")).toBe("1");
      expect(url.searchParams.get("path_prefix")).toBe("/");
      return json({
        data: [{ ...memories[0], content: null }],
        next_page: null,
      });
    }
    if (url.pathname.endsWith(`/memories/${memories[0].id}`)) {
      expect(url.searchParams.get("view")).toBe("full");
      return json({
        ...memories[0],
        content:
          options.memoryContent === undefined
            ? memories[0].content
            : options.memoryContent,
      });
    }
    throw new Error(`Unexpected request: ${url.pathname}`);
  });
  vi.stubGlobal("fetch", fetch);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <SessionResources session={session} />
    </QueryClientProvider>,
  );
  return { fetch, client };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("opens a bound store and its memory inline without leaving the Session", async () => {
  const { fetch } = setup({
    memoryContent:
      "# Inline notes\n\n![Remote image](https://example.invalid/image.png)",
  });
  await userEvent.click(
    screen.getByRole("button", {
      name: "Inspect resource /mnt/memory/project-notes",
    }),
  );
  expect(
    screen.getByRole("region", { name: "Resource preview" }),
  ).toHaveTextContent("Read/write");
  expect(fetch).not.toHaveBeenCalled();
  await userEvent.click(
    screen.getByRole("button", { name: "Expand /mnt/memory/project-notes" }),
  );
  await userEvent.click(
    await screen.findByRole("treeitem", { name: /brief.md/ }),
  );
  const preview = await screen.findByTestId("session-memory-preview");
  expect(
    within(preview).getByRole("heading", { name: "Inline notes" }),
  ).toBeVisible();
  expect(
    within(preview).getByRole("link", { name: /Open in Memory stores/ }),
  ).toHaveAttribute(
    "href",
    `/memory-stores/${memoryResources[0].memory_store_id}?memory=${memories[0].id}`,
  );
  expect(preview.querySelector("[data-size-bytes]")).toHaveAttribute(
    "data-size-bytes",
    String(memories[0].content_size_bytes),
  );
  expect(preview).toHaveAttribute(
    "data-mounted-path",
    "/mnt/memory/project-notes/brief.md",
  );
  expect(preview.querySelector("img")).toBeNull();
  expect(
    within(preview).getByRole("link", { name: "Open image: Remote image" }),
  ).toHaveAttribute("href", "https://example.invalid/image.png");
  await userEvent.click(within(preview).getByRole("button", { name: "Raw" }));
  expect(preview.querySelector("pre")).toHaveTextContent("# Inline notes");
  await userEvent.click(
    within(preview).getByRole("button", { name: "Rendered" }),
  );
  expect(
    within(preview).getByRole("heading", { name: "Inline notes" }),
  ).toBeVisible();
  await userEvent.click(
    screen.getByRole("button", { name: "Clear resource selection" }),
  );
  expect(screen.queryByRole("region", { name: "Resource preview" })).toBeNull();
});

it("filters attached resources while retaining read-only inspection for an archived Session", async () => {
  setup({ archived: true, memoryContent: null });
  await userEvent.type(screen.getByLabelText("Filter resources"), "unmatched");
  expect(screen.getByText("No matching resources.")).toBeVisible();
  await userEvent.clear(screen.getByLabelText("Filter resources"));
  await userEvent.click(
    screen.getByRole("button", { name: "Expand /mnt/memory/project-notes" }),
  );
  await userEvent.click(
    await screen.findByRole("treeitem", { name: /brief.md/ }),
  );
  expect(await screen.findByText("Content is unavailable.")).toBeVisible();
  expect(screen.queryByRole("button", { name: "Attach file" })).toBeNull();
  expect(
    screen.queryByRole("button", { name: /^Remove resource / }),
  ).toBeNull();
});

it("uses file metadata and never requests a non-downloadable upload's content", async () => {
  const { fetch } = setup();
  await userEvent.click(
    screen.getByRole("button", { name: "Inspect resource /mnt/notes.md" }),
  );
  const preview = await screen.findByTestId("session-file-preview");
  expect(
    within(preview).getByRole("heading", { name: "research-notes.md" }),
  ).toBeVisible();
  expect(preview.querySelector("[data-size-bytes]")).toHaveAttribute(
    "data-size-bytes",
    "48213",
  );
  expect(screen.queryByRole("link", { name: "Download" })).toBeNull();
  expect(
    within(preview).getByRole("button", { name: "Copy sesrsc_file" }),
  ).toBeEnabled();
  expect(within(preview).getByText("Attached")).toBeVisible();
  expect(screen.queryByRole("button", { name: "Preview content" })).toBeNull();
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("loads downloadable text only on request, escapes HTML and supports retry after expiry/error", async () => {
  let attempt = 0;
  let finish!: (response: Response) => void;
  const pending = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  const { fetch } = setup({
    file: {
      downloadable: true,
      mime_type: "text/html",
      expires_at: "2026-10-01T00:00:00Z",
    },
    get: (path) =>
      path.endsWith("/content")
        ? ++attempt === 1
          ? pending
          : new Response("<script>window.pwned = true</script><h1>literal</h1>")
        : undefined,
  });
  await userEvent.click(
    screen.getByRole("button", { name: "Inspect resource /mnt/notes.md" }),
  );
  await screen.findByTestId("session-file-preview");
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("link", { name: "Download" })).toHaveAttribute(
    "href",
    `/api/platform/v1/files/${files[0].id}/content`,
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Preview content" }),
  );
  expect(screen.getByText("Loading content…")).toBeVisible();
  finish(error(404));
  await userEvent.click(
    await screen.findByRole("button", { name: "Retry preview" }),
  );
  await waitFor(() =>
    expect(
      screen.getByTestId("session-file-preview").querySelector("pre"),
    ).toHaveTextContent("<script>window.pwned = true</script>"),
  );
  expect(screen.queryByRole("heading", { name: "literal" })).toBeNull();
  expect(attempt).toBe(2);
});

it.each([
  { mime_type: "application/pdf" },
  { mime_type: "text/plain", size_bytes: 1048577 },
])(
  "keeps a large or binary output downloadable without reading its bytes (%j)",
  async (file) => {
    const { fetch } = setup({ file: { ...file, downloadable: true } });
    await userEvent.click(
      screen.getByRole("button", { name: "Inspect resource /mnt/notes.md" }),
    );
    expect(await screen.findByRole("link", { name: "Download" })).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Preview content" }),
    ).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  },
);

it("keeps the Session usable when an attached file is missing", async () => {
  setup({ get: (path) => (path.includes("/files/") ? error(404) : undefined) });
  await userEvent.click(
    screen.getByRole("button", { name: "Inspect resource /mnt/notes.md" }),
  );
  expect(await screen.findByText("Resource unavailable")).toBeVisible();
  await userEvent.click(
    screen.getByRole("button", { name: "Clear resource selection" }),
  );
  expect(screen.getByRole("button", { name: "Attach file" })).toBeEnabled();
});
