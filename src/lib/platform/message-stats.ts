"use client";

import { skipToken, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  messageInputTokens,
  messageLedgerPages,
  messageReadRefused,
  useMessageReportSession,
} from "./message-ledger";
import type { GatewayUsageRow } from "./types";

const emptyPeriod = () => ({
  requests: 0,
  reported: 0,
  input: 0,
  output: 0,
  read: 0,
  write: 0,
});
const emptyStats = () => ({ month: emptyPeriod(), week: emptyPeriod() });

function count(period: ReturnType<typeof emptyPeriod>, row: GatewayUsageRow) {
  period.requests++;
  const tokens = messageInputTokens(row);
  if (!tokens || row.output_tokens == null) return;
  period.reported++;
  period.input += tokens.total;
  period.output += row.output_tokens;
  period.read += tokens.read;
  period.write += tokens.write;
}

// Only the six counters per time window survive a ledger page. Busy gateways can
// return millions of request records across the full retention period.
export async function readMessageStats(signal: AbortSignal, now = Date.now()) {
  const stats = emptyStats();
  const weekStart = now - 7 * 86_400_000;
  for await (const { rows } of messageLedgerPages(signal, now)) {
    for (const row of rows) {
      count(stats.month, row);
      if (Date.parse(row.created_at) >= weekStart) count(stats.week, row);
    }
  }
  return stats;
}

export function useMessageStats() {
  const session = useMessageReportSession();
  const client = useQueryClient();
  const key = ["gateway", "usage", "message-stats", session?.id, session?.role];
  return useQuery({
    queryKey: key,
    queryFn: session?.id
      ? async ({ signal }) => {
          try {
            return await readMessageStats(signal);
          } catch (error) {
            if (!signal.aborted && messageReadRefused(error))
              client.setQueryData(key, emptyStats());
            throw error;
          }
        }
      : skipToken,
    gcTime: 0,
  });
}
