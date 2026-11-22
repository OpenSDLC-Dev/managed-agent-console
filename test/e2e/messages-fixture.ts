import type { Page } from "@playwright/test";
import type { GatewayUsageRow } from "../../src/lib/platform/types";
import { gatewayFixtures } from "../mock-platform/gateway.mjs";

export const DIRECT_REQUEST = "req_messages_direct";
export const PLAYGROUND_REQUEST = "req_messages_playground";
export const EXPIRED_REQUEST = "req_messages_expired";

/** A mixed gateway ledger, newest first, including requests outside Messages. */
export function messagesLedger(): GatewayUsageRow[] {
  const [agent, embedding, completion, failure] = gatewayFixtures().ledger;
  const time = (days: number) =>
    new Date(Date.now() - days * 86_400_000).toISOString();

  return [
    { ...agent, id: 12, request_id: "req_messages_agent", api_key_id: "" },
    { ...embedding, id: 11 },
    { ...completion, id: 10 },
    {
      ...agent,
      id: 9,
      request_id: DIRECT_REQUEST,
      created_at: time(1),
      api_key_id: "apikey_ci01",
      model: "minimax-m3",
      // A wildcard route preserves the caller's model independently.
      alias: "*",
      // An API-key client may supply a session ID for upstream affinity.
      session_id: "client-affinity-01",
      principal_id: "prn_messages_operator",
      input_tokens: 48,
      output_tokens: 12,
      cache_write_tokens: 8,
      cache_read_tokens: 40,
    },
    {
      ...failure,
      id: 8,
      request_id: PLAYGROUND_REQUEST,
      created_at: time(29),
      api_key_id: "",
      model: "deepseek-flash",
      alias: "deepseek-flash",
      deployment_id: "gwdep_dsflash01",
      credential_id: "gwcred_ds000001",
      session_id: null,
      principal_id: "prn_messages_operator",
    },
    {
      ...agent,
      id: 7,
      request_id: EXPIRED_REQUEST,
      created_at: time(31),
      api_key_id: "apikey_ci01",
      session_id: null,
    },
  ];
}

/** Small cursor pages exercise the gateway's before/has_more contract. */
export async function serveMessagesLedger(
  page: Page,
  rows: GatewayUsageRow[] = messagesLedger(),
) {
  await page.route(
    (url) => url.pathname === "/admin/v1/usage/requests",
    async (route) => {
      const query = new URL(route.request().url()).searchParams;
      if (
        route.request().method() !== "GET" ||
        [...query.keys()].some((key) => key !== "before" && key !== "limit")
      )
        return route.fallback();
      const limit = Math.min(3, Number(query.get("limit") ?? 100));
      const before = Number(query.get("before") ?? Infinity);
      const remaining = rows.filter((row) => row.id < before);
      await route.fulfill({
        json: {
          data: remaining.slice(0, limit),
          has_more: remaining.length > limit,
        },
      });
    },
  );
}
