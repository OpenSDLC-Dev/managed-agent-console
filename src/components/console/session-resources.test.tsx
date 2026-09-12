import "@testing-library/jest-dom/vitest";
import { afterEach, expect, it, vi } from "vitest";
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
import { SessionResources } from "./session-resources";
import {
  sessions,
  memoryResources,
} from "../../../test/mock-platform/fixtures.mjs";
import type { Session } from "@/lib/platform/types";

const repository = {
  id: "sesrsc_repo",
  type: "github_repository",
  url: "https://github.com/example/project",
  mount_path: "/workspace/project",
  checkout: { type: "branch", name: "main" },
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
};
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function setup(archived = false) {
  const session = {
    ...sessions[0],
    resources: [repository, memoryResources[0]],
    archived_at: archived ? "2026-09-01T00:00:00Z" : null,
  } as unknown as Session;
  const fetch = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>(
    async () =>
      new Response(JSON.stringify(repository), {
        headers: { "content-type": "application/json" },
      }),
  );
  vi.stubGlobal("fetch", fetch);
  const client = new QueryClient();
  client.setQueryData(["session", session.id], session);
  render(
    <QueryClientProvider client={client}>
      <SessionResources session={session} />
    </QueryClientProvider>,
  );
  return { fetch, client, session };
}

it("attaches an existing file and refreshes the platform session", async () => {
  const { fetch, client, session } = setup();
  await userEvent.click(screen.getByRole("button", { name: "Attach file" }));
  fireEvent.change(screen.getByLabelText("File ID"), {
    target: { value: "file_1" },
  });
  fireEvent.change(screen.getByLabelText("Mount path (optional)"), {
    target: { value: "/mnt/session/uploads/note.txt" },
  });
  await userEvent.click(
    within(screen.getByRole("dialog")).getByRole("button", {
      name: "Attach file",
    }),
  );
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(fetch.mock.calls[0]).toEqual([
    `/api/platform/v1/sessions/${session.id}/resources`,
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({
        type: "file",
        file_id: "file_1",
        mount_path: "/mnt/session/uploads/note.txt",
      }),
    }),
  ]);
  expect(client.getQueryState(["session", session.id])?.isInvalidated).toBe(
    true,
  );
});

it("removes memory using its store id and offers no repository removal", async () => {
  const { fetch, session } = setup();
  expect(
    screen.queryByRole("button", { name: "Remove resource sesrsc_repo" }),
  ).toBeNull();
  await userEvent.click(
    screen.getByRole("button", {
      name: `Remove resource ${memoryResources[0].memory_store_id}`,
    }),
  );
  expect(fetch).not.toHaveBeenCalled();
  await userEvent.click(
    screen.getByRole("button", { name: "Remove resource" }),
  );
  await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
  expect(fetch.mock.calls[0][0]).toBe(
    `/api/platform/v1/sessions/${session.id}/resources/${memoryResources[0].memory_store_id}`,
  );
});

it("submits replacement tokens only in the write request and clears the input", async () => {
  const { fetch, session } = setup();
  await userEvent.click(screen.getByRole("button", { name: "Rotate token" }));
  const token = screen.getByLabelText("Authorization token");
  expect(token).toHaveAttribute("type", "password");
  fireEvent.change(token, { target: { value: "test-only-replacement" } });
  await userEvent.click(
    within(screen.getByRole("dialog")).getByRole("button", {
      name: "Rotate token",
    }),
  );
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(fetch.mock.calls[0]).toEqual([
    `/api/platform/v1/sessions/${session.id}/resources/sesrsc_repo`,
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ authorization_token: "test-only-replacement" }),
    }),
  ]);
  await userEvent.click(screen.getByRole("button", { name: "Rotate token" }));
  expect(screen.getByLabelText("Authorization token")).toHaveValue("");
});

it("renders archived attachments without mutation controls", () => {
  setup(true);
  expect(screen.getByText(repository.url)).toBeInTheDocument();
  expect(screen.getByText("Project notes")).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Inspect resource /workspace/project" }),
  ).toBeEnabled();
  expect(screen.queryByRole("button", { name: "Attach file" })).toBeNull();
  expect(
    screen.queryByRole("button", { name: /^Remove resource / }),
  ).toBeNull();
  expect(screen.queryByRole("button", { name: "Rotate token" })).toBeNull();
});
