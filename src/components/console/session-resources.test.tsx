import "@testing-library/jest-dom/vitest";
import { afterEach, expect, it, onTestFinished, vi } from "vitest";
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
import { SessionResources } from "./session-resources";
import {
  sessions,
  memoryResources,
} from "../../../test/mock-platform/fixtures.mjs";
import type { PlatformFile, Session } from "@/lib/platform/types";

const repository = {
  id: "sesrsc_repo",
  type: "github_repository",
  url: "https://github.com/example/project",
  mount_path: "/workspace/project",
  checkout: { type: "branch", name: "main" },
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
};
const scope = { id: sessions[0].id, type: "session" as const };
const sessionFile = (over: Partial<PlatformFile> & { id: string }) => ({
  type: "file" as const,
  filename: "input.txt",
  mime_type: "text/plain",
  size_bytes: 88,
  downloadable: false,
  expires_at: null,
  scope,
  created_at: "2026-09-01T00:00:00Z",
  ...over,
});
// The session's own files (#578): the copy its file resource mounts, an output
// harvested from the sandbox, and a copy whose resource was removed.
const copy = sessionFile({ id: "file_copy", filename: "rec141-input.txt" });
const output = sessionFile({
  id: "file_output",
  filename: "reports/summary.csv",
  mime_type: "text/csv",
  size_bytes: 2048,
  downloadable: true,
});
const leftover = sessionFile({ id: "file_leftover", filename: "old.txt" });
const fileResource = {
  id: "sesrsc_file",
  type: "file",
  file_id: copy.id,
  mount_path: "/mnt/session/uploads/rec141-input.txt",
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function setup(
  archived = false,
  {
    resources = [repository, memoryResources[0]] as unknown[],
    files = [] as PlatformFile[],
    filesStatus = 200,
  } = {},
) {
  const session = {
    ...sessions[0],
    resources,
    archived_at: archived ? "2026-09-01T00:00:00Z" : null,
  } as unknown as Session;
  // Mutable, so a test can change what the next poll answers.
  const list = { files, status: filesStatus };
  const fetch = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>(
    async (input) =>
      new Response(
        JSON.stringify(
          !input.startsWith("/api/platform/v1/files?")
            ? repository
            : list.status === 200
              ? { data: list.files, next_page: null }
              : {
                  type: "error",
                  error: {
                    type: list.status === 404 ? "not_found_error" : "api_error",
                    message: "Gone.",
                  },
                },
        ),
        {
          status: input.startsWith("/api/platform/v1/files?")
            ? list.status
            : 200,
          headers: { "content-type": "application/json" },
        },
      ),
  );
  vi.stubGlobal("fetch", fetch);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  client.setQueryData(["session", session.id], session);
  render(
    <QueryClientProvider client={client}>
      <SessionResources session={session} />
    </QueryClientProvider>,
  );
  // Writes only: the session's file list is read on mount.
  const writes = () => fetch.mock.calls.filter(([, init]) => init?.method);
  const lists = () =>
    fetch.mock.calls.filter(([url]) =>
      url.startsWith("/api/platform/v1/files?scope_id="),
    ).length;
  return { fetch, writes, client, session, list, lists };
}

const panel = () => screen.getByTestId("session-resources");

it("lists the session's own files: a mount's size from its copy, then outputs and unmounted copies", async () => {
  const { fetch } = setup(false, {
    resources: [fileResource],
    files: [output, leftover, copy],
  });
  await waitFor(() =>
    expect(panel()).toHaveAttribute("data-session-files", "ready"),
  );
  expect(panel()).toHaveAttribute("data-session-file-count", "3");
  expect(fetch.mock.calls[0]).toEqual([
    `/api/platform/v1/files?scope_id=${sessions[0].id}&limit=1000`,
    { headers: { "anthropic-beta": "managed-agents-2026-04-01" } },
  ]);

  // The mounted copy is the resource's own row, sized from the list.
  const mount = screen
    .getByText(fileResource.mount_path)
    .closest("p") as HTMLElement;
  expect(within(mount).getByText("88 B")).toHaveAttribute(
    "data-size-bytes",
    "88",
  );
  expect(document.querySelector('[data-session-file-id="file_copy"]')).toBe(
    null,
  );

  // Only an output is offered for download.
  const outputRow = document.querySelector(
    '[data-session-file-id="file_output"]',
  ) as HTMLElement;
  expect(outputRow).toHaveAttribute("data-downloadable", "true");
  expect(outputRow).toHaveTextContent("reports/summary.csv");
  expect(outputRow).toHaveTextContent("Output");
  expect(
    within(outputRow).getByRole("link", {
      name: "Download reports/summary.csv",
    }),
  ).toHaveAttribute("href", "/api/platform/v1/files/file_output/content");
  expect(
    within(outputRow).getByRole("link", {
      name: "Download reports/summary.csv",
    }),
  ).toHaveAttribute("download", "reports/summary.csv");
  const leftoverRow = document.querySelector(
    '[data-session-file-id="file_leftover"]',
  ) as HTMLElement;
  expect(leftoverRow).toHaveAttribute("data-downloadable", "false");
  expect(leftoverRow).toHaveTextContent("Upload");
  expect(within(leftoverRow).queryByRole("link")).toBeNull();

  // The filter reaches the files too.
  fireEvent.change(screen.getByLabelText("Filter resources"), {
    target: { value: "summary" },
  });
  expect(screen.queryByText(fileResource.mount_path)).toBeNull();
  expect(screen.getByText("reports/summary.csv")).toBeInTheDocument();
  expect(screen.queryByText("old.txt")).toBeNull();
  fireEvent.change(screen.getByLabelText("Filter resources"), {
    target: { value: "rec141-input" },
  });
  expect(screen.getByText(fileResource.mount_path)).toBeInTheDocument();
  expect(screen.queryByText("reports/summary.csv")).toBeNull();
});

it("keeps an archived session's files listed, still downloadable and deletable, without resource controls", async () => {
  setup(true, { resources: [fileResource], files: [copy, output] });
  await waitFor(() =>
    expect(panel()).toHaveAttribute("data-session-file-count", "2"),
  );
  expect(
    screen.getByRole("link", { name: "Download reports/summary.csv" }),
  ).toBeInTheDocument();
  // files.go deleteFile does not ask about the session's archive.
  expect(
    screen.getByRole("button", { name: "Delete reports/summary.csv" }),
  ).toBeEnabled();
  expect(screen.queryByRole("button", { name: "Attach file" })).toBeNull();
  expect(
    screen.queryByRole("button", { name: /^Remove resource / }),
  ).toBeNull();
});

it.each([
  [500, "error", "The session's files could not be listed. Gone."],
  // The platform lists an unknown scope as empty, so a 404 says the
  // deployment does not serve the list: hidden, as any absent surface is.
  [404, "unavailable", null],
])(
  "keeps the resources usable when the session's files answer %i",
  async (filesStatus, state, message) => {
    setup(false, { resources: [fileResource], filesStatus });
    await waitFor(() =>
      expect(panel()).toHaveAttribute("data-session-files", state),
    );
    if (message) expect(panel()).toHaveTextContent(message);
    else expect(panel()).not.toHaveTextContent("could not be listed");
    expect(
      screen.getByRole("button", {
        name: `Inspect resource ${fileResource.mount_path}`,
      }),
    ).toBeEnabled();
    expect(panel().querySelector("[data-size-bytes]")).toBeNull();
  },
);

it("hides the last listed files once a later poll answers 404", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  onTestFinished(() => {
    vi.useRealTimers();
  });
  const { list, lists } = setup(false, {
    resources: [fileResource],
    files: [copy, output],
  });
  await waitFor(() =>
    expect(panel()).toHaveAttribute("data-session-file-count", "2"),
  );
  expect(panel().querySelectorAll("[data-size-bytes]")).toHaveLength(2);

  list.status = 404;
  await act(async () => {
    await vi.advanceTimersByTimeAsync(15_000);
  });
  await waitFor(() =>
    expect(panel()).toHaveAttribute("data-session-files", "unavailable"),
  );
  // The cache still holds the last list; none of it shows.
  expect(panel()).toHaveAttribute("data-session-file-count", "0");
  expect(panel().querySelector("[data-session-file-id]")).toBeNull();
  expect(panel().querySelector("[data-size-bytes]")).toBeNull();
  expect(screen.getByText(fileResource.mount_path)).toBeInTheDocument();
  // Nor is it polled any more.
  const polled = lists();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(45_000);
  });
  expect(lists()).toBe(polled);
});

