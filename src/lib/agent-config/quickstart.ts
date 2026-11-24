import type { AgentWriteBody } from "@/lib/platform/queries";
import { toRaw } from "./raw";

const servers = {
  notion: "https://mcp.notion.com/mcp",
  slack: "https://mcp.slack.com/mcp",
  sentry: "https://mcp.sentry.dev/mcp",
  linear: "https://mcp.linear.app/mcp",
  github: "https://api.githubcopilot.com/mcp/",
  box: "https://mcp.box.com",
  asana: "https://mcp.asana.com/v2/mcp",
  intercom: "https://mcp.intercom.com/mcp",
  atlassian: "https://mcp.atlassian.com/v2/mcp",
  amplitude: "https://mcp.amplitude.com/mcp",
} as const;
type Connector = keyof typeof servers;
export interface Starter {
  key: string;
  title: string;
  description: string;
  instructions: string;
  servers?: Connector[];
  badge?: "Outcome-optimizing" | "Recurring" | "Dynamic workflow";
  note?: string;
  schedule?: string;
  skill?: string;
}
export const starters: Starter[] = [
  {
    key: "deep-researcher",
    title: "Deep researcher",
    description:
      "Conducts multi-step web research with source synthesis and citations.",
    instructions:
      "Investigate the question using available sources. Cross-check claims, cite the original sources and identify uncertainties.",
    badge: "Outcome-optimizing",
    note: "Define an outcome when starting a session to grade the research.",
  },
  {
    key: "structured-extractor",
    title: "Structured extractor",
    description: "Parses unstructured text into a typed JSON schema.",
    instructions:
      "Extract fields from the supplied text according to the requested schema. Return valid JSON and represent missing information explicitly.",
  },
  {
    key: "field-monitor",
    title: "Field monitor",
    description:
      "Scans software blogs for a topic and writes a weekly what-changed brief.",
    instructions:
      "Compare the supplied software feeds to the previous brief, cite significant changes and summarize what readers should follow up on.",
    servers: ["notion"],
    badge: "Recurring",
    schedule: "Weekly",
  },
  {
    key: "support-agent",
    title: "Support agent",
    description:
      "Answers customer questions from your docs and knowledge base, and escalates when needed.",
    instructions:
      "Find the answer in the connected knowledge base, cite it and suggest escalation when the documentation is inconclusive.",
    servers: ["notion", "slack"],
  },
  {
    key: "incident-commander",
    title: "Incident commander",
    description:
      "Triages a Sentry alert, opens a Linear incident ticket, and coordinates the Slack response.",
    instructions:
      "Read the alert and relevant change history. Group the evidence, draft the incident timeline and coordinate the response with the incident owner.",
    servers: ["sentry", "linear", "slack", "github"],
  },
  {
    key: "contract-tracker",
    title: "Contract tracker",
    description:
      "Extracts clauses, deadlines, and obligations from a Box document and tracks them in Asana.",
    instructions:
      "Read the selected contract, cite each obligation and its deadline, and prepare tasks for the assigned owners.",
    servers: ["box", "asana"],
  },
  {
    key: "sprint-retro-facilitator",
    title: "Sprint retro facilitator",
    description:
      "Pulls a closed sprint from Linear, synthesizes themes, and writes the retro doc before the meeting.",
    instructions:
      "Summarize the completed sprint, cite the issues behind recurring themes and draft the retrospective with owners for follow-up items.",
    servers: ["linear", "slack"],
    badge: "Recurring",
    schedule: "Monthly on days 1 and 15",
    skill: "docx",
    note: "Attach a document-writing skill from this workspace if available.",
  },
  {
    key: "support-to-eng-escalator",
    title: "Support-to-eng escalator",
    description:
      "Reads an Intercom conversation and drafts a linked Jira issue with reproduction steps.",
    instructions:
      "Review the support conversation. Document the observed behavior, expected behavior and a minimal reproduction for the engineering owner.",
    servers: ["intercom", "atlassian", "slack"],
  },
  {
    key: "data-analyst",
    title: "Data analyst",
    description:
      "Loads, explores, and visualizes data; builds reports and answers questions from datasets.",
    instructions:
      "Inspect the supplied dataset, describe its columns and quality, and answer the question using reproducible analysis. Save the supporting table or chart.",
    servers: ["amplitude"],
  },
  {
    key: "bug-hunter",
    title: "Bug hunter",
    description:
      "Reviews a codebase and reports the functional bugs it can confirm.",
    instructions:
      "Review the supplied project's behavior and regression tests. Verify functional defects with existing unit tests and document their impact and expected behavior.",
    badge: "Dynamic workflow",
  },
  {
    key: "stock-watchlist-scanner",
    title: "Stock watchlist scanner",
    description: "Reports what changed for each stock since the last close.",
    instructions:
      "Summarize the supplied watchlist and price changes since the previous close. Cite the timestamp and source for each observation.",
    badge: "Dynamic workflow",
  },
  {
    key: "video-explainer-maker",
    title: "Video explainer maker",
    description: "Turns a topic into a short captioned video with music.",
    instructions:
      "Prepare an evidence-based storyboard, concise narration and captions. Assemble the requested clip using the media and tools available in the session.",
    badge: "Dynamic workflow",
  },
];

export function starterConfig(
  model: string,
  starter?: Starter,
): AgentWriteBody {
  return {
    name: starter?.title ?? "Untitled agent",
    description: starter?.description ?? "",
    model: { id: model },
    system: starter?.instructions ?? "",
    tools: [
      { type: "agent_toolset_20260401" },
      ...(starter?.servers ?? []).map((name) => ({
        type: "mcp_toolset",
        mcp_server_name: name,
      })),
    ],
    ...(starter?.servers?.length && {
      mcp_servers: starter.servers.map((name) => ({
        type: "url",
        name,
        url: servers[name],
      })),
    }),
    ...(starter && { metadata: { template: starter.key } }),
  };
}
export const configFormats = ["YAML", "TypeScript", "Python", "cURL"] as const;
export type ConfigFormat = (typeof configFormats)[number];
export function configExample(config: AgentWriteBody, format: ConfigFormat) {
  const json = JSON.stringify(config, null, 2);
  switch (format) {
    case "YAML":
      return toRaw(config, "yaml");
    case "TypeScript":
      return [
        'const response = await fetch(process.env.PLATFORM_URL + "/v1/agents", {',
        '  method: "POST",',
        '  headers: { "content-type": "application/json", "x-api-key": process.env.PLATFORM_API_KEY! },',
        "  body: JSON.stringify(" + json + "),",
        "});",
        "if (!response.ok) throw new Error(await response.text());",
        "console.log(await response.json());",
      ].join("\n");
    case "Python":
      return [
        "import json, os, requests",
        "",
        "config = json.loads(" + JSON.stringify(json) + ")",
        'response = requests.post(os.environ["PLATFORM_URL"] + "/v1/agents",',
        '    headers={"x-api-key": os.environ["PLATFORM_API_KEY"]}, json=config)',
        "response.raise_for_status()",
        "print(response.json())",
      ].join("\n");
    case "cURL":
      return [
        'curl --fail-with-body "$PLATFORM_URL/v1/agents"',
        '  -H "x-api-key: $PLATFORM_API_KEY"',
        '  -H "content-type: application/json"',
        "  --data-binary '" + json.replaceAll("'", "'\"'\"'") + "'",
      ].join(" \\\n");
  }
}
