import type { GatewayDeployment, GatewayProvider } from "@/lib/platform/types";
import { cn } from "@/lib/utils";

export type ModelUpstream = {
  provider: GatewayProvider;
  deployment: GatewayDeployment;
};

export type PriceLayout = "popup" | "comparison" | "detail";
type PriceKind = keyof GatewayDeployment["prices"];

const regularRates = [
  ["input", "Input"],
  ["output", "Output"],
] as const;
const cacheRates = [
  ["cache_write", "Cache write"],
  ["cache_read", "Cache read"],
] as const;

const number = new Intl.NumberFormat("en-US", { maximumSignificantDigits: 17 });

function Rates({
  labels,
  prices,
  compact,
}: {
  labels: ReadonlyArray<readonly [PriceKind, string]>;
  prices: GatewayDeployment["prices"];
  compact: boolean;
}) {
  return (
    <dl className="text-muted-foreground">
      {labels.map(([kind, label]) => {
        const value = prices[kind];
        return (
          <div
            key={kind}
            className={cn(
              "flex items-baseline justify-between gap-2",
              compact ? "py-1 text-xs" : "border-t py-2.5 text-sm",
            )}
          >
            <dt>{label}</dt>
            <dd
              data-price-kind={kind}
              data-price={value ?? ""}
              className="break-all text-right tabular-nums"
            >
              {value === null ? "Not set" : number.format(value)}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

export function DeploymentPrices({
  upstreams,
  layout,
}: {
  upstreams: ModelUpstream[];
  layout: PriceLayout;
}) {
  return (
    <div className="space-y-5">
      {upstreams.map(({ deployment, provider }) => (
        <div
          key={deployment.id}
          data-pricing-deployment={deployment.id}
          data-price-currency={deployment.price_currency ?? ""}
        >
          {upstreams.length > 1 && (
            <p className="mb-1 break-words text-sm font-medium">
              {provider.name} · {deployment.upstream_model}
              <code className="block break-all text-xs font-normal text-muted-foreground">
                {deployment.id}
              </code>
            </p>
          )}
          {(!provider.enabled || !deployment.enabled) && (
            <p className="text-xs text-muted-foreground">Disabled</p>
          )}
          <p className="mb-2 text-xs text-muted-foreground">
            {deployment.price_currency
              ? `${deployment.price_currency} per million tokens`
              : "Per million tokens · Currency not specified"}
          </p>
          <Rates
            labels={regularRates}
            prices={deployment.prices}
            compact={false}
          />
          {layout === "popup" && (
            <h4 className="mb-1 border-t pt-3.5 text-sm font-normal text-muted-foreground">
              Prompt caching
            </h4>
          )}
          <Rates
            labels={cacheRates}
            prices={deployment.prices}
            compact={layout === "popup"}
          />
          {deployment.price_note && (
            <p className="mt-3 whitespace-pre-line break-words text-xs leading-5 text-muted-foreground">
              {deployment.price_note}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
