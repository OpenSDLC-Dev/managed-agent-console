import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AddCredentialButton } from "./credential-form";

// base-ui Select portals are unreliable in jsdom; the vendored primitive is
// excluded from coverage, so stand in a native <select> that drives the same
// value/onValueChange contract.
vi.mock("@/components/ui/select", () => ({
  Select: ({
    value,
    onValueChange,
  }: {
    value: string;
    onValueChange: (v: string) => void;
    children?: unknown;
  }) => (
    <select
      aria-label={
        ["environment_variable", "static_bearer", "mcp_oauth"].includes(value)
          ? "Credential type"
          : "Token endpoint authentication"
      }
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
    >
      {["environment_variable", "static_bearer", "mcp_oauth"].includes(
        value,
      ) ? (
        <>
          <option value="environment_variable">environment_variable</option>
          <option value="static_bearer">static_bearer</option>
          <option value="mcp_oauth">mcp_oauth</option>
        </>
      ) : (
        <>
          <option value="none">none</option>
          <option value="client_secret_basic">client_secret_basic</option>
          <option value="client_secret_post">client_secret_post</option>
        </>
      )}
    </select>
  ),
  SelectContent: () => null,
  SelectItem: () => null,
  SelectTrigger: () => null,
  SelectValue: () => null,
}));

const credentialResponse = () =>
  new Response(JSON.stringify({ id: "vcred_1", type: "vault_credential" }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

function renderButton() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return {
    ...render(
      <QueryClientProvider client={client}>
        <AddCredentialButton vaultId="vlt_1" />
      </QueryClientProvider>,
    ),
    client,
  };
}

async function openDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /Add credential/ }));
  const dialog = await screen.findByRole("dialog");
  await user.click(screen.getByRole("radio", { name: "Unrestricted" }));
  return dialog;
}

const submitButton = (dialog: HTMLElement) =>
  within(dialog).getByRole("button", { name: "Add credential" });

