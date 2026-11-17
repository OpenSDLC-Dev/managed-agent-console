import "@testing-library/jest-dom/vitest";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  ConsoleSessionContext,
  useConsoleSession,
} from "@/components/shell/console-session";
import { ModelRateLimits } from "./model-rate-limits";

const initial = {
  model: "team/model?#",
  requests_per_minute: 12,
  input_tokens_per_minute: 500,
  output_tokens_per_minute: null,
};
function stub(status = 200, writeStatus = 200) {
  let value = initial;
  const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
    const path = new URL(String(input), "http://console").pathname;
    if (path === "/api/auth/session")
      return Response.json({
        signed_in: true,
        id: "user_self",
        role: "admin",
        csrf_token: "test-csrf",
      });
    if (init?.method === "POST") {
      if (writeStatus !== 200)
        return Response.json(
          {
            error: {
              type: "permission_error",
              message: "Current role refused",
            },
          },
          { status: writeStatus },
        );
      value = { model: initial.model, ...JSON.parse(String(init.body)) };
      return Response.json(value);
    }
    return Response.json(
      status === 200
        ? { data: [value] }
        : {
            error: {
              type: status === 404 ? "not_found_error" : "api_error",
              message: "Read failed",
            },
          },
      { status },
    );
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
function mount(role = "admin", model = initial.model) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const view = (currentRole: string) => (
    <QueryClientProvider client={client}>
      <ConsoleSessionContext.Provider
        value={
          {
            data: { signed_in: true, id: "user_self", role: currentRole },
          } as ReturnType<typeof useConsoleSession>
        }
      >
        <ModelRateLimits model={model} />
      </ConsoleSessionContext.Provider>
    </QueryClientProvider>
  );
  const rendered = render(view(role));
  return {
    ...rendered,
    changeRole: (next: string) => rendered.rerender(view(next)),
  };
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  delete document.documentElement.dataset.consoleAuth;
});

it("admin replaces all three limits over the cookie route with CSRF and an encoded alias", async () => {
  document.documentElement.dataset.consoleAuth = "platform";
  const fetchMock = stub();
  mount();
  await userEvent.click(
    await screen.findByRole("button", { name: "Edit limits" }),
  );
  expect(screen.getByLabelText("Requests per minute")).toHaveValue("12");
  await userEvent.clear(screen.getByLabelText("Requests per minute"));
  await userEvent.type(screen.getByLabelText("Requests per minute"), "25");
  await userEvent.clear(screen.getByLabelText("Input tokens per minute"));
  await userEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  const post = fetchMock.mock.calls.find(
    ([, init]) => init?.method === "POST",
  )!;
  expect(post[0]).toBe("/admin/v1/rate_limits/team/model%3F%23");
  expect(JSON.parse(String(post[1]?.body))).toEqual({
    requests_per_minute: 25,
    input_tokens_per_minute: null,
    output_tokens_per_minute: null,
  });
  expect(post[1]?.headers).toMatchObject({ "X-CSRF-Token": "test-csrf" });
  expect(
    document.querySelector("[data-limit=requests_per_minute]"),
  ).toHaveAttribute("data-value", "25");
});
it("developer reads limits without an editor; wildcard names share one budget", async () => {
  document.documentElement.dataset.consoleAuth = "platform";
  stub();
  mount("developer", "*");
  await screen.findByText("Organization limits");
  await waitFor(() =>
    expect(
      document.querySelector("[data-limit=requests_per_minute]"),
    ).toHaveAttribute("data-value", ""),
  );
  expect(screen.queryByRole("button", { name: "Edit limits" })).toBeNull();
  expect(screen.getByText(/All names matched by/)).toBeInTheDocument();
});
it.each([404, 500])(
  "does not present unavailable limits as unlimited (%s)",
  async (status) => {
    document.documentElement.dataset.consoleAuth = "platform";
    const fetchMock = stub(status);
    mount();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    if (status === 500) await screen.findByText("Read failed");
    else
      await waitFor(() =>
        expect(screen.queryByText("Organization limits")).toBeNull(),
      );
    expect(document.querySelector("[data-limit]")).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit limits" })).toBeNull();
  },
);
it("user sessions never request the limits endpoint", async () => {
  const fetchMock = stub();
  mount("user");
  expect(fetchMock).not.toHaveBeenCalled();
});
it("discards the open editor when the current admin is demoted", async () => {
  document.documentElement.dataset.consoleAuth = "platform";
  const fetchMock = stub();
  const view = mount();
  await userEvent.click(
    await screen.findByRole("button", { name: "Edit limits" }),
  );
  view.changeRole("developer");
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(
    false,
  );
});
it("keeps the draft after a server refusal", async () => {
  document.documentElement.dataset.consoleAuth = "platform";
  stub(200, 403);
  mount();
  await userEvent.click(
    await screen.findByRole("button", { name: "Edit limits" }),
  );
  await userEvent.type(screen.getByLabelText("Output tokens per minute"), "9");
  await userEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Current role refused",
  );
  expect(screen.getByLabelText("Output tokens per minute")).toHaveValue("9");
});
