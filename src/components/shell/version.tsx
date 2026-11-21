import pkg from "../../../package.json";

/** The deployment supplies the Platform build stamp; the Console release comes from its package. */
export function BuildVersions() {
  const stamp = process.env.PLATFORM_VERSION?.trim();
  const platform = stamp && /^\d/.test(stamp) ? `v${stamp}` : stamp;
  return (
    <div className="space-y-1 text-xs wrap-anywhere text-muted-foreground">
      <div data-platform-version={stamp ?? ""}>
        Platform {platform || "version unavailable"}
      </div>
      <div data-console-version={pkg.version}>Console v{pkg.version}</div>
    </div>
  );
}