// One change event rather than per-character typing, where the test asserts on
// the wire body and not on typing: the cost is the reason, not the semantics
// (#93). It cannot see state arriving back in the input, so a field no other
// test here fills asserts its rendered value at the point of use.
const fill = (label: string | RegExp, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AddCredentialButton", () => {
  it("posts an environment_variable credential with limited networking", async () => {
    const fetchMock = vi.fn(async () => credentialResponse());
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderButton();
    const dialog = await openDialog(user);
    await user.click(screen.getByRole("radio", { name: "Limited" }));

    fill("Name (optional)", " GitHub ");
    fill("Secret name", " GITHUB_TOKEN ");
    fill("Secret value", "ghp_secret");
    // Hosts is a textarea, one per line — the blank and padded lines are the
    // point: they must not survive into allowed_hosts.
    fill(/Allowed hosts/, "api.github.com\n github.com \n   ");
    // The two fields no other test in this file fills.
    expect(screen.getByLabelText("Name (optional)")).toHaveValue(" GitHub ");
    expect(screen.getByLabelText(/Allowed hosts/)).toHaveValue(
      "api.github.com\n github.com \n   ",
    );
    await user.click(submitButton(dialog));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("/api/platform/v1/vaults/vlt_1/credentials");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      display_name: "GitHub",
      auth: {
        type: "environment_variable",
        secret_name: "GITHUB_TOKEN",
        secret_value: "ghp_secret",
        networking: {
          type: "limited",
          allowed_hosts: ["api.github.com", "github.com"],
        },
        injection_location: { header: true, body: true },
      },
      metadata: {},
    });
    // Success closes the dialog.
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("probe: evicts the write-only value from every cache after save", async () => {
    const secret = "cache-must-forget-this-secret";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => credentialResponse()),
    );
    const user = userEvent.setup();
    const { client } = renderButton();
    const dialog = await openDialog(user);

    fill("Secret name", "TOKEN");
    fill("Secret value", secret);
    await user.click(submitButton(dialog));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    expect(JSON.stringify(client.getMutationCache().getAll())).not.toContain(
      secret,
    );
    expect(JSON.stringify(client.getQueryCache().getAll())).not.toContain(
      secret,
    );
  });

  it("sends explicitly selected unrestricted networking and omits the empty name", async () => {
    const fetchMock = vi.fn(async () => credentialResponse());
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderButton();
    const dialog = await openDialog(user);
    await user.click(screen.getByRole("radio", { name: "Unrestricted" }));

    await user.type(screen.getByLabelText("Secret name"), "API_KEY");
    await user.type(screen.getByLabelText("Secret value"), "sk-1");
    await user.click(submitButton(dialog));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(JSON.parse(init.body as string)).toEqual({
      auth: {
        type: "environment_variable",
        secret_name: "API_KEY",
        secret_value: "sk-1",
        networking: { type: "unrestricted" },
        injection_location: { header: true, body: true },
      },
      metadata: {},
    });
  });

  it("posts a static_bearer credential with server URL and token", async () => {
    const fetchMock = vi.fn(async () => credentialResponse());
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderButton();
    const dialog = await openDialog(user);

    await user.selectOptions(
      screen.getByLabelText("Credential type"),
      "static_bearer",
    );
    await user.type(
      screen.getByLabelText("MCP server URL"),
      " https://mcp.example.com ",
    );
    await user.type(screen.getByLabelText("Bearer token"), "tok_123");
    await user.click(submitButton(dialog));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(JSON.parse(init.body as string)).toEqual({
      auth: {
        type: "static_bearer",
        mcp_server_url: "https://mcp.example.com",
        token: "tok_123",
      },
      metadata: {},
    });
  });

  it("posts an mcp_oauth credential with access_token on the wire", async () => {
    const fetchMock = vi.fn(async () => credentialResponse());
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderButton();
    const dialog = await openDialog(user);

    await user.selectOptions(
      screen.getByLabelText("Credential type"),
      "mcp_oauth",
    );
    await user.type(
      screen.getByLabelText("MCP server URL"),
      "https://mcp.example.com",
    );
    await user.type(screen.getByLabelText("Access token"), "at_456");
    await user.click(submitButton(dialog));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(JSON.parse(init.body as string)).toEqual({
      auth: {
        type: "mcp_oauth",
        mcp_server_url: "https://mcp.example.com",
        access_token: "at_456",
      },
      metadata: {},
    });
  });

  it("posts OAuth expiry, refresh configuration, and metadata", async () => {
    const fetchMock = vi.fn(async () => credentialResponse());
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderButton();
    const dialog = await openDialog(user);

    await user.selectOptions(
      screen.getByLabelText("Credential type"),
      "mcp_oauth",
    );
    fill("MCP server URL", "https://mcp.example.com");
    fill("Access token", "access");
    fill("Expiry (RFC 3339, optional)", "2026-10-01T00:00:00Z");
    await user.click(screen.getByLabelText("Configure automatic refresh"));
    fill("Client ID", "client");
    fill("Refresh token", "refresh");
    fill("Token endpoint", "https://example.com/token");
    await user.selectOptions(
      screen.getByLabelText("Token endpoint authentication"),
      "client_secret_post",
    );
    fill("Client secret", "client-secret");
    fill("Resource (optional)", "resource");
    fill("Scope (optional)", "repo");
    fill("Metadata (JSON object)", '{"owner":"agents"}');
    await user.click(submitButton(dialog));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(JSON.parse(init.body as string)).toEqual({
      auth: {
        type: "mcp_oauth",
        mcp_server_url: "https://mcp.example.com",
        access_token: "access",
        expires_at: "2026-10-01T00:00:00Z",
        refresh: {
          client_id: "client",
          refresh_token: "refresh",
          token_endpoint: "https://example.com/token",
          token_endpoint_auth: {
            type: "client_secret_post",
            client_secret: "client-secret",
          },
          resource: "resource",
          scope: "repo",
        },
      },
      metadata: { owner: "agents" },
    });
  });

  it("rejects invalid metadata without posting", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderButton();
    const dialog = await openDialog(user);
    fill("Secret name", "KEY");
    fill("Secret value", "value");
    fill("Metadata (JSON object)", "[]");
    await user.click(submitButton(dialog));
    expect(screen.getByRole("alert")).toHaveTextContent("JSON object");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("gates submit on the required fields of each arm", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const user = userEvent.setup();
    renderButton();
    const dialog = await openDialog(user);

    // environment_variable arm: needs secret name + value.
    expect(submitButton(dialog)).toBeDisabled();
    await user.type(screen.getByLabelText("Secret name"), "A");
    expect(submitButton(dialog)).toBeDisabled();
    await user.type(screen.getByLabelText("Secret value"), "v");
    expect(submitButton(dialog)).toBeEnabled();
    await user.click(screen.getByLabelText("Header"));
    await user.click(screen.getByLabelText("Body"));
    expect(submitButton(dialog)).toBeDisabled();
    await user.click(screen.getByLabelText("Header"));
    expect(submitButton(dialog)).toBeEnabled();

    // MCP arm: needs server URL + token.
    await user.selectOptions(
      screen.getByLabelText("Credential type"),
      "static_bearer",
    );
    expect(submitButton(dialog)).toBeDisabled();
    await user.type(screen.getByLabelText("MCP server URL"), "https://x");
    expect(submitButton(dialog)).toBeDisabled();
    await user.type(screen.getByLabelText("Bearer token"), "t");
    expect(submitButton(dialog)).toBeEnabled();
  });

  it("shows the platform error and keeps the dialog open; cancel closes it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              type: "error",
              error: { type: "invalid_request_error", message: "bad secret" },
            }),
            { status: 400, headers: { "content-type": "application/json" } },
          ),
      ),
    );
    const user = userEvent.setup();
    renderButton();
    const dialog = await openDialog(user);

    await user.type(screen.getByLabelText("Secret name"), "K");
    await user.type(screen.getByLabelText("Secret value"), "v");
    await user.click(submitButton(dialog));

    expect(await screen.findByText("bad secret")).toBeDefined();
    expect(screen.getByRole("dialog")).toBeDefined();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("resets the form when the dialog is dismissed", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const user = userEvent.setup();
    renderButton();
    await openDialog(user);

    await user.type(screen.getByLabelText("Secret name"), "STALE");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    await openDialog(user);
    expect(screen.getByLabelText("Secret name")).toHaveValue("");
  });
});
