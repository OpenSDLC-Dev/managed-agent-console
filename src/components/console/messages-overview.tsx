"use client";

import { useContext, type ReactNode } from "react";
import Link from "next/link";
import { Popover } from "@base-ui/react/popover";
import { ArrowUpRight, BookOpen, FileText, Gauge, Info } from "lucide-react";
import { ConsoleSessionContext } from "@/components/shell/console-session";
import { buttonVariants } from "@/components/ui/button";
import { useMessageStats } from "@/lib/platform/message-stats";
import type { NativeSession } from "@/lib/platform/native";
import { useApiKeys } from "@/lib/platform/queries";
import { useSurfaces } from "@/lib/platform/surfaces";
import type { ApiKeyListItem } from "@/lib/platform/types";
import { MESSAGE_LOGS_ROUTE, PLAYGROUND_ROUTE } from "@/lib/routes";
import { cn } from "@/lib/utils";
import {
  apiKeyAccountLabel,
  apiKeyCreatorLabel,
  apiKeyDisplayName,
  apiKeyStatusLabel,
} from "./api-key-labels";
import { CreateKeyButton } from "./api-keys";
import { Day, EmptyState, ErrorState, ListSkeleton } from "./bits";
import { exactCount, tokenCount } from "./usage-bits";

const textLink =
  "rounded-sm text-sm text-[#345477] underline decoration-current/40 underline-offset-2 hover:decoration-current dark:text-[#a4bfdb]";
const sectionTitle = "text-base leading-6 font-medium";
const percent = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 1,
});

function Metric({
  title,
  hint,
  href,
  action,
  value,
  children,
}: {
  title: string;
  hint: string;
  href: string;
  action: string;
  value: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className="flex min-w-0 flex-col rounded-xl bg-muted/70 p-4"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-medium">
          {title}
          <Popover.Root>
            <Popover.Trigger
              aria-label={`More info about ${title}`}
              className="cursor-help rounded-sm text-muted-foreground"
            >
              <Info aria-hidden className="size-3.5" />
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Positioner sideOffset={6} className="z-50">
                <Popover.Popup
                  aria-label={`More info about ${title}`}
                  className="max-w-72 rounded-lg border bg-popover p-3 text-sm text-popover-foreground shadow-md"
                >
                  {hint}
                </Popover.Popup>
              </Popover.Positioner>
            </Popover.Portal>
          </Popover.Root>
        </h2>
        <Link href={href} className={textLink}>
          {action}
        </Link>
      </div>
      <p className="mt-5 text-[22px] leading-7 font-medium tabular-nums">
        {value}
      </p>
      <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {children}
      </div>
    </section>
  );
}

function MessageMetrics() {
  const usage = useMessageStats();
  if (usage.error) return <ErrorState error={usage.error} />;
  if (!usage.data) return <ListSkeleton rows={2} />;
  const {
    month: { input, output, reported, requests },
    week: cache,
  } = usage.data;
  const known = reported > 0 || requests === 0;
  const caching = cache.read + cache.write > 0;
  const rate =
    caching && cache.input > 0 ? percent.format(cache.read / cache.input) : "—";
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Metric
        title="Tokens"
        hint="Reported tokens from direct requests still in the gateway log for the last 30 days. Input includes cache reads and writes."
        href="/usage"
        action="Open usage"
        value={tokenCount(known ? input + output : null)}
      >
        <span>Last 30 days</span>
        {known && (
          <>
            <span>{exactCount(input)} input</span>
            <span>{exactCount(output)} output</span>
          </>
        )}
        {reported < requests && (
          <span>
            {reported
              ? `Usage reported for ${reported} of ${requests} requests`
              : "Usage not reported"}
          </span>
        )}
      </Metric>
      <Metric
        title="Requests"
        hint="Direct Messages API requests and Playground runs still in the gateway log for the last 30 days. Includes recorded errors. The gateway's retention period can be shorter."
        href={MESSAGE_LOGS_ROUTE}
        action="Open logs"
        value={exactCount(requests)}
      >
        Last 30 days
      </Metric>
      <Metric
        title="Cache hit rate"
        hint="Share of reported input tokens served from cache in the last 7 days, from direct requests still in the gateway log. Usage includes other gateway traffic."
        href="/usage?range=7#input-tokens"
        action="Open caching"
        value={rate}
      >
        {caching
          ? `${exactCount(cache.read)} cached input tokens`
          : cache.requests > 0 && !cache.reported
            ? "Usage not reported"
            : cache.reported < cache.requests
              ? "No reported cache use"
              : "Not caching"}
        {!caching && (cache.reported > 0 || !cache.requests) && (
          <a
            href="https://platform.claude.com/docs/en/build-with-claude/prompt-caching"
            target="_blank"
            rel="noreferrer"
            className={cn(textLink, "inline-flex items-center gap-0.5 text-xs")}
          >
            Start caching your prompts{" "}
            <ArrowUpRight aria-hidden className="size-3" />
          </a>
        )}
      </Metric>
    </div>
  );
}

function AccountCell({
  name,
  detail,
  href,
}: {
  name: string;
  detail?: ReactNode;
  href?: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span
        aria-hidden
        className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] text-muted-foreground"
      >
        {name.slice(0, 1).toUpperCase()}
      </span>
      <div className="min-w-0">
        <div className="truncate">
          {href ? (
            <Link className={textLink} href={href}>
              {name}
            </Link>
          ) : (
            name
          )}
        </div>
        {detail && (
          <div className="truncate text-xs text-muted-foreground">{detail}</div>
        )}
      </div>
    </div>
  );
}

