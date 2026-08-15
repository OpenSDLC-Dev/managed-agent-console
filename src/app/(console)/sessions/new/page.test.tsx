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
import NewSessionPage from "./page";

const pushSpy = vi.fn();
const backSpy = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushSpy,
    back: backSpy,
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => "/sessions/new",
  useSearchParams: () => new URLSearchParams(),
}));

// Minimal harness for base-ui's portal Select (status-filter.test.tsx pattern).
vi.mock("@/components/ui/select", async () => {
  const React = await vi.importActual<typeof import("react")>("react");
  interface CtxShape {
    value: string;
    onValueChange: (value: string) => void;
  }
  const Ctx = React.createContext<CtxShape>({
    value: "",
    onValueChange: () => {},
  });
  return {
    Select: ({
      value,
      onValueChange,
      children,
    }: CtxShape & { children?: React.ReactNode }) =>
      React.createElement(
        Ctx.Provider,
        { value: { value, onValueChange } },
        children,
      ),
    SelectTrigger: (props: {
      children?: React.ReactNode;
      "aria-label"?: string;
    }) =>
      React.createElement(
        "button",
        { type: "button", "aria-label": props["aria-label"] },
        props.children,
      ),
    SelectValue: () => {
      const ctx = React.useContext(Ctx);
      return React.createElement("span", null, ctx.value);
    },
    SelectContent: ({ children }: { children?: React.ReactNode }) =>
      React.createElement("div", null, children),
    SelectItem: ({
      value,
      children,
    }: {
      value: string;
      children?: React.ReactNode;
    }) => {
      const ctx = React.useContext(Ctx);
      return React.createElement(
        "button",
        { type: "button", onClick: () => ctx.onValueChange(value) },
        children,
      );
    },
  };
});

const agent = {
  id: "agt_1",
  type: "agent",
  name: "Support bot",
  version: 2,
  model: { id: "claude-sonnet-4-8" },
  system: "",
  description: "",
  tools: [],
  mcp_servers: [],
  skills: [],
  multiagent: null,
  metadata: {},
  created_at: "2026-08-01T09:12:00Z",
  updated_at: "2026-08-01T10:00:00Z",
  archived_at: null,
};

const environment = {
  id: "env_1",
  type: "environment",
  name: "Prod sandbox",
  description: "",
  config: { type: "self_hosted" },
  scope: "organization",
  metadata: {},
  created_at: "2026-08-01T09:12:00Z",
  updated_at: "2026-08-01T10:00:00Z",
  archived_at: null,
};

const vault = {
  id: "vlt_1",
  type: "vault",
  display_name: "Team creds",
  metadata: {},
  created_at: "2026-08-01T09:12:00Z",
  updated_at: "2026-08-01T10:00:00Z",
  archived_at: null,
};

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });

