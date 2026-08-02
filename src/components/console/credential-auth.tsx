import { Badge } from "@/components/ui/badge";
import { Time } from "@/components/console/bits";
import type { CredentialAuth } from "@/lib/platform/types";

/**
 * Secret-free auth summary. The wire never carries secret material
 * (write-only on the platform), so everything here is safe to render.
 */
export function CredentialAuthSummary({ auth }: { auth: CredentialAuth }) {
  switch (auth.type) {
    case "mcp_oauth":
      return (
        <div className="space-y-0.5 text-[13px]">
          <div className="font-mono">{auth.mcp_server_url}</div>
          <div className="text-muted-foreground">
            {auth.refresh ? "auto-refresh" : "no refresh"} · expires{" "}
            {auth.expires_at ? <Time iso={auth.expires_at} /> : "never"}
          </div>
        </div>
      );
    case "static_bearer":
      return <div className="font-mono text-[13px]">{auth.mcp_server_url}</div>;
    case "environment_variable":
      return (
        <div className="space-y-0.5 text-[13px]">
          <div className="font-mono">{auth.secret_name}</div>
          <div className="text-muted-foreground">
            {auth.networking.type === "unrestricted"
              ? "any host"
              : auth.networking.allowed_hosts.join(", ")}
            {" · "}
            {[
              auth.injection_location.header && "header",
              auth.injection_location.body && "body",
            ]
              .filter(Boolean)
              .join(" + ")}
          </div>
        </div>
      );
  }
}

export function AuthTypeBadge({ auth }: { auth: CredentialAuth }) {
  return (
    <Badge variant="outline" className="font-mono text-[11px] font-normal">
      {auth.type}
    </Badge>
  );
}
