import { Badge } from "@/components/ui/badge";
import { WARNING_BOX } from "@/components/console/bits";
import { cn } from "@/lib/utils";
import type {
  GatewayProfile,
  GatewayProtocol,
  GatewayProvider,
} from "@/lib/platform/types";

/**
 * Presentation shared by the model gateway's screens (plan 10). Wire names
 * stay in the data; these are the words an operator reads.
 */

export const PROTOCOL_LABEL: Record<GatewayProtocol, string> = {
  anthropic: "Anthropic Messages",
  openai: "OpenAI-compatible",
  gemini: "Gemini API",
};

export const REGION_LABEL = { cn: "China", international: "International" };

/** The wire name, in a chip: the protocols are what an operator matches against vendor docs. */
export function ProtocolBadge({ protocol }: { protocol: GatewayProtocol }) {
  return (
    <Badge
      variant="outline"
      className="font-mono text-[12px] font-normal"
      title={PROTOCOL_LABEL[protocol]}
    >
      {protocol}
    </Badge>
  );
}

/**
 * Plain `http` sends the vendor key unencrypted. The gateway allows it, for an
 * in-cluster model server (`validate.go` checkEndpoint), and the console marks it.
 * The gateway stores an endpoint as typed, and a scheme is case-insensitive,
 * so `HTTP://` is plain HTTP too.
 */
export const isPlainHttp = (url: string) => /^http:\/\//i.test(url);

export function PlainHttpBadge() {
  return (
    <Badge variant="outline" className={cn("font-normal", WARNING_BOX)}>
      plain HTTP
    </Badge>
  );
}

const ENABLED_STYLE =
  "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/50";

export function EnabledBadge({ enabled }: { enabled: boolean }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "font-normal",
        enabled
          ? ENABLED_STYLE
          : "border-transparent bg-secondary text-secondary-foreground",
      )}
      data-enabled={enabled}
    >
      {enabled ? "enabled" : "disabled"}
    </Badge>
  );
}

/** The provider's endpoints in protocol order: the profile's, then any other. */
export function endpointEntries(provider: GatewayProvider) {
  return (Object.keys(PROTOCOL_LABEL) as GatewayProtocol[]).flatMap(
    (protocol) => {
      const url = provider.endpoints[protocol];
      return url ? [{ protocol, url }] : [];
    },
  );
}

/**
 * Which of a regional vendor's sites a provider calls, read off the endpoints
 * it was created with. Undefined for a single-site vendor, for any endpoint the
 * profile does not publish, and for endpoints on both sites.
 */
export function providerRegion(
  provider: GatewayProvider,
  profile: GatewayProfile | undefined,
): keyof typeof REGION_LABEL | undefined {
  // Every endpoint must be one the site publishes: a custom URL beside a
  // published one says nothing about which site that URL reaches.
  const regions = Object.values(provider.endpoints).map(
    (url) => profile?.hosts.find((h) => h.region && h.base_url === url)?.region,
  );
  const [first] = regions;
  return first && regions.every((r) => r === first) ? first : undefined;
}

/** "MiniMax · China": the vendor's name, and its site when it has two. */
export function vendorLabel(
  provider: GatewayProvider,
  profiles: GatewayProfile[] | undefined,
): string {
  const profile = profiles?.find((p) => p.name === provider.profile);
  if (!profile) return provider.profile;
  const region = providerRegion(provider, profile);
  return region
    ? `${profile.display_name} · ${REGION_LABEL[region]}`
    : profile.display_name;
}