it("counts the session's own files as rows: no empty state beside an output", async () => {
  setup(false, { resources: [], files: [output] });
  await waitFor(() =>
    expect(panel()).toHaveAttribute("data-session-file-count", "1"),
  );
  expect(
    panel().querySelector('[data-session-file-id="file_output"]'),
  ).not.toBeNull();
  expect(screen.queryByText("No resources attached.")).toBeNull();
  expect(screen.queryByText("No matching resources.")).toBeNull();

  // A filter that leaves no row says so, though no resource is attached.
  fireEvent.change(screen.getByLabelText("Filter resources"), {
    target: { value: "nothing-matches" },
  });
  expect(panel().querySelector("[data-session-file-id]")).toBeNull();
  expect(screen.getByText("No matching resources.")).toBeInTheDocument();
  expect(screen.queryByText("No resources attached.")).toBeNull();
  fireEvent.change(screen.getByLabelText("Filter resources"), {
    target: { value: "summary" },
  });
  expect(screen.queryByText("No matching resources.")).toBeNull();
});

it("says no resources are attached only when the session has no files either", async () => {
  setup(false, { resources: [], files: [] });
  await waitFor(() =>
    expect(panel()).toHaveAttribute("data-session-files", "ready"),
  );
  expect(screen.getByText("No resources attached.")).toBeInTheDocument();
});

