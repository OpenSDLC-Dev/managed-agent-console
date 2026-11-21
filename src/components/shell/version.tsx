export function BuildVersions({
  platformVersion,
  consoleVersion,
}: {
  platformVersion?: string;
  consoleVersion: string;
}) {
  const stamp = platformVersion?.trim();
  const platform =
    stamp && /^\d+\.\d+\.\d+(?:[-+].+)?$/.test(stamp) ? `v${stamp}` : stamp;
  return (
    <div className="space-y-1 text-xs wrap-anywhere text-muted-foreground">
      <div data-platform-version={stamp ?? ""}>
        Platform {platform || "version unavailable"}
      </div>
      <div data-console-version={consoleVersion}>
        Console {consoleVersion || "version unavailable"}
      </div>
    </div>
  );
}
