"use client";

import Link from "next/link";
import { Fragment, useContext, useId, type ReactNode } from "react";
import { ConsoleSessionContext } from "@/components/shell/console-session";
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
import type { GatewayDeployment, GatewayProvider } from "@/lib/platform/types";
import type { DashboardModel } from "./dashboard-model-catalog";

const linkStyle =
  "rounded-sm underline decoration-muted-foreground/50 underline-offset-4 hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-ring";

function Notice({ children }: { children: ReactNode }) {
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

function ReadNotice({
  error,
  name,
  retry,
}: {
  error: unknown;
  name: string;
  retry: () => void;
}) {
  if (!error) return <Notice>Loading {name}…</Notice>;
  if (
    isPermissionDenied(error) ||
    (error instanceof PlatformError && error.status === 401)
  )
    return <Notice>Your account cannot view {name}.</Notice>;
  if (isUnimplemented(error))
    return <Notice>This Platform does not expose {name}.</Notice>;
  return (
    <Notice>
      Could not load {name}.{" "}
      <button type="button" className={linkStyle} onClick={() => retry()}>
        Retry
      </button>
    </Notice>
  );
}

type Gates = { aliasAccess?: SurfaceState; playgroundPrincipal?: string };
type Upstream = { deployment: GatewayDeployment; provider: GatewayProvider };

function AliasList({
  upstreams,
  playgroundPrincipal,
}: {
  upstreams: Upstream[];
  playgroundPrincipal?: string;
}) {
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
  return (
    <>
      <ul className="divide-y">
        {aliases.map((alias) => {
          const modelQuery = new URLSearchParams({
            model: alias.name,
          }).toString();
          const mixed = alias.targets.some((t) => !ids.has(t.deployment_id));
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
                {mixed && (
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
                  href={`/playground?${modelQuery}`}
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
}: Gates & {
  model: DashboardModel;
  providers: GatewayProvider[];
}) {
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
  const upstreams: Upstream[] = [];
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
        {aliasAccess?.status === "available" ? (
          <AliasList
            upstreams={upstreams}
            playgroundPrincipal={playgroundPrincipal}
          />
        ) : (
          <SurfaceNotice state={aliasAccess} name="gateway aliases" />
        )}
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
}: {
  model: DashboardModel;
  playgroundPrincipal?: string;
}) {
  const access = useSurfaces();
  return access?.providers?.status === "available" ? (
    <Providers
      model={model}
      aliasAccess={access.models}
      playgroundPrincipal={playgroundPrincipal}
    />
  ) : (
    <SurfaceNotice state={access?.providers} name="provider configuration" />
  );
}

export function DashboardModelGateway({ model }: { model: DashboardModel }) {
  const heading = useId();
  const session = useContext(ConsoleSessionContext);
  const user = session?.data;
  let content: ReactNode;
  if (session?.isPending) {
    content = <Notice>Checking access to provider configuration…</Notice>;
  } else if (
    session?.error ||
    user?.signed_in !== true ||
    !user.id ||
    !user.role
  ) {
    content = (
      <Notice>Access to provider configuration could not be verified.</Notice>
    );
  } else if (user.role === "user") {
    content = <Notice>Your account cannot view provider configuration.</Notice>;
  } else {
    content = (
      <AdmittedGateway
        key={user.id}
        model={model}
        playgroundPrincipal={
          user.playground_access === true ? user.id : undefined
        }
      />
    );
  }
  return (
    <section aria-labelledby={heading} className="space-y-4">
      <h2 id={heading} className="text-base font-semibold">
        Current deployment
      </h2>
      {content}
    </section>
  );
}
