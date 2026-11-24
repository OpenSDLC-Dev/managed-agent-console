"use client";

import { AgentEditorFields, formFromConfig } from "./agent-editor";
import { useModelChoices } from "./model-field";
import { manualStarterConfig } from "@/lib/agent-config/templates";

export function AgentCreateForm({ initialModel }: { initialModel?: string }) {
  const models = useModelChoices();
  if (models.pending)
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Loading agent configuration…
      </p>
    );
  const preferred = models.names?.includes("deepseek-flash")
    ? "deepseek-flash"
    : models.names?.[0];
  return (
    <AgentEditorFields
      models={models}
      mode="create"
      creationPage
      initial={formFromConfig(
        manualStarterConfig(initialModel ?? preferred ?? ""),
      )}
    />
  );
}