it.each([
  ["an output", output, "Permanently delete this output."],
  ["an unmounted copy", leftover, "The upload it was copied from is kept."],
])(
  "deletes %s after confirming, then reads the session's list again",
  async (_, file, warning) => {
    const { writes, lists } = setup(false, {
      resources: [fileResource],
      files: [copy, file],
    });
    await waitFor(() =>
      expect(panel()).toHaveAttribute("data-session-file-count", "2"),
    );
    const row = panel().querySelector(
      `[data-session-file-id="${file.id}"]`,
    ) as HTMLElement;
    await userEvent.click(
      within(row).getByRole("button", { name: `Delete ${file.filename}` }),
    );
    // Nothing is sent before the confirmation.
    expect(writes()).toEqual([]);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent(warning);
    const before = lists();
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Delete file" }),
    );
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toEqual([
      `/api/platform/v1/files/${file.id}`,
      { method: "DELETE" },
    ]);
    await waitFor(() => expect(lists()).toBe(before + 1));
    // A mounted copy is the resource's row: removed as a resource, not here.
    expect(
      screen.queryByRole("button", { name: `Delete ${copy.filename}` }),
    ).toBeNull();
  },
);

it("attaches an existing file and refreshes the platform session", async () => {
  const { writes, client, session, lists } = setup();
  await userEvent.click(screen.getByRole("button", { name: "Attach file" }));
  fireEvent.change(screen.getByLabelText("File ID"), {
    target: { value: "file_1" },
  });
  fireEvent.change(screen.getByLabelText("Mount path (optional)"), {
    target: { value: "/mnt/session/uploads/note.txt" },
  });
  await userEvent.click(
    within(screen.getByRole("dialog")).getByRole("button", {
      name: "Attach file",
    }),
  );
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(writes()[0]).toEqual([
    `/api/platform/v1/sessions/${session.id}/resources`,
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({
        type: "file",
        file_id: "file_1",
        mount_path: "/mnt/session/uploads/note.txt",
      }),
    }),
  ]);
  expect(client.getQueryState(["session", session.id])?.isInvalidated).toBe(
    true,
  );
  // The mount minted the session's own copy, so its file list is read again.
  await waitFor(() => expect(lists()).toBe(2));
});

it("removes memory using its store id and offers no repository removal", async () => {
  const { writes, session } = setup();
  expect(
    screen.queryByRole("button", { name: "Remove resource sesrsc_repo" }),
  ).toBeNull();
  await userEvent.click(
    screen.getByRole("button", {
      name: `Remove resource ${memoryResources[0].memory_store_id}`,
    }),
  );
  expect(writes()).toEqual([]);
  await userEvent.click(
    screen.getByRole("button", { name: "Remove resource" }),
  );
  await waitFor(() => expect(writes()).toHaveLength(1));
  expect(writes()[0][0]).toBe(
    `/api/platform/v1/sessions/${session.id}/resources/${memoryResources[0].memory_store_id}`,
  );
});

it("submits replacement tokens only in the write request and clears the input", async () => {
  const { writes, session } = setup();
  await userEvent.click(screen.getByRole("button", { name: "Rotate token" }));
  const token = screen.getByLabelText("Authorization token");
  expect(token).toHaveAttribute("type", "password");
  fireEvent.change(token, { target: { value: "test-only-replacement" } });
  await userEvent.click(
    within(screen.getByRole("dialog")).getByRole("button", {
      name: "Rotate token",
    }),
  );
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(writes()[0]).toEqual([
    `/api/platform/v1/sessions/${session.id}/resources/sesrsc_repo`,
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ authorization_token: "test-only-replacement" }),
    }),
  ]);
  await userEvent.click(screen.getByRole("button", { name: "Rotate token" }));
  expect(screen.getByLabelText("Authorization token")).toHaveValue("");
});

it("renders archived attachments without mutation controls", () => {
  setup(true);
  expect(screen.getByText(repository.url)).toBeInTheDocument();
  expect(screen.getByText("Project notes")).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Inspect resource /workspace/project" }),
  ).toBeEnabled();
  expect(screen.queryByRole("button", { name: "Attach file" })).toBeNull();
  expect(
    screen.queryByRole("button", { name: /^Remove resource / }),
  ).toBeNull();
  expect(screen.queryByRole("button", { name: "Rotate token" })).toBeNull();
});
