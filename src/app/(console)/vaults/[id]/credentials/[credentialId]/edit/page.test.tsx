import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import EditCredentialPage from "./page";
import type { VaultCredential } from "@/lib/platform/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));

const credential: VaultCredential = {
  id: "vcred_1",
  type: "vault_credential",
  vault_id: "vlt_1",
  display_name: "GitHub token",
  auth: { type: "static_bearer", mcp_server_url: "https://mcp.example.com" },
  metadata: {},
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
const json = (payload: unknown) =>
  new Response(JSON.stringify(payload), {
    headers: { "content-type": "application/json" },
  });
function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <EditCredentialPage params={params} />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("EditCredentialPage", () => {
  it("loads the credential into the editor", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json(credential)),
    );
    renderPage();
    expect(await screen.findByText("Edit GitHub token")).toBeInTheDocument();
    expect(screen.getByLabelText("Display name (optional)")).toHaveValue(
      "GitHub token",
    );
  });

  it("rejects direct editing of an archived credential", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        json({ ...credential, archived_at: "2026-09-02T00:00:00Z" }),
      ),
    );
    renderPage();
    expect(
      await screen.findByText("Archived credentials are read only."),
    ).toBeInTheDocument();
  });
});
