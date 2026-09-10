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
import {
  CredentialEditor,
  credentialBody,
  credentialForm,
} from "./credential-editor";
import type { VaultCredential } from "@/lib/platform/types";

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, back: vi.fn() }),
}));

const base = (auth: VaultCredential["auth"]): VaultCredential => ({
  id: "vcred_1",
  type: "vault_credential",
  vault_id: "vlt_1",
  display_name: "Credential",
  auth,
  metadata: { owner: "agents", remove: "yes" },
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
  archived_at: null,
});

const environment = base({
  type: "environment_variable",
  secret_name: "TOKEN",
  networking: { type: "limited", allowed_hosts: ["api.example.com"] },
  injection_location: { body: false, header: true },
});
const oauth = base({
  type: "mcp_oauth",
  mcp_server_url: "https://mcp.example.com",
  expires_at: "2026-10-01T00:00:00Z",
  refresh: {
    client_id: "client",
    token_endpoint: "https://example.com/token",
    token_endpoint_auth: { type: "client_secret_basic" },
    resource: null,
    scope: "repo",
  },
});

function renderEditor(credential: VaultCredential) {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  return {
    ...render(
      <QueryClientProvider client={client}>
        <CredentialEditor credential={credential} />
      </QueryClientProvider>,
    ),
    client,
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  push.mockReset();
});

describe("credentialBody", () => {
  it("keeps a static bearer secret when no replacement is entered", () => {
    const credential = base({
      type: "static_bearer",
      mcp_server_url: "https://mcp.example.com",
    });
    expect(credentialBody(credential, credentialForm(credential))).toEqual({
      display_name: "Credential",
      metadata: { owner: "agents", remove: "yes" },
      auth: { type: "static_bearer" },
    });
  });

  it("builds the mutable OAuth refresh patch", () => {
    const form = credentialForm(oauth);
    form.replacementSecret = "access-new";
    form.refreshToken = "refresh-new";
    form.expiresAt = "";
    form.scope = "";
    form.tokenEndpointAuth = "client_secret_post";
    form.clientSecret = "client-new";
    expect(credentialBody(oauth, form).auth).toEqual({
      type: "mcp_oauth",
      access_token: "access-new",
      expires_at: null,
      refresh: {
        refresh_token: "refresh-new",
        scope: null,
        token_endpoint_auth: {
          type: "client_secret_post",
          client_secret: "client-new",
        },
      },
    });
  });
});

describe("CredentialEditor", () => {
  it("updates environment policy, metadata and the write-only secret", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify(environment), {
          headers: { "content-type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    renderEditor(environment);

    await userEvent.type(
      screen.getByLabelText("Replacement secret value"),
      "new",
    );
    fireEvent.change(screen.getByLabelText("Allowed hosts, one per line"), {
      target: { value: "one.example.com\ntwo.example.com" },
    });
    await userEvent.click(screen.getByLabelText("Header"));
    await userEvent.click(screen.getByLabelText("Body"));
    fireEvent.change(screen.getByLabelText("Metadata (JSON object)"), {
      target: { value: '{"owner":"ops"}' },
    });
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(JSON.parse(init.body as string)).toEqual({
      display_name: "Credential",
      metadata: { owner: "ops", remove: null },
      auth: {
        type: "environment_variable",
        secret_value: "new",
        networking: {
          type: "limited",
          allowed_hosts: ["one.example.com", "two.example.com"],
        },
        injection_location: { body: true, header: false },
      },
    });
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/vaults/vlt_1/credentials/vcred_1"),
    );
  });

  it("probe: evicts a replacement secret from every cache after save", async () => {
    const secret = "rotated-cache-secret";
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify(environment), {
            headers: { "content-type": "application/json" },
          }),
      ),
    );
    const { client } = renderEditor(environment);

    await userEvent.type(
      screen.getByLabelText("Replacement secret value"),
      secret,
    );
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(push).toHaveBeenCalled());

    expect(JSON.stringify(client.getMutationCache().getAll())).not.toContain(
      secret,
    );
    expect(JSON.stringify(client.getQueryCache().getAll())).not.toContain(
      secret,
    );
  });

  it("requires one injection location", async () => {
    vi.stubGlobal("fetch", vi.fn());
    renderEditor(environment);
    await userEvent.click(screen.getByLabelText("Header"));
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(screen.getByRole("alert")).toHaveTextContent("body or header");
  });

  it("requires a new client secret when the OAuth auth method changes", async () => {
    vi.stubGlobal("fetch", vi.fn());
    renderEditor(oauth);
    await userEvent.click(
      screen.getByLabelText("Token endpoint authentication"),
    );
    await userEvent.click(
      await screen.findByRole("option", { name: "client_secret_post" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "client secret is required",
    );
  });
});
