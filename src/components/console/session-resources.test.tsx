import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, onTestFinished, vi } from "vitest";
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
import { useSession } from "@/lib/platform/queries";
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

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
const refusal = (status: number, message: string) =>
  reply(
    {
      type: "error",
      error: {
        type: status === 404 ? "not_found_error" : "invalid_request_error",
        message,
      },
    },
    status,
  );

/** The page's own read of the session, from the cache it keeps current. */
function LiveResources({ id }: { id: string }) {
  const session = useSession(id);
  return session.data ? <SessionResources session={session.data} /> : null;
}

function setup(
  archived = false,
  {
    resources = [repository, memoryResources[0]] as unknown[],
    files = [] as PlatformFile[],
    filesStatus = 200,
    // Rendered as the page renders it, the session read from its query, and
    // that read held where a test says so.
    live = false,
  } = {},
) {
  const session = {
    ...sessions[0],
    resources,
    archived_at: archived ? "2026-09-01T00:00:00Z" : null,
  } as unknown as Session;
  // Mutable, so a test can change what the next read answers.
  const list = { files, status: filesStatus };
  const replies: {
    session?: () => Promise<Response>;
    deleteStatus: number;
  } = { deleteStatus: 200 };
  const fetch = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>(
    async (input, init) => {
      if (input.startsWith("/api/platform/v1/files?"))
        return list.status === 200
          ? reply({ data: list.files, next_page: null })
          : refusal(list.status, "Gone.");
      if (input === `/api/platform/v1/sessions/${session.id}` && !init?.method)
        return replies.session?.() ?? reply(session);
      const deleted = /^\/api\/platform\/v1\/files\/([^/]+)$/.exec(input)?.[1];
      if (init?.method === "DELETE" && deleted) {
        if (replies.deleteStatus !== 200)
          return refusal(
            replies.deleteStatus,
            `file ${deleted} is owned by dream drm_1`,
          );
        list.files = list.files.filter((file) => file.id !== deleted);
        return reply({ id: deleted, type: "file_deleted" });
      }
      return reply(repository);
    },
  );
  vi.stubGlobal("fetch", fetch);
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, ...(live ? { staleTime: Infinity } : {}) },
    },
  });
  client.setQueryData(["session", session.id], session);
  render(
    <QueryClientProvider client={client}>
      {live ? (
        <LiveResources id={session.id} />
      ) : (
        <SessionResources session={session} />
      )}
    </QueryClientProvider>,
  );
  // Writes only: the session's file list is read on mount.
  const writes = () => fetch.mock.calls.filter(([, init]) => init?.method);
  const lists = () =>
    fetch.mock.calls.filter(([url]) =>
      url.startsWith("/api/platform/v1/files?scope_id="),
    ).length;
  const sessionReads = () =>
    fetch.mock.calls.filter(
      ([url, init]) =>
        url === `/api/platform/v1/sessions/${session.id}` && !init?.method,
    ).length;
  return {
    fetch,
    writes,
    client,
    session,
    list,
    lists,
    replies,
    sessionReads,
  };
}

/** A promise a test settles itself, to order replies deterministically. */
function held<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
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

  // Only an output is offered for download, named with its id, since two
  // outputs can share a filename.
  const outputRow = document.querySelector(
    '[data-session-file-id="file_output"]',
  ) as HTMLElement;
  expect(outputRow).toHaveAttribute("data-downloadable", "true");
  expect(outputRow).toHaveAttribute("data-expired", "false");
  expect(outputRow).toHaveTextContent("reports/summary.csv");
  expect(outputRow).toHaveTextContent("Output");
  const download = within(outputRow).getByRole("link", {
    name: "Download reports/summary.csv (file_output)",
  });
  expect(download).toHaveAttribute(
    "href",
    "/api/platform/v1/files/file_output/content",
  );
  expect(download).toHaveAttribute("download", "reports/summary.csv");
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
    screen.getByRole("link", {
      name: "Download reports/summary.csv (file_output)",
    }),
  ).toBeInTheDocument();
  // files.go deleteFile does not ask about the session's archive.
  expect(
    screen.getByRole("button", {
      name: "Delete reports/summary.csv (file_output)",
    }),
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
  expect(panel()).toHaveAttribute("data-resources-state", "rows");

  // A filter that leaves no row says so, though no resource is attached.
  fireEvent.change(screen.getByLabelText("Filter resources"), {
    target: { value: "nothing-matches" },
  });
  expect(panel().querySelector("[data-session-file-id]")).toBeNull();
  expect(panel()).toHaveAttribute("data-resources-state", "no-match");
  // The one assertion on that sentence.
  expect(panel()).toHaveTextContent("No matching resources.");
  fireEvent.change(screen.getByLabelText("Filter resources"), {
    target: { value: "summary" },
  });
  expect(panel()).toHaveAttribute("data-resources-state", "rows");
});

