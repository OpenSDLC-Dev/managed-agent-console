"use client";

import { PLAYGROUND_ROUTE, surfacePaths } from "@/lib/routes";
import { Bot, BookOpen, ChevronDown } from "lucide-react";
import Link from "next/link";
import {
  createContext,
  Fragment,
  useContext,
  useId,
  useState,
  type ReactNode,
} from "react";
import { ConsoleSessionContext } from "@/components/shell/console-session";
import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { isPermissionDenied } from "@/lib/platform/denied";
import {
  useGatewayAliases,
  useGatewayDeployments,
  useGatewayProviders,
} from "@/lib/platform/gateway-queries";
import { PlatformError } from "@/lib/platform/http";
import { usePlaygroundModels } from "@/lib/platform/playground-queries";
import {
  isUnimplemented,
  useSurfaces,
  type SurfaceState,
} from "@/lib/platform/surfaces";
import type { GatewayProvider } from "@/lib/platform/types";
import { cn } from "@/lib/utils";
import {
  dashboardModelPath,
  type DashboardModel,
} from "./dashboard-model-catalog";
import {
  DeploymentPrices,
  type ModelUpstream,
  type PriceLayout,
} from "./dashboard-model-prices";

const linkStyle =
  "rounded-sm underline decoration-muted-foreground/50 underline-offset-4 hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-ring";

const PopupModel = createContext<DashboardModel | null>(null);
type PopupAlias = { name: string; mixed: boolean };

