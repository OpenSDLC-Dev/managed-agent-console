import { Badge } from "@/components/ui/badge";
import type {
  GatewayAlias,
  GatewayDeployment,
  GatewayProvider,
} from "@/lib/platform/types";

/**
 * How a model routes, as the gateway reads its targets (catalog/route.go Plan
 * in the platform): the lowest priority is tried first, and a tier is used only when
 * every target above it fails before answering. Inside a tier, traffic splits
 * by weight. The console groups and shares; it never reorders.
 *
 * A share is the target's part of its tier's weight, as configured. The
 * router skips a target that cannot serve a request (disabled, or with no key
 * allowed on its protocol), and the console does not recompute that: the
 * inspector marks a disabled target, and the hint names the rule.
 */

export interface TierTarget {
  deployment_id: string;
  weight: number;
  share: number;
}

export interface Tier {
  priority: number;
  targets: TierTarget[];
}

export function tiers(targets: GatewayAlias["targets"]): Tier[] {
  const priorities = [...new Set(targets.map((t) => t.priority))].sort(
    (a, b) => a - b,
  );
  return priorities.map((priority) => {
    const inTier = targets.filter((t) => t.priority === priority);
    const total = inTier.reduce((n, t) => n + t.weight, 0);
    return {
      priority,
      targets: inTier.map((t) => ({
        deployment_id: t.deployment_id,
        weight: t.weight,
        share: total > 0 ? t.weight / total : 0,
      })),
    };
  });
}

/** "Primary", then "Fallback 1", "Fallback 2"… by position, not by number. */
export const tierLabel = (index: number) =>
  index === 0 ? "Primary" : `Fallback ${index}`;

/** A share as a whole percent: "75%". */
export const percent = (share: number) => `${Math.round(share * 100)}%`;

/** Names a target by its upstream model, or by id if it is gone. */
function modelOf(id: string, deployments: GatewayDeployment[] | undefined) {
  return deployments?.find((d) => d.id === id)?.upstream_model ?? id;
}

/**
 * "MiniMax-M3 75% · deepseek-v4-pro 25%", then a "then …" line per fallback
 * tier. A tier of one target shows no share: it takes all of that tier.
 */
export function RoutesTo({
  alias,
  deployments,
}: {
  alias: GatewayAlias;
  deployments: GatewayDeployment[] | undefined;
}) {
  return (
    <span className="grid text-[13px]" data-tiers={tiers(alias.targets).length}>
      {tiers(alias.targets).map((tier, i) => (
        <span key={tier.priority}>
          {i > 0 && <span className="text-muted-foreground">then </span>}
          {tier.targets.map((t, j) => (
            <span key={t.deployment_id}>
              {j > 0 && " · "}
              <span className="font-mono">
                {modelOf(t.deployment_id, deployments)}
              </span>
              {tier.targets.length > 1 && (
                <span className="text-muted-foreground" data-share={t.share}>
                  {" "}
                  {percent(t.share)}
                </span>
              )}
            </span>
          ))}
        </span>
      ))}
    </span>
  );
}

/** The inspector's routing: one box per tier, a bar per target's share. */
export function RoutingTiers({
  alias,
  deployments,
  providers,
}: {
  alias: GatewayAlias;
  deployments: GatewayDeployment[] | undefined;
  providers: GatewayProvider[] | undefined;
}) {
  return (
    <div className="grid gap-2">
      {tiers(alias.targets).map((tier, i) => (
        <div
          key={tier.priority}
          className="rounded-lg border px-3 py-2"
          data-priority={tier.priority}
        >
          <div className="flex items-baseline justify-between pb-1.5">
            <span className="text-sm font-medium">{tierLabel(i)}</span>
            <span className="text-[13px] text-muted-foreground">
              priority {tier.priority}
            </span>
          </div>
          {tier.targets.map((t) => {
            const deployment = deployments?.find(
              (d) => d.id === t.deployment_id,
            );
            const provider = providers?.find(
              (p) => p.id === deployment?.provider_id,
            );
            return (
              <div
                key={t.deployment_id}
                className="grid grid-cols-[minmax(0,1fr)_54px] items-center gap-2 py-1"
              >
                <div className="min-w-0">
                  <span className="font-mono text-[13px]">
                    {deployment?.upstream_model ?? t.deployment_id}
                  </span>
                  {provider && (
                    <span className="text-[13px] text-muted-foreground">
                      {" "}
                      on {provider.name}
                    </span>
                  )}
                  {deployment && !deployment.enabled && (
                    <Badge
                      variant="outline"
                      className="ml-2 font-normal text-muted-foreground"
                    >
                      disabled
                    </Badge>
                  )}
                  <div className="mt-1 h-1 overflow-hidden rounded bg-secondary">
                    <div
                      className="h-full bg-foreground/60"
                      style={{ width: percent(t.share) }}
                    />
                  </div>
                </div>
                <span
                  className="text-right text-[13px] tabular-nums"
                  data-share={t.share}
                >
                  {percent(t.share)}
                </span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
