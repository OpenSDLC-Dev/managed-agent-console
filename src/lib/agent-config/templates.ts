/**
 * Starter templates for /agents/new (plan 03 slice 4): static wire-shaped
 * configs that seed the editor form through the same parse path a fetched
 * agent uses. Deliberately few and opinionated — a starting point, not a
 * gallery.
 */

export interface AgentTemplate {
  key: string;
  title: string;
  description: string;
  config: Record<string, unknown>;
}

export const AGENT_TEMPLATES: AgentTemplate[] = [
  {
    key: "code-runner",
    title: "Code task runner",
    description: "Full workspace access; bash gated behind approval.",
    config: {
      name: "Code task runner",
      model: { id: "claude-sonnet-4-8" },
      description: "Runs scoped engineering tasks in its environment.",
      system:
        "You are a careful engineer. Work inside the workspace, run the tests before declaring success, and prefer minimal diffs.",
      tools: [
        {
          type: "agent_toolset_20260401",
          configs: [
            { name: "bash", permission_policy: { type: "always_ask" } },
          ],
        },
      ],
      mcp_servers: [],
      skills: [],
    },
  },
  {
    key: "researcher",
    title: "Web researcher",
    description: "Reads the workspace and the web; cannot change files.",
    config: {
      name: "Web researcher",
      model: { id: "claude-sonnet-4-8" },
      description: "Gathers sources and reports findings in its messages.",
      system:
        "You are a thorough researcher. Cite the sources you fetched and keep facts separate from inference.",
      tools: [
        {
          type: "agent_toolset_20260401",
          configs: [
            { name: "bash", enabled: false },
            { name: "write", enabled: false },
            { name: "edit", enabled: false },
          ],
        },
      ],
      mcp_servers: [],
      skills: [],
    },
  },
];
