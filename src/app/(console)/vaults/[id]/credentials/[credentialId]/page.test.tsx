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
import CredentialDetailPage from "./page";
import type { Vault, VaultCredential } from "@/lib/platform/types";

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, back: vi.fn() }),
}));

const vault: Vault = {
  id: "vlt_1",
  type: "vault",
  display_name: "Production",
  metadata: {},
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
  archived_at: null,
};
const credential: VaultCredential = {
  id: "vcred_1",
  type: "vault_credential",
  vault_id: "vlt_1",
  display_name: "GitHub token",
  auth: { type: "static_bearer", mcp_server_url: "https://mcp.example.com" },
  metadata: { owner: "agents" },
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
  archived_at: null,
};
const params = {
  status: "fulfilled",
  value: { id: "vlt_1", credentialId: "vcred_1" },
  then: (resolve: (value: { id: string; credentialId: string }) => void) =>
    resolve({ id: "vlt_1", credentialId: "vcred_1" }),
} as unknown as Promise<{ id: string; credentialId: string }>;
const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });

function renderPage(overrides?: { credential?: VaultCredential }) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = new URL(String(input), "http://console.test");
      if (init?.method === "POST")
        return json({
          ...(overrides?.credential ?? credential),
          archived_at: "2026-09-02T00:00:00Z",
        });
      if (init?.method === "DELETE")
        return json({ id: "vcred_1", type: "vault_credential_deleted" });
      return json(
        url.pathname.endsWith("/vcred_1")
          ? (overrides?.credential ?? credential)
          : vault,
      );
    }),
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <CredentialDetailPage params={params} />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  push.mockReset();
});

describe("CredentialDetailPage", () => {
  it("renders the secret-free detail and opens edit", async () => {
    renderPage();
    expect(
      await screen.findByRole("heading", { name: "GitHub token" }),
    ).toBeInTheDocument();
    expect(screen.getByText("https://mcp.example.com")).toBeInTheDocument();
    expect(screen.queryByText(/secret/i)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(push).toHaveBeenCalledWith("/vaults/vlt_1/credentials/vcred_1/edit");
  });

  it("archives the credential", async () => {
    renderPage();
    await screen.findByRole("heading", { name: "GitHub token" });
    await userEvent.click(
      screen.getByRole("button", { name: "Actions for vcred_1" }),
    );
    await userEvent.click(screen.getByRole("menuitem", { name: "Archive" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Archive credential" }),
    );
    await waitFor(() =>
      expect(screen.getByText("archived")).toBeInTheDocument(),
    );
  });

  it("deletes the credential and returns to its vault", async () => {
    renderPage();
    await screen.findByRole("heading", { name: "GitHub token" });
    await userEvent.click(
      screen.getByRole("button", { name: "Actions for vcred_1" }),
    );
    await userEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Delete credential" }),
    );
    await waitFor(() => expect(push).toHaveBeenCalledWith("/vaults/vlt_1"));
  });

  it("keeps archived credentials read only", async () => {
    renderPage({
      credential: { ...credential, archived_at: "2026-09-02T00:00:00Z" },
    });
    await screen.findByRole("heading", { name: "GitHub token" });
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
  });
});
