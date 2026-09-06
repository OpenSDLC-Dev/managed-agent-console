import "@testing-library/jest-dom/vitest";
import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionActions } from "./session-actions";
import { sessions } from "../../../test/mock-platform/fixtures.mjs";
import type { Session } from "@/lib/platform/types";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
const session = sessions[0] as unknown as Session;
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function setup(archived = false, status = 200) {
  const saved = { ...session, title: "Renamed" };
  const fetch = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>(
    async () =>
      new Response(
        JSON.stringify(
          status === 200
            ? saved
            : {
                type: "error",
                error: {
                  type: "invalid_request_error",
                  message: "metadata values must be strings or null",
                },
              },
        ),
        { status, headers: { "content-type": "application/json" } },
      ),
  );
  vi.stubGlobal("fetch", fetch);
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  client.setQueryData(["sessions"], { data: [session] });
  render(
    <QueryClientProvider client={client}>
      <SessionActions
        session={{
          ...session,
          archived_at: archived ? "2026-09-01T00:00:00Z" : null,
        }}
      />
    </QueryClientProvider>,
  );
  return { fetch, client, saved };
}

it("sends title and a metadata patch and refreshes cached resources", async () => {
  const { fetch, client, saved } = setup();
  await userEvent.click(screen.getByRole("button", { name: "Edit session" }));
  expect(screen.getByLabelText("Title")).toHaveValue(session.title);
  fireEvent.change(screen.getByLabelText("Title"), {
    target: { value: "Renamed" },
  });
  fireEvent.change(screen.getByLabelText("Metadata changes (JSON)"), {
    target: { value: '{"owner":"ops","old":null}' },
  });
  await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(fetch.mock.calls[0]).toEqual([
    `/api/platform/v1/sessions/${session.id}`,
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({
        title: "Renamed",
        metadata: { owner: "ops", old: null },
      }),
    }),
  ]);
  expect(client.getQueryData(["session", session.id])).toEqual(saved);
  expect(client.getQueryState(["sessions"])?.isInvalidated).toBe(true);
});

it("keeps malformed JSON in the dialog for correction", async () => {
  const { fetch } = setup();
  await userEvent.click(screen.getByRole("button", { name: "Edit session" }));
  fireEvent.change(screen.getByLabelText("Metadata changes (JSON)"), {
    target: { value: "{" },
  });
  await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
  expect(screen.getByRole("alert")).toHaveTextContent("Enter valid JSON");
  expect(fetch).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("lets the platform validate metadata and displays its refusal", async () => {
  const { fetch } = setup(false, 400);
  await userEvent.click(screen.getByRole("button", { name: "Edit session" }));
  fireEvent.change(screen.getByLabelText("Metadata changes (JSON)"), {
    target: { value: '{"owner":123}' },
  });
  await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "metadata values must be strings or null",
  );
  expect(fetch).toHaveBeenCalledOnce();
});

it("archives only after confirmation and updates the cache", async () => {
  const { fetch, client, saved } = setup();
  await userEvent.click(screen.getByRole("button", { name: "More actions" }));
  await userEvent.click(screen.getByRole("menuitem", { name: "Archive" }));
  expect(fetch).not.toHaveBeenCalled();
  await userEvent.click(
    screen.getByRole("button", { name: "Archive session" }),
  );
  await waitFor(() =>
    expect(client.getQueryData(["session", session.id])).toEqual(saved),
  );
  expect(fetch.mock.calls[0][0]).toBe(
    `/api/platform/v1/sessions/${session.id}/archive`,
  );
});

it("keeps archived sessions read-only and allows confirmed deletion", async () => {
  const { fetch, client } = setup(true);
  client.setQueryData(["session", session.id], session);
  expect(screen.queryByRole("button", { name: "Edit session" })).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "More actions" }));
  expect(screen.queryByRole("menuitem", { name: "Archive" })).toBeNull();
  await userEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
  expect(fetch).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "Delete session" }));
  await waitFor(() => expect(push).toHaveBeenCalledWith("/sessions"));
  expect(fetch.mock.calls[0]).toEqual([
    `/api/platform/v1/sessions/${session.id}`,
    expect.objectContaining({ method: "DELETE" }),
  ]);
  expect(client.getQueryData(["session", session.id])).toBeUndefined();
});
