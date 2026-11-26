import { withTestSession } from "@/../test/session-fixture";
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
  usePathname: () => "/workspaces/default/files",
  useSearchParams: () => new URLSearchParams(),
}));

const file = (
  over: Partial<PlatformFile> & { id: string; filename: string },
): PlatformFile => ({
  type: "file",
  mime_type: "text/plain",
  size_bytes: 512,
  downloadable: false,
  expires_at: null,
  created_at: "2026-08-01T09:12:00Z",
  ...over,
});

const filePage = (
  data: PlatformFile[],
  over?: { next_page?: string | null },
) => ({
  data,
  next_page: over?.next_page ?? null,
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
  vi.stubGlobal("fetch", withTestSession(fetchMock));
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
      withTestSession(vi.fn(() => new Promise<Response>(() => {}))),
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

  it("hides the surface when the deployment does not implement it", async () => {
    stubFetch(() =>
      json(
        {
          type: "error",
          error: {
            type: "not_found_error",
            message: "Not found",
          },
        },
        404,
      ),
    );
    renderPage();
    const standIn = await screen.findByTestId("unavailable-surface");
    expect(standIn.getAttribute("data-surface")).toBe("files");
    expect(screen.queryByTestId("error-state")).toBeNull();
    // Nothing left to act on a surface the platform does not serve.
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("shows the empty state when there are no files", async () => {
    stubFetch(() => json(filePage([])));
    renderPage();
    expect(await screen.findByText("No files yet")).toBeInTheDocument();
  });

  it("surfaces a proxy 404 on the collection", async () => {
    stubFetch(() => new Response("Proxy route missing", { status: 404 }));
    renderPage();
    expect(await screen.findByTestId("error-state")).toHaveTextContent(
      "HTTP 404",
    );
    expect(screen.queryByText("No files yet")).toBeNull();
  });

  it("surfaces a proxy 404 during exact lookup", async () => {
    stubFetch((url) =>
      url.pathname.endsWith("/files")
        ? json(filePage([]))
        : new Response("Proxy route missing", { status: 404 }),
    );
    renderPage();
    await screen.findByText("No files yet");
    await userEvent.type(
      screen.getByRole("textbox", { name: "Find file by ID" }),
      "missing{Enter}",
    );
    expect(await screen.findByTestId("error-state")).toHaveTextContent(
      "HTTP 404",
    );
    expect(screen.queryByText("File not found")).toBeNull();
  });

  it("renders file rows with size and downloadable flags", async () => {
    const fetchMock = stubFetch(() =>
      json(
        filePage([
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
          }),
        ]),
      ),
    );
    renderPage();

    expect(await screen.findByText("notes.txt")).toBeInTheDocument();
    expect(screen.getByText("512 bytes")).toBeInTheDocument();
    expect(screen.getByText("10.0 KB")).toBeInTheDocument();
    expect(screen.getByText("2.5 MB")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Download big.bin" }),
    ).toHaveAttribute("download", "big.bin");
    expect(
      screen.getByRole("button", { name: "Download notes.txt" }),
    ).toBeDisabled();
    // The unfiltered list carries uploads only (platform #578): no scope is
    // asked for and none is shown.
    expect(
      new URL(
        String(fetchMock.mock.calls[0][0]),
        "http://console.test",
      ).searchParams.has("scope_id"),
    ).toBe(false);
    expect(
      screen.queryByRole("columnheader", { name: "Scope" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("session output")).not.toBeInTheDocument();
  });

  it("uploads a picked file as multipart form data", async () => {
    const fetchMock = stubFetch((url, init) => {
      if (
        init?.method === "POST" &&
        url.pathname === "/api/organizations/default/proxy/v1/files"
      )
        return json(file({ id: "file_9", filename: "new.txt" }));
      return json(filePage([]));
    });
    renderPage();
    await screen.findByText("No files yet");

    await userEvent.click(
      screen.getAllByRole("button", { name: "Upload file" })[0],
    );
    const input = screen.getByLabelText("File to upload");
    fireEvent.change(input, {
      target: { files: [new File(["hi"], "new.txt", { type: "text/plain" })] },
    });

    expect(
      fetchMock.mock.calls.some(([, init]) => init?.method === "POST"),
    ).toBe(false);
    await userEvent.click(screen.getByRole("button", { name: "Upload" }));
    await waitFor(() => {
      const post = fetchMock.mock.calls.find(([, init]) => init?.method);
      expect(post).toBeDefined();
      const [url, init] = post!;
      expect(String(url)).toBe("/api/organizations/default/proxy/v1/files");
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
      return json(filePage([]));
    });
    renderPage();
    await screen.findByText("No files yet");

    await userEvent.click(
      screen.getAllByRole("button", { name: "Upload file" })[0],
    );
    fireEvent.change(screen.getByLabelText("File to upload"), {
      target: { files: [new File(["x"], "big.bin")] },
    });
    await userEvent.click(screen.getByRole("button", { name: "Upload" }));
    expect(await screen.findByText("too large")).toBeInTheDocument();
  });

  it("deletes a file from its row action", async () => {
    const fetchMock = stubFetch((url, init) => {
      if (init?.method === "DELETE")
        return json({ id: "file_1", type: "file" });
      return json(filePage([file({ id: "file_1", filename: "notes.txt" })]));
    });
    renderPage();
    await screen.findByText("notes.txt");

    await userEvent.click(
      screen.getByRole("button", { name: "Actions for notes.txt" }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Delete" }),
    );
    expect(
      fetchMock.mock.calls.some(([, init]) => init?.method === "DELETE"),
    ).toBe(false);
    await userEvent.click(
      await screen.findByRole("button", { name: "Delete file" }),
    );
    await waitFor(() => {
      const del = fetchMock.mock.calls.find(
        ([, init]) => init?.method === "DELETE",
      );
      expect(String(del?.[0])).toBe(
        "/api/organizations/default/proxy/v1/files/file_1",
      );
    });
  });

  it("pages with the opaque next_page token and returns through the client stack", async () => {
    const fetchMock = stubFetch((url) =>
      url.searchParams.get("page") === "opaque+/cursor="
        ? json(filePage([file({ id: "file_2", filename: "page-two.txt" })]))
        : json(
            filePage([file({ id: "file_1", filename: "notes.txt" })], {
              next_page: "opaque+/cursor=",
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
    expect(next.searchParams.has("after_id")).toBe(false);
    expect(next.searchParams.get("page")).toBe("opaque+/cursor=");

    await userEvent.click(
      screen.getByRole("button", { name: "Previous page" }),
    );
    await waitFor(() => {
      const last = new URL(
        String(fetchMock.mock.calls.at(-1)?.[0]),
        "http://console.test",
      );
      expect(last.searchParams.get("page")).toBeNull();
    });
  });
});
