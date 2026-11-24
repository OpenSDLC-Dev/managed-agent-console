import { starterConfig, starters, type Starter } from "./quickstart";

const manualKeys = new Set([
  "deep-researcher",
  "structured-extractor",
  "field-monitor",
  "support-agent",
  "incident-commander",
]);
export const manualStarters = starters.filter((starter) =>
  manualKeys.has(starter.key),
);

/** The directory offers a smaller set of configurations than guided Create. */
export function manualStarterConfig(model: string, starter?: Starter) {
  const base = starterConfig(model, starter);
  const offline = [
    "structured-extractor",
    "support-agent",
    "incident-commander",
  ].includes(starter?.key ?? "");
  const tools = [
    {
      type: "agent_toolset_20260401",
      ...(offline && {
        configs: ["web_search", "web_fetch"].map((name) => ({
          name,
          enabled: false,
        })),
      }),
    },
    ...(starter?.servers ?? [])
      .filter(
        (name) =>
          starter?.key !== "incident-commander" ||
          name === "sentry" ||
          name === "linear",
      )
      .map((name) => ({ type: "mcp_toolset", mcp_server_name: name })),
  ];
  return {
    ...base,
    model: { id: model, effort: "low" },
    tools,
    description:
      starter?.description ?? "A blank starting point with the core toolset.",
    system:
      starter?.instructions ??
      "Help the user complete their task using the available workspace, tools and sources. Check your work and explain the result.",
  };
}