function stubFetch(over?: {
  vaults?: unknown[];
  onCreate?: () => Response;
  onUpload?: () => Response;
}) {
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://console.test");
      if (init?.method === "POST") {
        if (url.pathname === "/api/platform/v1/files")
          return over?.onUpload
            ? over.onUpload()
            : json({
                id: "file_1",
                type: "file",
                filename: "notes.txt",
                mime_type: "text/plain",
                size_bytes: 5,
                downloadable: false,
                scope: null,
                created_at: "2026-08-02T00:00:00Z",
              });
        if (url.pathname === "/api/platform/v1/sessions")
          return over?.onCreate ? over.onCreate() : json({ id: "sess_9" });
      }
      if (url.pathname === "/api/platform/v1/agents")
        return json({ data: [agent] });
      if (url.pathname === "/api/platform/v1/environments")
        return json({ data: [environment] });
      if (url.pathname === "/api/platform/v1/vaults")
        return json({ data: over?.vaults ?? [vault] });
      throw new Error(`unmatched fetch: ${url.pathname}`);
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
      <NewSessionPage />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("NewSessionPage", () => {
  it("disables Create session until an agent and environment are picked", async () => {
    stubFetch();
    renderPage();

    const create = screen.getByRole("button", { name: "Create session" });
    expect(create).toBeDisabled();

    await userEvent.click(
      await screen.findByRole("button", { name: "Support bot · v2" }),
    );
    expect(create).toBeDisabled();
    await userEvent.click(
      screen.getByRole("button", { name: "Prod sandbox · Self-hosted" }),
    );
    expect(create).toBeEnabled();
  });

  it("creates a session with title and vault bindings, then navigates to it", async () => {
    const fetchMock = stubFetch();
    renderPage();

    await userEvent.click(
      await screen.findByRole("button", { name: "Support bot · v2" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Prod sandbox · Self-hosted" }),
    );
    await userEvent.type(screen.getByLabelText("Title (optional)"), "Run 1");
    // Toggle the vault binding off and on again — the final body keeps it.
    await userEvent.click(
      screen.getByRole("button", { name: "Credential vaults" }),
    );
    const checkbox = await screen.findByRole("checkbox");
    await userEvent.click(checkbox);
    await userEvent.click(checkbox);
    await userEvent.click(checkbox);
    await userEvent.click(
      screen.getByRole("button", { name: "Create session" }),
    );

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(
        ([url, init]) =>
          init?.method === "POST" &&
          String(url) === "/api/platform/v1/sessions",
      );
      expect(post).toBeDefined();
      expect(JSON.parse(post![1]?.body as string)).toEqual({
        agent: "agt_1",
        environment_id: "env_1",
        title: "Run 1",
        vault_ids: ["vlt_1"],
      });
    });
    await waitFor(() =>
      expect(pushSpy).toHaveBeenCalledWith("/sessions/sess_9"),
    );
  });

  it("uploads an attachment, mounts it as a resource, and supports removal", async () => {
    const fetchMock = stubFetch({ vaults: [] });
    renderPage();
    await screen.findByRole("button", { name: "Support bot · v2" });
    // No vaults on the platform — the vault section stays hidden.
    expect(screen.queryByText("Credential vaults")).toBeNull();

    // The visible button forwards the click to the hidden file input.
    await userEvent.click(screen.getByRole("button", { name: /Attach file/ }));
    fireEvent.change(screen.getByLabelText("Upload file"), {
      target: {
        files: [new File(["hi"], "notes.txt", { type: "text/plain" })],
      },
    });
    expect(await screen.findByText("notes.txt")).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Support bot · v2" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Prod sandbox · Self-hosted" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Create session" }),
    );
    await waitFor(() => {
      const post = fetchMock.mock.calls.find(
        ([url, init]) =>
          init?.method === "POST" &&
          String(url) === "/api/platform/v1/sessions",
      );
      expect(JSON.parse(post![1]?.body as string)).toEqual({
        agent: "agt_1",
        environment_id: "env_1",
        resources: [{ type: "file", file_id: "file_1" }],
      });
    });
  });

  it("removes an attached file before create", async () => {
    stubFetch({ vaults: [] });
    renderPage();
    await screen.findByRole("button", { name: "Support bot · v2" });

    fireEvent.change(screen.getByLabelText("Upload file"), {
      target: {
        files: [new File(["hi"], "notes.txt", { type: "text/plain" })],
      },
    });
    await screen.findByText("notes.txt");

    await userEvent.click(
      screen.getByRole("button", { name: "Remove notes.txt" }),
    );
    expect(screen.queryByText("notes.txt")).toBeNull();
  });

  it("surfaces the create error with its request id", async () => {
    stubFetch({
      onCreate: () =>
        json(
          {
            type: "error",
            request_id: "req_s9",
            error: {
              type: "invalid_request_error",
              message: "environment is archived",
            },
          },
          400,
        ),
    });
    renderPage();

    await userEvent.click(
      await screen.findByRole("button", { name: "Support bot · v2" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Prod sandbox · Self-hosted" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Create session" }),
    );

    expect(
      await screen.findByText(/environment is archived/),
    ).toBeInTheDocument();
    expect(screen.getByText(/req_s9/)).toBeInTheDocument();
  });

  it("surfaces an upload error without blocking the form", async () => {
    stubFetch({
      vaults: [],
      onUpload: () =>
        json(
          {
            type: "error",
            error: { type: "invalid_request_error", message: "upload refused" },
          },
          413,
        ),
    });
    renderPage();
    await screen.findByRole("button", { name: "Support bot · v2" });

    fireEvent.change(screen.getByLabelText("Upload file"), {
      target: { files: [new File(["x"], "big.bin")] },
    });
    expect(await screen.findByText(/upload refused/)).toBeInTheDocument();
  });

  it("cancel goes back", async () => {
    stubFetch();
    renderPage();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(backSpy).toHaveBeenCalledTimes(1);
  });
});
