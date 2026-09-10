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
import { VaultEditor } from "./vault-editor";
import type { Vault } from "@/lib/platform/types";

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, back: vi.fn() }),
}));

const vault: Vault = {
  id: "vlt_1",
  type: "vault",
  display_name: "Production",
  metadata: { owner: "agents", remove: "yes" },
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
  archived_at: null,
};

function renderEditor() {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <VaultEditor vault={vault} />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  push.mockReset();
});

describe("VaultEditor", () => {
  it("updates the name and metadata patch", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ ...vault, display_name: "Shared" }), {
          headers: { "content-type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    renderEditor();

    fireEvent.change(screen.getByLabelText("Display name"), {
      target: { value: "Shared" },
    });
    fireEvent.change(screen.getByLabelText("Metadata (JSON object)"), {
      target: { value: '{"owner":"platform"}' },
    });
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(JSON.parse(init.body as string)).toEqual({
      display_name: "Shared",
      metadata: { owner: "platform", remove: null },
    });
    await waitFor(() => expect(push).toHaveBeenCalledWith("/vaults/vlt_1"));
  });

  it("reports invalid metadata without sending", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderEditor();
    fireEvent.change(screen.getByLabelText("Metadata (JSON object)"), {
      target: { value: "[" },
    });
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Unexpected end");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