function KeyAccount({
  apiKey,
  session,
  canOpenAccount,
}: {
  apiKey: ApiKeyListItem;
  session?: Partial<NativeSession> | null;
  canOpenAccount: boolean;
}) {
  const owner = apiKey.principal;
  const label = apiKeyAccountLabel(apiKey, session);
  const self = owner?.type === "user_actor" && owner.user_id === session?.id;
  if (!owner) return label;
  return (
    <AccountCell
      name={label}
      detail={self && `${session?.email || label} (you)`}
      href={
        owner.type === "service_account_actor" && canOpenAccount
          ? `/service-accounts/${encodeURIComponent(owner.service_account_id)}`
          : undefined
      }
    />
  );
}

function RecentKeys({ canOpenAccount }: { canOpenAccount: boolean }) {
  const keys = useApiKeys();
  const session = useContext(ConsoleSessionContext)?.data;
  const rows = keys.data
    ?.filter((key) => key.status !== "archived")
    .slice(0, 5);
  return (
    <section aria-labelledby="messages-keys">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 id="messages-keys" className={sectionTitle}>
          API keys
        </h2>
        <div className="flex items-center gap-4">
          <Link href="/api-keys" className={textLink}>
            View all keys
          </Link>
          <CreateKeyButton subtle />
        </div>
      </div>
      {keys.error ? (
        <ErrorState error={keys.error} />
      ) : !rows ? (
        <ListSkeleton />
      ) : rows.length === 0 ? (
        <EmptyState title="No API keys yet." />
      ) : (
        <div
          role="region"
          aria-label="API key list"
          tabIndex={0}
          className="overflow-x-auto"
        >
          <table
            aria-label="API keys"
            className="w-full min-w-[660px] table-fixed text-left text-sm"
          >
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                {[
                  "Key",
                  "Linked account",
                  "Created",
                  "Expires",
                  "Last used",
                ].map((label, i) => (
                  <th
                    key={label}
                    scope="col"
                    className={cn(
                      "py-2 pr-3 font-normal",
                      i < 3 ? "w-[27%]" : "w-[9.5%]",
                    )}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((key) => (
                <tr
                  key={key.id}
                  className="border-b last:border-0 hover:bg-muted/40"
                >
                  <td className="py-2 pr-3">
                    <Link
                      href={`/api-keys?key=${encodeURIComponent(key.id)}`}
                      className="block rounded-sm hover:underline"
                    >
                      <span className="flex items-center gap-2">
                        <span className="truncate">
                          {apiKeyDisplayName(key)}
                        </span>
                        {key.status !== "active" && (
                          <span className="rounded bg-muted px-1.5 text-xs">
                            {apiKeyStatusLabel(key.status)}
                          </span>
                        )}
                      </span>
                      <span className="block truncate font-mono text-xs text-muted-foreground">
                        {key.partial_key_hint}
                      </span>
                    </Link>
                  </td>
                  <td className="truncate py-2 pr-3">
                    <KeyAccount
                      apiKey={key}
                      session={session}
                      canOpenAccount={canOpenAccount}
                    />
                  </td>
                  <td className="truncate py-2 pr-3">
                    <AccountCell
                      name={apiKeyCreatorLabel(key, session)}
                      detail={<Day iso={key.created_at} />}
                    />
                  </td>
                  <td className="py-2 pr-2">
                    {key.expires_at ? <Day iso={key.expires_at} /> : "—"}
                  </td>
                  <td className="py-2 text-muted-foreground">
                    <span title="The platform does not report when a key was last used.">
                      —
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

const resources = [
  {
    surface: "files",
    label: "Files",
    href: "/files",
    icon: FileText,
    description: "Upload and manage files for your sessions.",
  },
  {
    surface: "skills",
    label: "Skills",
    href: "/skills",
    icon: BookOpen,
    description: "Package instructions, tools and files.",
  },
  {
    surface: "models",
    label: "Rate limits",
    href: "/models",
    icon: Gauge,
    description: "Select a model to view its request and token limits.",
  },
] as const;

export function MessagesOverview() {
  const surfaces = useSurfaces();
  const session = useContext(ConsoleSessionContext)?.data;
  const links = resources.filter(
    ({ surface }) => surfaces?.[surface].status === "available",
  );
  return (
    <div className="space-y-9 sm:-mx-2">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-medium leading-8">
            Messages
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Direct API requests and keys.
          </p>
        </div>
        {session?.playground_access === true && (
          <Link
            href={PLAYGROUND_ROUTE}
            className={buttonVariants({ variant: "secondary", size: "sm" })}
          >
            Open playground
          </Link>
        )}
      </header>
      {surfaces?.usage.status === "available" && <MessageMetrics />}
      {surfaces?.["api-keys"].status === "available" && (
        <RecentKeys
          canOpenAccount={surfaces["service-accounts"].status === "available"}
        />
      )}
      {links.length > 0 && (
        <section aria-labelledby="messages-resources">
          <h2 id="messages-resources" className={cn(sectionTitle, "mb-3")}>
            Resources
          </h2>
          <div className="grid gap-4 md:grid-cols-3">
            {links.map(({ label, description, href, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className="flex items-start gap-3 rounded-xl bg-muted/70 p-4 hover:bg-muted"
              >
                <span className="rounded-lg bg-accent p-2">
                  <Icon aria-hidden className="size-4 text-muted-foreground" />
                </span>
                <div>
                  <p className="text-sm font-medium">{label}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {description}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
