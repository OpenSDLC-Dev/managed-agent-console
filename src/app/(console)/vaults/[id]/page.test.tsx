import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Suspense } from "react";
import VaultDetailPage from "./page";
import type { Vault, VaultCredential } from "@/lib/platform/types";

const pushSpy = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushSpy,
    back: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => "/vaults/vlt_1",
  useSearchParams: () => new URLSearchParams(),
}));

const vault = (over?: Partial<Vault>): Vault => ({
  id: "vlt_1",
  type: "vault",
  display_name: "Team creds",
  metadata: { team: "core" },
  created_at: "2026-08-01T09:12:00Z",
  updated_at: "2026-08-01T10:00:00Z",
  archived_at: null,
  ...over,
});

const credential = (
  over: Partial<VaultCredential> & {
    id: string;
    auth: VaultCredential["auth"];
  },
): VaultCredential => ({
  type: "vault_credential",
  vault_id: "vlt_1",
  display_name: null,
  metadata: {},
  created_at: "2026-08-01T09:12:00Z",
  updated_at: "2026-08-01T10:00:00Z",
  archived_at: null,
  ...over,
});

const credentials: VaultCredential[] = [
  credential({
    id: "crd_oauth",
    display_name: "GitHub",
    auth: {
      type: "mcp_oauth",
      mcp_server_url: "https://mcp.github.example",
      expires_at: null,
      refresh: null,
    },
  }),
  credential({
    id: "crd_bearer",
    auth: {
      type: "static_bearer",
      mcp_server_url: "https://mcp.other.example",
    },
  }),
  credential({
    id: "crd_env",
    display_name: "API key",
    auth: {
      type: "environment_variable",
      secret_name: "API_KEY",
      networking: { type: "limited", allowed_hosts: ["api.example.com"] },
      injection_location: { body: false, header: true },
    },
  }),
  credential({
    id: "crd_old",
    display_name: "Old OAuth",
    archived_at: "2026-07-01T00:00:00Z",
    auth: {
      type: "mcp_oauth",
      mcp_server_url: "https://mcp.old.example",
      expires_at: null,
      refresh: null,
    },
  }),
];

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

function routes(over?: {
  vault?: Vault;
  credentials?: VaultCredential[];
  onMutate?: (url: URL, init: RequestInit) => Response | undefined;
}) {
  return stubFetch((url, init) => {
    if (init?.method && over?.onMutate) {
      const handled = over.onMutate(url, init);
      if (handled) return handled;
    }
    if (url.pathname === "/api/platform/v1/vaults/vlt_1/credentials")
      return json({ data: over?.credentials ?? credentials });
    if (url.pathname === "/api/platform/v1/vaults/vlt_1")
      return json(over?.vault ?? vault());
    return undefined;
  });
}

/** Pre-resolved params thenable: React's `use` reads .status/.value directly. */
function asParams(id: string): Promise<{ id: string }> {
  const value = { id };
  return {
    status: "fulfilled",
    value,
    then: (onFulfilled: (v: { id: string }) => void) => onFulfilled(value),
  } as unknown as Promise<{ id: string }>;
}

