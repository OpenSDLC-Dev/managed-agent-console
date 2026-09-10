import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import EditVaultPage from "./page";
import type { Vault } from "@/lib/platform/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));

const vault: Vault = {
  id: "vlt_1",
  type: "vault",
  display_name: "Production",
  metadata: { owner: "agents" },
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
  archived_at: null,
};
const params = (id: string) =>
  ({
    status: "fulfilled",
    value: { id },
    then: (resolve: (value: { id: string }) => void) => resolve({ id }),
  }) as unknown as Promise<{ id: string }>;
const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <EditVaultPage params={params("vlt_1")} />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("EditVaultPage", () => {
  it("loads the vault into the editor", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json(vault)),
    );
    renderPage();
    expect(await screen.findByText("Edit Production")).toBeInTheDocument();
    expect(screen.getByLabelText("Display name")).toHaveValue("Production");
  });

  it("rejects direct editing of an archived vault", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        json({ ...vault, archived_at: "2026-09-02T00:00:00Z" }),
      ),
    );
    renderPage();
    expect(
      await screen.findByText("Archived vaults are read only."),
    ).toBeInTheDocument();
  });

  it("renders platform errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        json(
          {
            type: "error",
            error: { type: "not_found_error", message: "vault gone" },
          },
          404,
        ),
      ),
    );
    renderPage();
    expect(await screen.findByText("vault gone")).toBeInTheDocument();
  });
});
