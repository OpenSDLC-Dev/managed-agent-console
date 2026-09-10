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
import { DreamEditor, dreamSessionIds } from "./dream-editor";
import { dreams, memoryStores } from "../../../test/mock-platform/fixtures.mjs";

const router = vi.hoisted(() => ({ push: vi.fn(), back: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

function renderEditor() {
  const fetchMock = vi.fn(
    async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST")
        return new Response(JSON.stringify(dreams[1]), { status: 200 });
      return new Response(
        JSON.stringify({
          data: memoryStores.filter((store) => !store.archived_at),
          next_page: null,
        }),
        { status: 200 },
      );
    },
  );
  vi.stubGlobal("fetch", fetchMock);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <DreamEditor />
    </QueryClientProvider>,
  );
  return fetchMock;
}

function fillRequired() {
  fireEvent.change(screen.getByLabelText("Memory store"), {
    target: { value: memoryStores[0].id },
  });
  fireEvent.change(screen.getByLabelText("Session IDs"), {
    target: { value: "sesn_one, sesn_two\nsesn_three" },
  });
  fireEvent.change(screen.getByLabelText("Model"), {
    target: { value: "claude-sonnet-4-8" },
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("DreamEditor", () => {
  it("splits comma and whitespace separated session IDs", () => {
    expect(dreamSessionIds(" sesn_a,session_b\n sesn_c ")).toEqual([
      "sesn_a",
      "session_b",
      "sesn_c",
    ]);
  });

  it("submits the platform's default model and output shapes", async () => {
    const fetchMock = renderEditor();
    fillRequired();
    expect(
      document.querySelector('[data-session-count="3"]'),
    ).toHaveTextContent("3 of 100");
    fireEvent.click(screen.getByRole("button", { name: "Create dream" }));

    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith(`/dreams/${dreams[1].id}`),
    );
    const createCall = fetchMock.mock.calls.find(
      ([, init]) => init?.method === "POST",
    )!;
    expect(JSON.parse(String(createCall[1]?.body))).toMatchObject({
      model: "claude-sonnet-4-8",
      inputs: [
        { type: "memory_store", memory_store_id: memoryStores[0].id },
        {
          type: "sessions",
          session_ids: ["sesn_one", "sesn_two", "sesn_three"],
        },
      ],
      output_behavior: { type: "create_new" },
    });
  });

  it("submits explicit speed, instructions and in-place output", async () => {
    const user = userEvent.setup();
    const fetchMock = renderEditor();
    fillRequired();
    fireEvent.change(screen.getByLabelText("Instructions (optional)"), {
      target: { value: "Keep durable facts." },
    });
    await user.click(screen.getByLabelText("Speed"));
    await user.click(await screen.findByRole("option", { name: "Fast" }));
    await user.click(screen.getByLabelText("Output"));
    await user.click(
      await screen.findByRole("option", { name: "Update the input store" }),
    );
    await user.click(screen.getByRole("button", { name: "Create dream" }));

    await waitFor(() => expect(router.push).toHaveBeenCalled());
    const createCall = fetchMock.mock.calls.find(
      ([, init]) => init?.method === "POST",
    )!;
    expect(JSON.parse(String(createCall[1]?.body))).toMatchObject({
      model: { id: "claude-sonnet-4-8", speed: "fast" },
      instructions: "Keep durable facts.",
      output_behavior: {
        type: "update_existing",
        memory_store_id: memoryStores[0].id,
      },
    });
  });

  it("counts Unicode characters and prevents an oversized instruction", () => {
    renderEditor();
    fillRequired();
    fireEvent.change(screen.getByLabelText("Instructions (optional)"), {
      target: { value: "🙂".repeat(4097) },
    });
    expect(
      document.querySelector('[data-instruction-length="4097"]'),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create dream" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(router.back).toHaveBeenCalled();
  });
});