it("says no resources are attached only when the session has no files either", async () => {
  setup(false, { resources: [], files: [] });
  await waitFor(() =>
    expect(panel()).toHaveAttribute("data-resources-state", "empty"),
  );
  // The one assertion on that sentence.
  expect(panel()).toHaveTextContent("No resources attached.");
});

it("claims no empty tab while the session's files are loading or failed", async () => {
  const pending = held<Response>();
  vi.stubGlobal(
    "fetch",
    vi.fn(() => pending.promise),
  );
  const session = { ...sessions[0], resources: [] } as unknown as Session;
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  client.setQueryData(["session", session.id], session);
  render(
    <QueryClientProvider client={client}>
      <SessionResources session={session} />
    </QueryClientProvider>,
  );
  expect(panel()).toHaveAttribute("data-resources-state", "loading");
  expect(panel()).not.toHaveTextContent("No resources attached.");
  expect(panel()).not.toHaveTextContent("No matching resources.");

  pending.resolve(refusal(500, "Down."));
  await waitFor(() =>
    expect(panel()).toHaveAttribute("data-resources-state", "error"),
  );
  expect(panel()).not.toHaveTextContent("No resources attached.");
  expect(panel()).toHaveTextContent(
    "The session's files could not be listed. Down.",
  );
});

it.each([
  ["an output", output, "output", "Permanently delete this output."],
  [
    "an unmounted copy",
    leftover,
    "copy",
    "The upload it was copied from is kept.",
  ],
])(
  "deletes %s after confirming, the dialog open until its list is read again",
  async (_, file, kind, warning) => {
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
      await within(row).findByRole("button", {
        name: `Delete ${file.filename} (${file.id})`,
      }),
    );
    // Nothing is sent before the confirmation.
    expect(writes()).toEqual([]);
    const dialog = screen.getByRole("dialog");
    expect(dialog.querySelector("[data-delete-kind]")).toHaveAttribute(
      "data-delete-kind",
      kind,
    );
    // The one assertion on each sentence.
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
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    // The dialog closed only once the list was read again, the row gone.
    expect(lists()).toBe(before + 1);
    expect(panel()).toHaveAttribute("data-session-file-count", "1");
    // A mounted copy is the resource's row: removed as a resource, not here.
    expect(
      screen.queryByRole("button", { name: /^Delete rec141-input\.txt/ }),
    ).toBeNull();
  },
);

it("keeps the confirm dialog open on a refusal and says why in it", async () => {
  const { replies, lists } = setup(false, {
    resources: [fileResource],
    files: [copy, output],
  });
  replies.deleteStatus = 400;
  await userEvent.click(
    await screen.findByRole("button", {
      name: "Delete reports/summary.csv (file_output)",
    }),
  );
  const dialog = screen.getByRole("dialog");
  const before = lists();
  await userEvent.click(
    within(dialog).getByRole("button", { name: "Delete file" }),
  );
  expect(await within(dialog).findByRole("alert")).toHaveTextContent(
    "file file_output is owned by dream drm_1",
  );
  expect(screen.getByRole("dialog")).toBe(dialog);
  expect(
    within(dialog).getByRole("button", { name: "Delete file" }),
  ).toBeEnabled();
  expect(lists()).toBe(before);
  expect(
    panel().querySelector('[data-session-file-id="file_output"]'),
  ).not.toBeNull();

  // Asked again, it goes, and the refusal goes with the dialog.
  replies.deleteStatus = 200;
  await userEvent.click(
    within(dialog).getByRole("button", { name: "Delete file" }),
  );
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(
    panel().querySelector('[data-session-file-id="file_output"]'),
  ).toBeNull();
});

it("moves focus to the next row once a deleted row is gone, else to the filter", async () => {
  setup(false, { resources: [fileResource], files: [copy, output, leftover] });
  const deleteRow = async (name: string) => {
    await userEvent.click(await screen.findByRole("button", { name }));
    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Delete file",
      }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  };
  // Waits for the session to be read after the list, which offers the
  // leftover's Delete.
  await screen.findByRole("button", { name: "Delete old.txt (file_leftover)" });

  await deleteRow("Delete reports/summary.csv (file_output)");
  await waitFor(() =>
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Delete old.txt (file_leftover)" }),
    ),
  );

  await deleteRow("Delete old.txt (file_leftover)");
  await waitFor(() =>
    expect(document.activeElement).toBe(
      screen.getByLabelText("Filter resources"),
    ),
  );
});

it("offers no download of an expired output, and says why", async () => {
  const expired = sessionFile({
    id: "file_expired",
    filename: "stale.csv",
    downloadable: true,
    expires_at: "2026-01-01T00:00:00Z",
  });
  setup(false, { resources: [], files: [expired, output] });
  await waitFor(() =>
    expect(panel()).toHaveAttribute("data-session-file-count", "2"),
  );
  const row = panel().querySelector(
    '[data-session-file-id="file_expired"]',
  ) as HTMLElement;
  expect(row).toHaveAttribute("data-expired", "true");
  expect(within(row).queryByRole("link")).toBeNull();
  expect(row).toHaveTextContent("Expired");
  // Its row can still be deleted, as the platform still lists it.
  expect(
    within(row).getByRole("button", {
      name: "Delete stale.csv (file_expired)",
    }),
  ).toBeEnabled();
  expect(
    screen.getByRole("link", {
      name: "Download reports/summary.csv (file_output)",
    }),
  ).toBeInTheDocument();
});