function renderPage(id = "vlt_1") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <Suspense fallback={null}>
        <VaultDetailPage params={asParams(id)} />
      </Suspense>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("VaultDetailPage", () => {
  it("shows the detail skeleton while the vault loads", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})),
    );
    renderPage();
    await waitFor(() =>
      expect(document.querySelector('[aria-busy="true"]')).not.toBeNull(),
    );
  });

  it("surfaces the platform error envelope", async () => {
    stubFetch(() =>
      json(
        {
          type: "error",
          error: { type: "not_found_error", message: "vault not found" },
        },
        404,
      ),
    );
    renderPage();
    expect(await screen.findByText("vault not found")).toBeInTheDocument();
  });

  it("renders every credential auth flavor secret-free", async () => {
    routes();
    renderPage();

    expect(
      await screen.findByRole("heading", { name: "Team creds" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/write-only on the platform/)).toBeInTheDocument();
    expect(screen.getByText("GitHub")).toBeInTheDocument();
    expect(screen.getByText("https://mcp.github.example")).toBeInTheDocument();
    expect(screen.getByText("https://mcp.other.example")).toBeInTheDocument();
    expect(screen.getByText("API_KEY")).toBeInTheDocument();
    expect(screen.getAllByText("mcp_oauth")).toHaveLength(2);
    expect(screen.getByText("static_bearer")).toBeInTheDocument();
    expect(screen.getByText("environment_variable")).toBeInTheDocument();
    // Only the unarchived mcp_oauth credential can be validated.
    expect(screen.getAllByRole("button", { name: /Validate/ })).toHaveLength(1);
    expect(screen.getByText("Metadata")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Add credential/ }),
    ).toBeInTheDocument();
  });

  it("shows the validation result after a successful OAuth validate", async () => {
    routes({
      onMutate: (url, init) =>
        init.method === "POST" && url.pathname.endsWith("/mcp_oauth_validate")
          ? json({ status: "valid" })
          : undefined,
    });
    renderPage();
    await screen.findByRole("heading", { name: "Team creds" });

    await userEvent.click(screen.getByRole("button", { name: /Validate/ }));
    expect(await screen.findByTestId("credential-notice")).toHaveTextContent(
      "OAuth validation: valid",
    );
  });

  it("shows the failure message when OAuth validation errors", async () => {
    routes({
      onMutate: (url, init) =>
        init.method === "POST" && url.pathname.endsWith("/mcp_oauth_validate")
          ? json(
              {
                type: "error",
                error: { type: "api_error", message: "oauth broken" },
              },
              502,
            )
          : undefined,
    });
    renderPage();
    await screen.findByRole("heading", { name: "Team creds" });

    await userEvent.click(screen.getByRole("button", { name: /Validate/ }));
    const notice = await screen.findByTestId("credential-notice");
    expect(notice).toHaveTextContent("oauth broken");
    expect(notice.className).toContain("text-destructive");
  });

  it("deletes a credential after dialog confirmation", async () => {
    const deletes: URL[] = [];
    routes({
      onMutate: (url, init) => {
        if (init.method === "DELETE") {
          deletes.push(url);
          return json({ id: "crd_bearer", type: "vault_credential" });
        }
        return undefined;
      },
    });
    renderPage();
    await screen.findByRole("heading", { name: "Team creds" });

    await userEvent.click(
      screen.getByRole("button", { name: "Delete credential crd_bearer" }),
    );
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Delete credential" }),
    );

    await waitFor(() => expect(deletes).toHaveLength(1));
    expect(deletes[0].pathname).toBe(
      "/api/platform/v1/vaults/vlt_1/credentials/crd_bearer",
    );
  });

  it("archives the vault after dialog confirmation", async () => {
    const posts: URL[] = [];
    routes({
      onMutate: (url, init) => {
        if (init.method === "POST" && url.pathname.endsWith("/archive")) {
          posts.push(url);
          return json(vault({ archived_at: "2026-08-02T00:00:00Z" }));
        }
        return undefined;
      },
    });
    renderPage();
    await screen.findByRole("heading", { name: "Team creds" });

    await userEvent.click(screen.getByRole("button", { name: "More actions" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Archive" }));
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText(/purges every credential/),
    ).toBeInTheDocument();
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Archive vault" }),
    );

    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].pathname).toBe("/api/platform/v1/vaults/vlt_1/archive");
  });

  it("deletes the vault and returns to the list", async () => {
    const deletes: URL[] = [];
    routes({
      onMutate: (url, init) => {
        if (init.method === "DELETE") {
          deletes.push(url);
          return json({ id: "vlt_1", type: "vault" });
        }
        return undefined;
      },
    });
    renderPage();
    await screen.findByRole("heading", { name: "Team creds" });

    await userEvent.click(screen.getByRole("button", { name: "More actions" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Delete vault" }),
    );

    await waitFor(() => expect(deletes).toHaveLength(1));
    expect(deletes[0].pathname).toBe("/api/platform/v1/vaults/vlt_1");
    await waitFor(() => expect(pushSpy).toHaveBeenCalledWith("/vaults"));
  });

  it("hides archive and add-credential on an archived vault", async () => {
    routes({
      vault: vault({ archived_at: "2026-08-02T00:00:00Z", metadata: {} }),
      credentials: [],
    });
    renderPage();

    expect(
      await screen.findByRole("heading", { name: "Team creds" }),
    ).toBeInTheDocument();
    expect(screen.getByText("archived")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Archive" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Add credential/ })).toBeNull();
    expect(
      screen.getByText("No credentials in this vault"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Metadata")).toBeNull();
  });
});