function PopupActions({
  model,
  aliases = [],
  listed,
  agentsAllowed,
  notice,
}: {
  model: DashboardModel;
  aliases?: PopupAlias[];
  listed?: Set<string>;
  agentsAllowed?: boolean;
  notice?: ReactNode;
}) {
  const [chosen, choose] = useState("");
  const single = aliases.length === 1 ? aliases[0] : undefined;
  // A shared fallback requires an explicit choice even if it is the only route.
  const selected = chosen
    ? aliases.find((alias) => alias.name === chosen)
    : single && !single.mixed
      ? single
      : undefined;
  const query = selected && new URLSearchParams({ model: selected.name });
  const canTry = selected && listed?.has(selected.name);
  const status =
    notice ??
    (selected && !canTry
      ? "This alias is not listed in Playground."
      : undefined);
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      {aliases.length > 0 && (!single || single.mixed || !selected) && (
        <select
          aria-label="Gateway alias"
          className="h-7 max-w-full min-w-0 rounded-md border bg-background px-1.5 text-sm outline-ring focus-visible:outline-2"
          value={selected?.name ?? ""}
          onChange={(event) => choose(event.target.value)}
        >
          <option value="">Choose an alias</option>
          {aliases.map((alias) => (
            <option key={alias.name} value={alias.name}>
              {alias.name}
            </option>
          ))}
        </select>
      )}
      {status && (
        <span role="status" className="text-muted-foreground">
          {status}
        </span>
      )}
      {(selected?.mixed || single?.mixed) && (
        <span className="text-muted-foreground">
          Also routes to other upstream models
        </span>
      )}
      <div className="inline-flex shrink-0 items-center">
        {canTry && (
          <Link
            href={`${PLAYGROUND_ROUTE}?${query}`}
            data-playground-popup-try=""
            title={`Try ${selected.name} in Playground`}
            className={cn(buttonVariants({ size: "sm" }), "rounded-r-none")}
          >
            Try in playground
          </Link>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="More options"
            className={cn(
              buttonVariants({
                size: "icon-sm",
                variant: canTry ? "default" : "secondary",
              }),
              canTry && "w-6 rounded-l-none border-l-primary-foreground/30",
            )}
          >
            <ChevronDown aria-hidden className="size-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align={canTry ? "end" : "start"}
            className="w-max"
          >
            <DropdownMenuGroup>
              {selected && (
                <DropdownMenuLabel className="max-w-64 break-all">
                  Gateway alias · <code>{selected.name}</code>
                </DropdownMenuLabel>
              )}
              {agentsAllowed && selected && (
                <DropdownMenuItem
                  render={<Link href={`${surfacePaths.agents}/new?${query}`} />}
                  title={`Build with ${selected.name}`}
                >
                  <Bot aria-hidden /> Build an agent
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                render={<Link href={dashboardModelPath(model)} />}
              >
                <BookOpen aria-hidden /> View model guide
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function Notice({ children }: { children: ReactNode }) {
  const popup = useContext(PopupModel);
  if (popup) return <PopupActions model={popup} notice={children} />;
  return (
    <p role="status" className="text-sm text-muted-foreground">
      {children}
    </p>
  );
}

function SurfaceNotice({
  state,
  name,
}: {
  state?: SurfaceState;
  name: string;
}) {
  switch (state?.status) {
    case "denied":
      return <Notice>Your account cannot view {name}.</Notice>;
    case "unimplemented":
      return <Notice>This Platform does not expose {name}.</Notice>;
    case "unknown":
      return <Notice>Access to {name} could not be verified.</Notice>;
    default:
      return <Notice>Checking access to {name}…</Notice>;
  }
}

function readMessage({
  error,
  name,
  retry,
}: {
  error: unknown;
  name: string;
  retry: () => void;
}) {
  if (!error) return `Loading ${name}…`;
  if (
    isPermissionDenied(error) ||
    (error instanceof PlatformError && error.status === 401)
  )
    return `Your account cannot view ${name}.`;
  if (isUnimplemented(error)) return `This Platform does not expose ${name}.`;
  return (
    <>
      Could not load {name}.{" "}
      <button type="button" className={linkStyle} onClick={() => retry()}>
        Retry
      </button>
    </>
  );
}

function ReadNotice(props: Parameters<typeof readMessage>[0]) {
  return <Notice>{readMessage(props)}</Notice>;
}

type Gates = {
  aliasAccess?: SurfaceState;
  playgroundPrincipal?: string;
  agentsAllowed: boolean;
  pricing?: PriceLayout;
};

function AliasList({
  upstreams,
  playgroundPrincipal,
  agentsAllowed,
}: {
  upstreams: ModelUpstream[];
  playgroundPrincipal?: string;
  agentsAllowed: boolean;
}) {
  const popup = useContext(PopupModel);
  const read = useGatewayAliases();
  const ids = new Set(upstreams.map(({ deployment }) => deployment.id));
  const enabledIds = new Set(
    upstreams
      .filter(
        ({ provider, deployment }) => provider.enabled && deployment.enabled,
      )
      .map(({ deployment }) => deployment.id),
  );
  const aliases = (read.error ? [] : (read.data?.data ?? [])).filter(
    (alias) =>
      alias.kind === "chat" &&
      alias.targets.some((target) => ids.has(target.deployment_id)),
  );
  // A fallback can share its alias with other models. Listing an alias in the
  // session's Playground catalogue confirms its name, not vendor availability.
  const candidates = new Set(
    aliases
      .filter(
        (alias) =>
          alias.name !== "*" &&
          alias.targets.some((t) => enabledIds.has(t.deployment_id)),
      )
      .map((alias) => alias.name),
  );
  const principal = candidates.size ? playgroundPrincipal : undefined;
  const models = usePlaygroundModels(principal);
  if (read.error || !read.data)
    return (
      <ReadNotice
        name="gateway aliases"
        error={read.error}
        retry={read.refetch}
      />
    );
  if (!aliases.length)
    return <Notice>No gateway alias routes to this upstream model.</Notice>;
  const listed = new Set(
    principal && !models.error
      ? models.data?.filter((m) => candidates.has(m.id)).map((m) => m.id)
      : [],
  );
  const mixed = (alias: (typeof aliases)[number]) =>
    alias.targets.some((target) => !ids.has(target.deployment_id));
  if (popup) {
    let notice: ReactNode;
    if (!candidates.size)
      notice = "No enabled chat alias routes to this model.";
    else if (!principal) notice = "Playground access is unavailable.";
    else if (models.error || !models.data)
      notice = readMessage({
        error: models.error,
        name: "Playground models",
        retry: models.refetch,
      });
    else if (!listed.size)
      notice = "No matching alias is listed in Playground.";
    return (
      <PopupActions
        model={popup}
        aliases={aliases
          .filter(
            (alias) =>
              candidates.has(alias.name) &&
              (agentsAllowed || listed.has(alias.name)),
          )
          .map((alias) => ({ name: alias.name, mixed: mixed(alias) }))}
        listed={listed}
        agentsAllowed={agentsAllowed}
        notice={notice}
      />
    );
  }
  return (
    <>
      <ul className="divide-y">
        {aliases.map((alias) => {
          const modelQuery = new URLSearchParams({
            model: alias.name,
          }).toString();
          return (
            <li
              key={alias.name}
              data-gateway-alias={alias.name}
              className="flex flex-wrap items-center justify-between gap-2 py-2 first:pt-0 last:pb-0"
            >
              <div className="min-w-0 space-y-1">
                <Link
                  href={`/models?${modelQuery}`}
                  className={`${linkStyle} break-all font-mono text-sm`}
                >
                  {alias.name}
                </Link>
                {mixed(alias) && (
                  <p className="text-xs text-muted-foreground">
                    Also routes to other upstream models
                  </p>
                )}
                {alias.name === "*" && (
                  <p className="text-xs text-muted-foreground">
                    Wildcard fallback
                  </p>
                )}
              </div>
              {listed.has(alias.name) && (
                <Link
                  href={`${PLAYGROUND_ROUTE}?${modelQuery}`}
                  aria-label={`Open in Playground for ${alias.name}`}
                  className={`${linkStyle} text-sm`}
                >
                  Open in Playground
                </Link>
              )}
            </li>
          );
        })}
      </ul>
      {principal && (models.error || !models.data) && (
        <ReadNotice
          error={models.error}
          name="Playground models"
          retry={models.refetch}
        />
      )}
      {principal && !models.error && models.data && !listed.size && (
        <Notice>No matching alias is listed in Playground.</Notice>
      )}
    </>
  );
}

function Upstreams({
  model,
  providers,
  aliasAccess,
  playgroundPrincipal,
  agentsAllowed,
  pricing,
}: Gates & {
  model: DashboardModel;
  providers: GatewayProvider[];
}) {
  const popup = useContext(PopupModel);
  const read = useGatewayDeployments();
  if (read.error || !read.data)
    return (
      <ReadNotice
        name="upstream models"
        error={read.error}
        retry={read.refetch}
      />
    );
  const byId = new Map(providers.map((p) => [p.id, p]));
  const upstreams: ModelUpstream[] = [];
  for (const deployment of read.data.data) {
    const provider = byId.get(deployment.provider_id);
    if (
      provider &&
      deployment.kind === "chat" &&
      model.upstreamIds.includes(deployment.upstream_model)
    )
      upstreams.push({ deployment, provider });
  }
  if (!upstreams.length)
    return (
      <Notice>
        No matching upstream model is configured on{" "}
        {providers.map((provider, i) => (
          <Fragment key={provider.id}>
            {i > 0 && ", "}
            <Link
              href={`/providers/${encodeURIComponent(provider.id)}`}
              className={linkStyle}
            >
              {provider.name}
            </Link>
          </Fragment>
        ))}
        .
      </Notice>
    );
  if (pricing)
    return <DeploymentPrices upstreams={upstreams} layout={pricing} />;
  const aliasList =
    aliasAccess?.status === "available" ? (
      <AliasList
        upstreams={upstreams}
        playgroundPrincipal={playgroundPrincipal}
        agentsAllowed={agentsAllowed}
      />
    ) : (
      <SurfaceNotice state={aliasAccess} name="gateway aliases" />
    );
  if (popup) return aliasList;
  return (
    <>
      <div className="space-y-2">
        <h3 className="text-sm font-medium">Upstream models</h3>
        <ul className="space-y-2">
          {upstreams.map(({ deployment, provider }) => (
            <li
              key={deployment.id}
              data-upstream-id={deployment.id}
              className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm"
            >
              <span className="break-all font-mono">
                {deployment.upstream_model}
              </span>
              <span className="text-muted-foreground">on</span>
              <Link
                href={`/providers/${encodeURIComponent(provider.id)}`}
                className={`${linkStyle} break-words`}
              >
                {provider.name}
              </Link>
              {!provider.enabled && (
                <span className="text-xs text-muted-foreground">
                  Provider disabled
                </span>
              )}
              {!deployment.enabled && (
                <span className="text-xs text-muted-foreground">
                  Upstream disabled
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
      <div className="space-y-2">
        <h3 className="text-sm font-medium">Gateway aliases</h3>
        {aliasList}
      </div>
    </>
  );
}

function Providers({ model, ...gates }: Gates & { model: DashboardModel }) {
  const read = useGatewayProviders();
  if (read.error || !read.data)
    return (
      <ReadNotice
        name="provider configuration"
        error={read.error}
        retry={read.refetch}
      />
    );
  const providers = read.data.data.filter((p) => p.profile === model.profile);
  if (!providers.length)
    return (
      <Notice>
        No matching provider is configured.{" "}
        <Link href="/providers" className={linkStyle}>
          View providers
        </Link>
      </Notice>
    );
  return <Upstreams model={model} providers={providers} {...gates} />;
}

function AdmittedGateway({
  model,
  playgroundPrincipal,
  pricing,
}: {
  model: DashboardModel;
  playgroundPrincipal?: string;
  pricing?: PriceLayout;
}) {
  const access = useSurfaces();
  return access?.providers?.status === "available" ? (
    <Providers
      model={model}
      pricing={pricing}
      aliasAccess={access.models}
      agentsAllowed={access.agents?.status === "available"}
      playgroundPrincipal={playgroundPrincipal}
    />
  ) : (
    <SurfaceNotice state={access?.providers} name="provider configuration" />
  );
}

function GatewayContent({
  model,
  pricing,
}: {
  model: DashboardModel;
  pricing?: PriceLayout;
}) {
  const session = useContext(ConsoleSessionContext);
  const user = session?.data;
  if (session?.isPending) {
    return <Notice>Checking access to provider configuration…</Notice>;
  }
  if (session?.error || user?.signed_in !== true || !user.id || !user.role) {
    return (
      <Notice>Access to provider configuration could not be verified.</Notice>
    );
  }
  if (user.role === "user")
    return <Notice>Your account cannot view provider configuration.</Notice>;
  return (
    <AdmittedGateway
      key={user.id + ":" + model.id}
      model={model}
      pricing={pricing}
      playgroundPrincipal={
        user.playground_access === true ? user.id : undefined
      }
    />
  );
}

export function DashboardModelPrices({
  model,
  layout,
}: {
  model: DashboardModel;
  layout: PriceLayout;
}) {
  return <GatewayContent model={model} pricing={layout} />;
}

export function DashboardModelGateway({
  model,
  mode = "detail",
}: {
  model: DashboardModel;
  mode?: "detail" | "popup";
}) {
  const heading = useId();
  const content = <GatewayContent model={model} />;
  if (mode === "popup")
    return (
      <section aria-label="Current deployment" className="min-w-0 max-w-full">
        <PopupModel.Provider value={model}>{content}</PopupModel.Provider>
      </section>
    );
  return (
    <section aria-labelledby={heading} className="space-y-4">
      <h2 id={heading} className="text-base font-semibold">
        Current deployment
      </h2>
      {content}
    </section>
  );
}
