"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  useGatewayAliases,
  useGatewayDeployments,
  type GatewayUsageFilter,
} from "@/lib/platform/gateway-queries";
import { useApiKeys } from "@/lib/platform/queries";

/**
 * Shared by Usage's two pages (plan 10 slice 5). Cost carries no currency:
 * the gateway stores the number an operator enters as a price (plan 10
 * decision 8).
 */

const compact = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});
const whole = new Intl.NumberFormat("en-US");
const money = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const small = new Intl.NumberFormat("en-US", { maximumSignificantDigits: 2 });

/** "412.6M"; a dash for a count the upstream did not report. */
export const tokenCount = (n: number | null) =>
  n === null ? "—" : compact.format(n);

/** "18,204"; a dash for a count the upstream did not report. */
export const exactCount = (n: number | null) =>
  n === null ? "—" : whole.format(n);

/**
 * "1,204.50", no currency. A cost under 0.01 keeps two significant digits,
 * "0.00051", so a cheap request does not read as free. A dash for a request
 * with no cost.
 */
export const costText = (n: number | null) =>
  n === null ? "—" : n > 0 && n < 0.01 ? small.format(n) : money.format(n);

/** "8.4s". */
export const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

/** "Oct 12" for a UTC day as YYYY-MM-DD. */
export const dayLabel = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

/** The UTC days `days` long ending today, as the daily read takes them. */
export function lastDays(days: number, now = new Date()) {
  const today = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
  return { from: iso(today - (days - 1) * 86_400_000), to: iso(today) };
}

const VIEWS = [
  ["/usage", "Overview"],
  ["/usage/requests", "Requests"],
] as const;

export function UsageViews() {
  const pathname = usePathname();
  return (
    <nav aria-label="Usage views" className="mb-4 flex gap-5 border-b">
      {VIEWS.map(([href, label]) => (
        <Link
          key={href}
          href={href}
          aria-current={pathname === href ? "page" : undefined}
          className={cn(
            "-mb-px border-b-2 py-1.5 text-sm",
            pathname === href
              ? "border-foreground text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}

/**
 * What the ledger and the rollups name only by id: a key by its name, an
 * upstream model by its model id. One deleted since shows its id.
 */
export function useUsageNames() {
  const keys = useApiKeys();
  const aliases = useGatewayAliases();
  const deployments = useGatewayDeployments();
  return {
    keys: keys.data ?? [],
    aliases: aliases.data?.data ?? [],
    deployments: deployments.data?.data ?? [],
    keyName: (id: string) => keys.data?.find((k) => k.id === id)?.name ?? id,
    upstreamName: (id: string) =>
      deployments.data?.data.find((d) => d.id === id)?.upstream_model ?? id,
  };
}

const SELECT = "h-8 rounded-md border bg-transparent px-2 text-sm";

/**
 * Key, model and upstream filters, each the read's own parameter. Usage
 * outlives a model or upstream model deleted since, so each also offers, by
 * id, what the page's rows name and the catalog lacks.
 */
export function UsageFilters({
  filter,
  onChange,
  seen,
  children,
}: {
  filter: GatewayUsageFilter;
  onChange: (filter: GatewayUsageFilter) => void;
  seen: Required<GatewayUsageFilter>[];
  children?: React.ReactNode;
}) {
  const names = useUsageNames();
  const field = (
    label: string,
    key: keyof GatewayUsageFilter,
    all: string,
    catalog: [string, string][],
  ) => {
    const known = new Set(catalog.map(([value]) => value));
    const gone = new Set(
      [...seen.map((r) => r[key]), filter[key]].filter(
        (v): v is string => !!v && !known.has(v),
      ),
    );
    const options = [...catalog, ...[...gone].map((v) => [v, v])];
    return (
      <label className="flex items-center gap-1.5 text-sm">
        <span className="text-muted-foreground">{label}</span>
        <select
          className={SELECT}
          value={filter[key] ?? ""}
          onChange={(e) =>
            onChange({ ...filter, [key]: e.target.value || undefined })
          }
        >
          <option value="">{all}</option>
          {options.map(([value, text]) => (
            <option key={value} value={value}>
              {text}
            </option>
          ))}
        </select>
      </label>
    );
  };
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pb-4">
      {children}
      {field(
        "Key",
        "api_key_id",
        "All keys",
        names.keys.map((k) => [k.id, k.name]),
      )}
      {field(
        "Model",
        "alias",
        "All models",
        names.aliases.map((a) => [a.name, a.name]),
      )}
      {field(
        "Upstream",
        "deployment_id",
        "All upstream models",
        names.deployments.map((d) => [d.id, d.upstream_model]),
      )}
    </div>
  );
}

export { SELECT as USAGE_SELECT };
