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
      aria-label="Credential type"
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
    >
      <option value="environment_variable">environment_variable</option>
      <option value="static_bearer">static_bearer</option>
      <option value="mcp_oauth">mcp_oauth</option>
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
  return render(
    <QueryClientProvider client={client}>
      <AddCredentialButton vaultId="vlt_1" />
    </QueryClientProvider>,
  );
}

async function openDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /Add credential/ }));
  return await screen.findByRole("dialog");
}

const submitButton = (dialog: HTMLElement) =>
  within(dialog).getByRole("button", { name: "Add credential" });

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

    await user.type(screen.getByLabelText("Name (optional)"), " GitHub ");
    await user.type(screen.getByLabelText("Secret name"), " GITHUB_TOKEN ");
    await user.type(screen.getByLabelText("Secret value"), "ghp_secret");
    await user.type(
      screen.getByLabelText(/Allowed hosts/),
      "api.github.com{Enter} github.com {Enter}   ",
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
      },
    });
    // Success closes the dialog.
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("sends unrestricted networking and omits display_name when both are empty", async () => {
    const fetchMock = vi.fn(async () => credentialResponse());
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderButton();
    const dialog = await openDialog(user);

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
      },
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
    });
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