describe("a copy listed before the session that mounts it", () => {
  const fresh = sessionFile({ id: "file_fresh", filename: "fresh.txt" });
  const freshMount = {
    ...fileResource,
    id: "sesrsc_fresh",
    file_id: fresh.id,
    mount_path: "/mnt/session/uploads/fresh.txt",
  };

  it("is never offered for delete while the session is still being read", async () => {
    const { client, session, list, replies } = setup(false, {
      resources: [],
      files: [],
      live: true,
    });
    await waitFor(() =>
      expect(panel()).toHaveAttribute("data-session-files", "ready"),
    );
    // A mount lands (here or from another client): the session's read is
    // still out when the list's poll answers with the copy.
    // Every read waits for the one answer, each given a Response of its own.
    const sessionReply = held<unknown>();
    replies.session = () => sessionReply.promise.then((body) => reply(body));
    const reread = client.refetchQueries({ queryKey: ["session", session.id] });
    list.files = [fresh];
    await act(() =>
      client.refetchQueries({ queryKey: ["session-files", session.id] }),
    );
    const row = await waitFor(() => {
      const listed = panel().querySelector(
        '[data-session-file-id="file_fresh"]',
      );
      expect(listed).not.toBeNull();
      return listed as HTMLElement;
    });
    expect(within(row).queryByRole("button")).toBeNull();

    // The session answers naming the mount: the copy is its row, which a
    // resource removal, never a file delete, takes away.
    sessionReply.resolve({ ...session, resources: [freshMount] });
    await act(() => reread);
    await waitFor(() =>
      expect(
        panel().querySelector('[data-session-file-id="file_fresh"]'),
      ).toBeNull(),
    );
    expect(screen.getByText(freshMount.mount_path)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Delete / })).toBeNull();
  });

  it("is offered for delete once a read of the session begun after it was listed does not mount it", async () => {
    const { client, session, sessionReads, replies } = setup(false, {
      resources: [],
      files: [leftover],
      live: true,
    });
    // Every read waits for the one answer, each given a Response of its own.
    const sessionReply = held<unknown>();
    replies.session = () => sessionReply.promise.then((body) => reply(body));
    await waitFor(() =>
      expect(panel()).toHaveAttribute("data-session-file-count", "1"),
    );
    // The session the page holds may predate the copy: it is read again,
    // and until it answers the row offers no Delete.
    await waitFor(() => expect(sessionReads()).toBe(1));
    const row = panel().querySelector(
      '[data-session-file-id="file_leftover"]',
    ) as HTMLElement;
    expect(within(row).queryByRole("button")).toBeNull();

    sessionReply.resolve(session);
    expect(
      await within(row).findByRole("button", {
        name: "Delete old.txt (file_leftover)",
      }),
    ).toBeEnabled();
    // Read once for that copy: a later list leaves it deletable.
    expect(sessionReads()).toBe(1);
    await act(() =>
      client.refetchQueries({ queryKey: ["session-files", session.id] }),
    );
    expect(
      within(row).getByRole("button", {
        name: "Delete old.txt (file_leftover)",
      }),
    ).toBeEnabled();
    expect(sessionReads()).toBe(1);
  });

  it("is not even listed after Attach file: the session is read before the list", async () => {
    const { session, writes, lists, list, replies, sessionReads } = setup(
      false,
      { resources: [], files: [], live: true },
    );
    await waitFor(() =>
      expect(panel()).toHaveAttribute("data-session-files", "ready"),
    );
    // Every read waits for the one answer, each given a Response of its own.
    const sessionReply = held<unknown>();
    replies.session = () => sessionReply.promise.then((body) => reply(body));
    list.files = [fresh];
    await userEvent.click(screen.getByRole("button", { name: "Attach file" }));
    fireEvent.change(screen.getByLabelText("File ID"), {
      target: { value: "file_1" },
    });
    const dialog = screen.getByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Attach file" }),
    );
    await waitFor(() => expect(writes()).toHaveLength(1));
    await waitFor(() => expect(sessionReads()).toBe(1));
    // The list waits for the session, and the dialog for both.
    expect(lists()).toBe(1);
    expect(
      within(dialog).getByRole("button", { name: "Attach file" }),
    ).toBeDisabled();

    sessionReply.resolve({ ...session, resources: [freshMount] });
    await waitFor(() => expect(lists()).toBe(2));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(
      panel().querySelector('[data-session-file-id="file_fresh"]'),
    ).toBeNull();
    expect(screen.getByText(freshMount.mount_path)).toBeInTheDocument();
  });
});

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
