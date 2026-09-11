import type { ReactNode } from "react";
import type { Environment } from "@/lib/platform/types";
import { EnvironmentSection } from "./environment-section";
import { EnvironmentKeysSection } from "./environment-keys";

function ReadField({
  label,
  children,
}: {
  label?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      {label && <p className="text-sm">{label}</p>}
      <div className="min-h-9 whitespace-pre-wrap break-words rounded-md border px-3 py-2 text-sm">
        {children}
      </div>
    </div>
  );
}
function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="inline-block rounded bg-muted px-2 py-0.5 text-xs">
      {children}
    </span>
  );
}

export function EnvironmentFullView({
  environment,
}: {
  environment: Environment;
}) {
  const config = environment.config;
  const packages =
    config.type === "cloud"
      ? (["apt", "cargo", "gem", "go", "npm", "pip"] as const).filter(
          (manager) => config.packages[manager].length,
        )
      : [];
  return (
    <>
      <EnvironmentSection title="General">
        <ReadField label="Name">{environment.name}</ReadField>
        <ReadField label="Description">
          {environment.description || (
            <span className="text-muted-foreground">No description</span>
          )}
        </ReadField>
      </EnvironmentSection>
      {config.type === "cloud" && (
        <>
          <EnvironmentSection
            title="Networking"
            hint="Configure network access policies for this environment."
          >
            <div className="space-y-1.5">
              <p className="text-sm">Type</p>
              <Tag>
                {config.networking.type === "limited"
                  ? "Limited"
                  : "Unrestricted"}
              </Tag>
            </div>
            {config.networking.type === "limited" && (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <p className="text-sm">Allow MCP server network access</p>
                    <Tag>
                      {config.networking.allow_mcp_servers
                        ? "Enabled"
                        : "Disabled"}
                    </Tag>
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-sm">
                      Allow package manager network access
                    </p>
                    <Tag>
                      {config.networking.allow_package_managers
                        ? "Enabled"
                        : "Disabled"}
                    </Tag>
                  </div>
                </div>
                <ReadField label="Allowed hosts">
                  {config.networking.allowed_hosts.length ? (
                    config.networking.allowed_hosts.join(", ")
                  ) : (
                    <span className="text-muted-foreground">None provided</span>
                  )}
                </ReadField>
              </>
            )}
          </EnvironmentSection>
          <EnvironmentSection
            title="Packages"
            hint="Packages and versions available in this environment."
          >
            {packages.length ? (
              packages.map((manager) => (
                <ReadField key={manager} label={manager}>
                  {config.packages[manager].join("\n")}
                </ReadField>
              ))
            ) : (
              <ReadField>
                <span className="text-muted-foreground">
                  No packages configured
                </span>
              </ReadField>
            )}
          </EnvironmentSection>
        </>
      )}
      <EnvironmentSection
        title="Metadata"
        hint="Custom key-value pairs to tag and organize this environment."
      >
        {Object.keys(environment.metadata).length ? (
          Object.entries(environment.metadata).map(([key, value]) => (
            <ReadField key={key} label={key}>
              {value}
            </ReadField>
          ))
        ) : (
          <ReadField>
            <span className="text-muted-foreground">No metadata</span>
          </ReadField>
        )}
      </EnvironmentSection>
      <EnvironmentKeysSection environment={environment} />
    </>
  );
}
