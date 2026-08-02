import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import FilesPage from "./page";
import type { PlatformFile } from "@/lib/platform/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    back: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => "/files",
  useSearchParams: () => new URLSearchParams(),
}));

const file = (
  over: Partial<PlatformFile> & { id: string; filename: string },
): PlatformFile => ({
  type: "file",
  mime_type: "text/plain",
  size_bytes: 512,
  downloadable: false,
  scope: null,
  created_at: "2026-08-01T09:12:00Z",
  ...over,
});

const classicPage = (
  data: PlatformFile[],
  over?: { has_more?: boolean; last_id?: string | null },
) => ({
  data,
  has_more: over?.has_more ?? false,
  first_id: data[0]?.id ?? null,
  last_id: over?.last_id ?? data.at(-1)?.id ?? null,
});

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });

function stubFetch(
  handler: (url: URL, init?: RequestInit) => Response | undefined,
) {
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://console.test");
      const response = handler(url, init);
      if (!response) throw new Error(`unmatched fetch: ${url.pathname}`);
      return response;
    },
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <FilesPage />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("FilesPage", () => {
  it("shows skeleton rows while the list loads", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})),
    );
    const { container } = renderPage();
    expect(screen.getByText("Files")).toBeInTheDocument();
    expect(container.querySelectorAll("tbody tr")).toHaveLength(3);
  });

  it("surfaces the platform error envelope", async () => {
    stubFetch(() =>
      json(
        { type: "error", error: { type: "api_error", message: "files down" } },
        500,
      ),
    );
    renderPage();
    expect(await screen.findByText("files down")).toBeInTheDocument();
  });

  it("shows the empty state when there are no files", async () => {
    stubFetch(() => json(classicPage([])));
    renderPage();
    expect(await screen.findByText("No files yet")).toBeInTheDocument();
  });

  it("renders file rows with size, scope, and downloadable flags", async () => {
    stubFetch(() =>
      json(
        classicPage([
          file({ id: "file_1", filename: "notes.txt" }),
          file({
            id: "file_2",
            filename: "mid.csv",
            mime_type: "text/csv",
            size_bytes: 10240,
          }),
          file({
            id: "file_3",
            filename: "big.bin",
            mime_type: "application/octet-stream",
            size_bytes: 2.5 * 1024 * 1024,
            downloadable: true,
            scope: { id: "sess_1", type: "session" },
          }),
        ]),
      ),
    );
    renderPage();

    expect(await screen.findByText("notes.txt")).toBeInTheDocument();
    expect(screen.getByText("512 B")).toBeInTheDocument();
    expect(screen.getByText("10.0 KB")).toBeInTheDocument();
    expect(screen.getByText("2.5 MB")).toBeInTheDocument();
    expect(screen.getByText("session output")).toBeInTheDocument();
    expect(screen.getAllByText("upload")).toHaveLength(2);
    expect(screen.getByText("yes")).toBeInTheDocument();
    expect(screen.getAllByText("no")).toHaveLength(2);
  });

  it("uploads a picked file as multipart form data", async () => {
    const fetchMock = stubFetch((url, init) => {
      if (init?.method === "POST" && url.pathname === "/api/platform/v1/files")
        return json(file({ id: "file_9", filename: "new.txt" }));
      return json(classicPage([]));
    });
    renderPage();
    await screen.findByText("No files yet");

    // The visible button forwards the click to the hidden file input.
    await userEvent.click(screen.getByRole("button", { name: "Upload file" }));
    const input = screen.getByLabelText("Upload file");
    fireEvent.change(input, {
      target: { files: [new File(["hi"], "new.txt", { type: "text/plain" })] },
    });

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(([, init]) => init?.method);
      expect(post).toBeDefined();
      const [url, init] = post!;
      expect(String(url)).toBe("/api/platform/v1/files");
      const form = init?.body as FormData;
      expect((form.get("file") as File).name).toBe("new.txt");
    });
  });

  it("shows the upload error inline when the platform refuses", async () => {
    stubFetch((url, init) => {
      if (init?.method === "POST")
        return json(
          {
            type: "error",
            error: { type: "invalid_request_error", message: "too large" },
          },
          413,
        );
      return json(classicPage([]));
    });
    renderPage();
    await screen.findByText("No files yet");

    fireEvent.change(screen.getByLabelText("Upload file"), {
      target: { files: [new File(["x"], "big.bin")] },
    });
    expect(
      await screen.findByText("Upload failed: too large"),
    ).toBeInTheDocument();
  });

  it("deletes a file from its row action", async () => {
    const fetchMock = stubFetch((url, init) => {
      if (init?.method === "DELETE")
        return json({ id: "file_1", type: "file" });
      return json(classicPage([file({ id: "file_1", filename: "notes.txt" })]));
    });
    renderPage();
    await screen.findByText("notes.txt");

    await userEvent.click(
      screen.getByRole("button", { name: "Delete notes.txt" }),
    );
    await waitFor(() => {
      const del = fetchMock.mock.calls.find(
        ([, init]) => init?.method === "DELETE",
      );
      expect(String(del?.[0])).toBe("/api/platform/v1/files/file_1");
    });
  });

  it("pages forward via after_id and back through the client stack", async () => {
    const fetchMock = stubFetch((url) =>
      url.searchParams.get("after_id") === "file_1"
        ? json(classicPage([file({ id: "file_2", filename: "page-two.txt" })]))
        : json(
            classicPage([file({ id: "file_1", filename: "notes.txt" })], {
              has_more: true,
            }),
          ),
    );
    renderPage();
    await screen.findByText("notes.txt");
    expect(
      screen.getByRole("button", { name: "Previous page" }),
    ).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(await screen.findByText("page-two.txt")).toBeInTheDocument();
    const next = new URL(
      String(fetchMock.mock.calls.at(-1)?.[0]),
      "http://console.test",
    );
    expect(next.searchParams.get("after_id")).toBe("file_1");

    await userEvent.click(
      screen.getByRole("button", { name: "Previous page" }),
    );
    await waitFor(() => {
      const last = new URL(
        String(fetchMock.mock.calls.at(-1)?.[0]),
        "http://console.test",
      );
      expect(last.searchParams.get("after_id")).toBeNull();
    });
  });
});
