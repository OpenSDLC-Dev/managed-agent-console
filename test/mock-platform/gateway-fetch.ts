import { vi } from "vitest";
import { gatewayRoute, resetGateway } from "./gateway.mjs";

/**
 * A `fetch` for component tests that answers `/api/gateway/admin/v1/...` from
 * the mock gateway's own routes, with fresh seeds. The data is the same the e2e
 * tier and the conformance suite use, so a component test cannot drift onto a
 * shape the gateway does not render. `override` answers a path first, for the
 * refusals and failures a seed cannot produce.
 */
export function stubGatewayFetch(
  override?: (method: string, rest: string, url: URL) => Response | undefined,
) {
  resetGateway();
  const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
    const url = new URL(String(input), "http://console");
    const rest = url.pathname.replace("/api/gateway/admin/v1/", "");
    const method = init?.method ?? "GET";
    const custom = override?.(method, rest, url);
    if (custom) return custom;
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    const answer = gatewayRoute(method, rest, url.searchParams, body) ?? {
      status: 404,
      body: { type: "error", error: { type: "not_found_error", message: "" } },
    };
    return new Response(JSON.stringify(answer.body), {
      status: answer.status,
      headers: { "content-type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** The JSON body of the `index`th call that used `method`. */
export function sentBody(
  fetchMock: ReturnType<typeof stubGatewayFetch>,
  method: string,
  index = 0,
): unknown {
  const call = fetchMock.mock.calls.filter(
    ([, init]) => (init?.method ?? "GET") === method,
  )[index];
  return call?.[1]?.body ? JSON.parse(String(call[1].body)) : undefined;
}
