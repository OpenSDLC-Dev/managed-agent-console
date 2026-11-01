import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SignedInAs } from "@/components/shell/signed-in-as";
import { SurfaceGuard } from "@/components/shell/surface-guard";
import { useSessionTrace } from "@/lib/session-trace/use-session-trace";
import {
  hasBouncedToLogin,
  isSignedOut,
  resetSignedOutBounceForTests,
} from "@/lib/identity/signed-out";

vi.mock("next/navigation", () => ({ usePathname: () => "/sessions/sesn_a" }));

const accountA = {
  signed_in: true as const,
  id: "user_old",
  role: "admin",
  role_source: "manual",
  email: "old@example.test",
  name: "Old actor",
  login_name: "old",
  expires_at: "2099-01-01T00:00:00Z",
  csrf_token: "old-csrf",
};

class StreamHandle {
  controller!: ReadableStreamDefaultController<Uint8Array>;
  closed = false;
  cancelCalls = 0;
  readonly stream: ReadableStream<Uint8Array>;
  constructor(
    readonly signal: AbortSignal,
    readonly scope: string,
  ) {
    this.stream = new ReadableStream<Uint8Array>({
      start: (controller) => {
        this.controller = controller;
      },
      cancel: () => {
        this.closed = true;
        this.cancelCalls++;
      },
    });
    signal.addEventListener(
      "abort",
      () => {
        if (!this.closed) {
          this.closed = true;
          this.controller.error(new DOMException("Aborted", "AbortError"));
        }
      },
      { once: true },
    );
  }
  push(value: object) {
    this.controller.enqueue(
      new TextEncoder().encode(
        `event: message\ndata: ${JSON.stringify(value)}\n\n`,
      ),
    );
  }
  delta(text: string) {
    this.push({
      type: "event_delta",
      event_id: `preview_${this.scope}`,
      delta: {
        type: "content_delta",
        index: 0,
        content: { type: "text", text },
      },
    });
  }
}

function Trace({ child }: { child?: string }) {
  const { trace, connection } = useSessionTrace("sesn_a", child);
  return (
    <output data-testid={child || "parent"}>
      {JSON.stringify({
        connection,
        events: trace.events.map((event) => event.id),
        previews: [...trace.previews.values()].map((preview) =>
          preview.parts.join(""),
        ),
      })}
    </output>
  );
}
function snapshot(scope: string) {
  return JSON.parse(screen.getByTestId(scope).textContent!);
}
const scopes = ["parent", "sthr_child"];
const flush = () =>
  act(async () => {
    for (let i = 0; i < 50; i++) await Promise.resolve();
  });

async function fixture() {
  document.documentElement.dataset.consoleAuth = "platform";
  const assign = vi.fn();
  vi.stubGlobal(
    "window",
    Object.create(window, {
      location: {
        value: {
          origin: "http://localhost",
          pathname: "/sessions/sesn_a",
          search: "",
          assign,
        },
      },
    }),
  );
  let account = { ...accountA };
  const handles: StreamHandle[] = [];
  const accountResponses: { status: number; marked: boolean }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/auth/session") {
        const response = Response.json(account);
        accountResponses.push({
          status: response.status,
          marked: isSignedOut(response),
        });
        return response;
      }
      if (url.includes("/stream?")) {
        const scope = url.includes("/threads/") ? "sthr_child" : "parent";
        const handle = new StreamHandle(init!.signal!, scope);
        handles.push(handle);
        return new Response(handle.stream, {
          headers: { "content-type": "text/event-stream" },
        });
      }
      return Response.json({ data: [], next_page: null });
    }),
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, retryDelay: 0 } },
  });
  const view = render(
    <QueryClientProvider client={client}>
      <SignedInAs />
      <SurfaceGuard>
        <Trace />
        <Trace child="sthr_child" />
      </SurfaceGuard>
    </QueryClientProvider>,
  );
  await screen.findByText("Old actor");
  await waitFor(() => {
    expect(handles).toHaveLength(2);
    for (const scope of scopes) expect(snapshot(scope).connection).toBe("live");
  });
  await act(async () => {
    for (const handle of handles) handle.delta("before");
  });
  await waitFor(() => {
    for (const scope of scopes)
      expect(snapshot(scope).previews).toEqual(["before"]);
  });
  expect(hasBouncedToLogin()).toBe(false);
  expect(assign).not.toHaveBeenCalled();
  const refresh = async (next: typeof accountA) => {
    account = next;
    await act(async () => {
      await client.invalidateQueries({ queryKey: ["console-session"] });
    });
    await waitFor(() => expect(screen.getByText(next.name)).toBeDefined());
    await flush();
  };
  const lateFrames = async () => {
    await act(async () => {
      for (const handle of handles) {
        handle.delta("-after");
        handle.push({
          id: `sevt_after_${handle.scope}`,
          type: "agent.message",
          processed_at: null,
        });
      }
    });
    await flush();
  };
  return {
    assign,
    handles,
    client,
    view,
    refresh,
    lateFrames,
    accountResponses,
  };
}

beforeEach(() => resetSignedOutBounceForTests());
afterEach(async () => {
  cleanup();
  await flush();
  delete document.documentElement.dataset.consoleAuth;
  vi.unstubAllGlobals();
  resetSignedOutBounceForTests();
});

it("passing control: same-id role/profile/email/CSRF/expiry changes retain live parent and child", async () => {
  const f = await fixture();
  try {
    await f.refresh({
      ...accountA,
      role: "developer",
      name: "Renamed actor",
      email: "changed@example.test",
      csrf_token: "new-csrf",
      expires_at: "2099-02-01T00:00:00Z",
    });
    expect(hasBouncedToLogin()).toBe(false);
    expect(f.assign).not.toHaveBeenCalled();
    await f.lateFrames();
    for (const scope of scopes) {
      expect(snapshot(scope)).toEqual({
        connection: "live",
        events: [`sevt_after_${scope}`],
        previews: ["before-after"],
      });
    }
    expect(f.handles.every((handle) => !handle.signal.aborted)).toBe(true);
  } finally {
    f.view.unmount();
    f.client.clear();
    expect(f.handles.every((handle) => handle.signal.aborted)).toBe(true);
  }
});

it("regression contract: no late parent or child frames after confirmed replacement starts navigation", async () => {
  const f = await fixture();
  try {
    await f.refresh({ ...accountA, id: "user_new", name: "New actor" });
    expect(hasBouncedToLogin()).toBe(true);
    expect(f.assign).toHaveBeenCalledExactlyOnceWith("http://localhost/");
    await f.lateFrames();
    for (const scope of scopes) {
      const state = snapshot(scope);
      expect
        .soft(state.events, `${scope}: no late persisted event`)
        .toEqual([]);
      expect.soft(state.previews, `${scope}: previews cleared`).toEqual([]);
      expect
        .soft(state.connection, `${scope}: connection closed`)
        .toBe("closed");
    }
    expect
      .soft(
        f.handles.map((handle) => handle.signal.aborted),
        "original stream signals aborted",
      )
      .toEqual([true, true]);
  } finally {
    f.view.unmount();
    f.client.clear();
    expect(f.handles.every((handle) => handle.signal.aborted)).toBe(true);
  }
});
