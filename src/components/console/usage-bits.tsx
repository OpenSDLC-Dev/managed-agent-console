"use client";

import { NativeSelect } from "@/components/ui/native-select";
import { useContext, useMemo } from "react";
import { ChevronDown } from "lucide-react";
import { ConsoleSessionContext } from "@/components/shell/console-session";
import Link from "@/components/shell/workspace-navigation";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  useGatewayAliases,
  useGatewayDeployments,
  type GatewayUsageFilter,
} from "@/lib/platform/gateway-queries";
import { useApiKeys } from "@/lib/platform/queries";
import { apiKeyDisplayName } from "./api-key-labels";

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
  n === null
    ? "—"
    : n !== 0 && Math.abs(n) < 0.01
      ? small.format(n)
      : money.format(n);

/** "8.4s"; under a second "12ms", and under 10 ms "0.4ms", so a fast call is not "0.0s". */
export const duration = (ms: number) =>
  ms >= 999.5
    ? `${(ms / 1000).toFixed(1)}s`
    : `${ms >= 10 ? Math.round(ms) : Number(ms.toFixed(1))}ms`;

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
  const summaryOnly =
    useContext(ConsoleSessionContext)?.data?.workspace_role === "billing";
  return (
    <nav aria-label="Usage views" className="mb-4 flex gap-5 border-b">
      {VIEWS.filter(([href]) => !summaryOnly || href === "/usage").map(
        ([href, label]) => (
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
        ),
      )}
    </nav>
  );
}

/**
 * What the ledger and the rollups name only by id: a key by its name, an
 * upstream model by its model id. One deleted since shows its id. Each
 * catalog is indexed once, since every group and ledger row looks one up.
 */
export function useUsageNames() {
  const keys = useApiKeys();
  const aliases = useGatewayAliases();
  const deployments = useGatewayDeployments();
  const keyNames = useMemo(
    () => new Map(keys.data?.map((k) => [k.id, apiKeyDisplayName(k)])),
    [keys.data],
  );
  const upstreams = useMemo(
    () => new Map(deployments.data?.data.map((d) => [d.id, d.upstream_model])),
    [deployments.data],
  );
  return {
    keys: keys.data ?? [],
    aliases: aliases.data?.data ?? [],
    deployments: deployments.data?.data ?? [],
    keyName: (id: string) => keyNames.get(id) ?? id,
    upstreamName: (id: string) => upstreams.get(id) ?? id,
  };
}

type UsageOption<T extends string = string> = readonly [value: T, text: string];

export function UsageSelect<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly UsageOption<T>[];
  onChange: (value: T) => void;
}) {
  const selected = options.find(([id]) => id === value);
  return (
    <label className="relative inline-flex h-7 min-w-0 max-w-full items-center gap-1.5 rounded-lg bg-muted/85 pe-2.5 ps-2 text-sm has-[:open]:outline has-[:open]:outline-link has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring forced-colors:border">
      <span aria-hidden="true" className="shrink-0 text-muted-foreground">
        {label}
      </span>
      <span aria-hidden="true" className="truncate">
        {selected?.[1]}
      </span>
      <ChevronDown
        aria-hidden="true"
        className="size-3.5 shrink-0 text-muted-foreground"
      />
      <NativeSelect
        aria-label={label}
        data-usage-filter
        className="absolute inset-0 size-full cursor-pointer opacity-0"
        value={value}
        onChange={(event) =>
          onChange(options[event.currentTarget.selectedIndex][0])
        }
      >
        {options.map(([id, text]) => (
          <option key={id} value={id}>
            {text}
          </option>
        ))}
      </NativeSelect>
    </label>
  );
}

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
  grouping,
}: {
  filter: GatewayUsageFilter;
  onChange: (filter: GatewayUsageFilter) => void;
  seen: (Omit<Required<GatewayUsageFilter>, "principal_id"> & {
    principal_id?: string | null;
  })[];
  children?: React.ReactNode;
  grouping?: React.ReactNode;
}) {
  const names = useUsageNames();
  const field = (
    label: string,
    key: keyof GatewayUsageFilter,
    catalog: [string, string][],
  ) => {
    const known = new Set(catalog.map(([value]) => value));
    const gone = new Set(
      [...seen.map((r) => r[key]), filter[key]].filter(
        (v): v is string => !!v && !known.has(v),
      ),
    );
    const options: UsageOption[] = [["", "All"], ...catalog];
    for (const id of gone) options.push([id, id]);
    return (
      <UsageSelect
        label={label}
        value={filter[key] ?? ""}
        options={options}
        onChange={(id) => onChange({ ...filter, [key]: id || undefined })}
      />
    );
  };
  return (
    <div className="flex flex-wrap items-center gap-2 pb-4">
      {children}
      {(filter.principal_id ||
        seen.some((r) => r.principal_id !== undefined)) &&
        field("Principal", "principal_id", [])}
      {field(
        "API key",
        "api_key_id",
        names.keys.map((k) => [k.id, names.keyName(k.id)]),
      )}
      {field(
        "Model",
        "alias",
        names.aliases.map((a) => [a.name, a.name]),
      )}
      {field(
        "Upstream",
        "deployment_id",
        names.deployments.map((d) => [d.id, d.upstream_model]),
      )}
      {grouping && (
        <div className="flex max-w-full items-center sm:gap-3 sm:before:h-4 sm:before:border-s sm:before:border-border">
          {grouping}
        </div>
      )}
    </div>
  );
}
