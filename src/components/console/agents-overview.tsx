"use client";

import { useState } from "react";
import Link from "next/link";
import { Popover } from "@base-ui/react/popover";
import {
  ArrowDown,
  ArrowUp,
  Bot,
  Box,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Database,
  ExternalLink,
  ListChecks,
  MessagesSquare,
  Plus,
  Rocket,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  useAgentsOverview,
  type AgentsOverviewReport,
  type OverviewSort,
  type OverviewDirection,
} from "@/lib/platform/agents-overview";
import {
  isSurfaceVisible,
  useSurfaces,
  type Surface,
} from "@/lib/platform/surfaces";
import { AGENTS_CREATE_ROUTE } from "@/lib/routes";
import {
  AgentOverviewCharts,
  chartCard,
  shortDay,
} from "./agent-overview-charts";
import { ErrorState, ListSkeleton } from "./bits";

const pct = (n: number) =>
  n.toLocaleString(undefined, { maximumFractionDigits: 1 }) + "%";
const labels: [OverviewSort, string][] = [
  ["name", "Name"],
  ["sessions", "Sessions"],
  ["error_rate", "Error rate"],
  ["last_active", "Last active"],
];
const destinations = [
  { label: "Agent", href: AGENTS_CREATE_ROUTE, surface: "agents", icon: Bot },
  {
    label: "Session",
    href: "/sessions",
    surface: "sessions",
    icon: MessagesSquare,
  },
  {
    label: "Deployment",
    href: "/deployments/new",
    surface: "deployments",
    icon: Rocket,
  },
  {
    label: "Environment",
    href: "/environments/new",
    surface: "environments",
    icon: Box,
  },
  {
    label: "Memory store",
    href: "/memory-stores",
    surface: "memory-stores",
    icon: Database,
  },
] as const;
function OverviewCreateMenu() {
  const surfaces = useSurfaces();
  const visible = destinations.filter((x) =>
    isSurfaceVisible(surfaces?.[x.surface as Surface], x.surface),
  );
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button size="sm" className="h-7 rounded-lg px-2 font-normal" />
        }
      >
        <Plus />
        Create
        <ChevronDown />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {visible.map((x) => (
          <DropdownMenuItem key={x.href} render={<Link href={x.href} />}>
            <x.icon className="size-4" />
            {x.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
function Metric({
  title,
  value,
  change,
  help,
  caption,
}: {
  title: string;
  value: number | null;
  change?: number | null;
  help?: string;
  caption: string;
}) {
  return (
    <section
      className={
        chartCard + " flex min-h-[121px] flex-col justify-between gap-1"
      }
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-medium">{title}</h2>
          {help && (
            <Popover.Root>
              <Popover.Trigger
                aria-label={"About " + title.toLowerCase()}
                className="rounded-full text-muted-foreground"
              >
                <CircleHelp className="size-3.5" />
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Positioner sideOffset={5} className="z-50">
                  <Popover.Popup
                    aria-label={title}
                    className="max-w-64 rounded-lg border bg-popover p-3 text-[13px] text-popover-foreground shadow-md"
                  >
                    {help}
                  </Popover.Popup>
                </Popover.Positioner>
              </Popover.Portal>
            </Popover.Root>
          )}
        </div>
        {typeof change === "number" && (
          <span
            aria-label={pct(change) + " change"}
            data-change-percent={change}
            className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs"
          >
            {change < 0 ? (
              <ArrowDown className="size-3" />
            ) : (
              <ArrowUp className="size-3" />
            )}
            {pct(Math.abs(change))}
          </span>
        )}
      </div>
      <p
        data-metric={title}
        data-value={value}
        className="text-[28px] leading-8 font-medium tracking-tight tabular-nums"
      >
        {value === null
          ? "—"
          : title === "Error rate"
            ? pct(value)
            : value.toLocaleString()}
      </p>
      <p className="text-[13px] text-muted-foreground">{caption}</p>
    </section>
  );
}
function Metrics({ summary }: { summary: AgentsOverviewReport["summary"] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <Metric
        title="Sessions"
        value={summary.sessions}
        change={summary.session_change}
        caption="vs previous 30 days"
        help="Sessions started in the last 30 days across this workspace’s agents, compared with the 30 days before."
      />
      <Metric
        title="Error rate"
        value={summary.sessions ? summary.error_rate : null}
        change={summary.error_change}
        caption="vs previous 30 days"
        help="Share of sessions in the last 30 days that ended in an error, compared with the 30 days before."
      />
      <Metric
        title="Agents"
        value={summary.agents}
        caption="With sessions in the last 30 days"
      />
    </div>
  );
}
const resources = [
  {
    title: "Skills",
    description: "Package instructions, tools, and files.",
    href: "skills",
    icon: Sparkles,
  },
  {
    title: "Deployments",
    description: "Run agents on a schedule and track each run.",
    href: "scheduled-deployments",
    icon: Rocket,
  },
  {
    title: "Outcomes",
    description: "Define how sessions are graded and catch regressions.",
    href: "define-outcomes",
    icon: ListChecks,
  },
];
export function AgentsOverview({ agentId }: { agentId?: string }) {
  const [sort, setSort] = useState<OverviewSort>("sessions");
  const [direction, setDirection] = useState<OverviewDirection>("desc");
  const report = useAgentsOverview(sort, direction, agentId);
  const data = report.data;
  return (
    <div className={agentId ? "pb-8" : "-mx-4 sm:-mx-8"}>
      <div
        className={
          "mx-auto flex w-full max-w-[1600px] flex-col gap-7 " +
          (agentId ? "" : "px-6")
        }
      >
        {!agentId && (
          <header className="mb-2 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-y-2">
            <h1 className="font-serif text-[22px] leading-7 font-medium">
              Agents
            </h1>
            <OverviewCreateMenu />
            <p className="col-span-2 text-sm text-muted-foreground">
              How your agents are doing across this workspace.
            </p>
          </header>
        )}
        {report.error ? (
          <ErrorState error={report.error} />
        ) : !data ? (
          <ListSkeleton />
        ) : (
          <>
            <Metrics summary={data.summary} />
            <AgentOverviewCharts report={data} agentId={agentId} />
            {!agentId && (
              <section aria-label="Agents activity" className="min-w-0 py-2">
                <h2 className="mb-3 flex items-center gap-2 text-[16px] font-medium">
                  Agents{" "}
                  <span className="text-xs font-normal text-muted-foreground">
                    {data.agents.length} of {data.total}
                  </span>
                </h2>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[460px] text-left text-sm">
                    <thead className="text-[13px] text-muted-foreground">
                      <tr>
                        {labels.map(([key, label]) => (
                          <th
                            key={key}
                            aria-sort={
                              key === sort
                                ? direction === "asc"
                                  ? "ascending"
                                  : "descending"
                                : "none"
                            }
                            className="border-b px-2 py-2 font-normal"
                          >
                            <button
                              className="inline-flex items-center gap-1 rounded-sm"
                              onClick={() => {
                                setSort(key);
                                setDirection(
                                  key === sort
                                    ? direction === "asc"
                                      ? "desc"
                                      : "asc"
                                    : key === "name"
                                      ? "asc"
                                      : "desc",
                                );
                              }}
                            >
                              {label}
                              {key === sort &&
                                (direction === "asc" ? (
                                  <ArrowUp className="size-3" />
                                ) : (
                                  <ArrowDown className="size-3" />
                                ))}
                            </button>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.agents.map((a) => (
                        <tr
                          key={a.id}
                          data-agent-id={a.id}
                          className="relative border-b hover:bg-muted/55"
                        >
                          <td className="px-2 py-2">
                            <Link
                              className="rounded-sm font-medium after:absolute after:inset-0"
                              href={
                                "/agents/" +
                                encodeURIComponent(a.id) +
                                "?tab=observability"
                              }
                            >
                              {a.name}
                            </Link>
                            {a.archived_at && (
                              <span className="ml-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                                <span className="rounded-md bg-muted px-1.5 py-0.5">
                                  Archived
                                </span>
                                <time dateTime={a.archived_at}>
                                  {new Date(a.archived_at).toLocaleString(
                                    undefined,
                                    { dateStyle: "medium", timeStyle: "short" },
                                  )}
                                </time>
                              </span>
                            )}
                          </td>
                          <td
                            data-sessions={a.sessions}
                            className="px-2 tabular-nums"
                          >
                            {a.sessions}
                          </td>
                          <td
                            data-error-rate={a.sessions ? a.error_rate : null}
                            className="px-2 tabular-nums"
                          >
                            {a.sessions ? pct(a.error_rate) : "—"}
                          </td>
                          <td
                            data-last-active={a.last_active}
                            className="px-2 whitespace-nowrap"
                          >
                            {a.last_active ? shortDay(a.last_active) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!data.total && (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    No agents in this workspace yet.
                  </p>
                )}
                {data.total > data.agents.length && (
                  <Link
                    className="mt-3 inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm hover:bg-muted"
                    href="/agents"
                  >
                    Show more
                    <ChevronRight className="size-3" />
                  </Link>
                )}
              </section>
            )}
          </>
        )}
        {!agentId && (
          <section>
            <h2 className="mb-3 text-[16px] font-medium">Resources</h2>
            <div className="grid gap-4 md:grid-cols-3">
              {resources.map((x) => (
                <a
                  key={x.title}
                  href={
                    "https://platform.claude.com/docs/en/managed-agents/" +
                    x.href
                  }
                  target="_blank"
                  rel="noreferrer"
                  className={
                    chartCard +
                    " group flex items-start gap-3 hover:bg-muted/60"
                  }
                >
                  <x.icon className="mt-0.5 size-4" />
                  <div className="grow">
                    <b className="text-sm font-medium">{x.title}</b>
                    <p className="mt-1 text-[13px] text-muted-foreground">
                      {x.description}
                    </p>
                  </div>
                  <ExternalLink className="size-3.5 text-muted-foreground" />
                </a>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
