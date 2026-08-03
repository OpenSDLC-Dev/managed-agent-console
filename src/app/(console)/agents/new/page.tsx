"use client";

import { useState } from "react";
import { PageHeader } from "@/components/shell/page-header";
import {
  AgentEditor,
  formFromConfig,
  newAgentForm,
} from "@/components/console/agent-editor";
import { AGENT_TEMPLATES } from "@/lib/agent-config/templates";
import { cn } from "@/lib/utils";

export default function NewAgentPage() {
  const [template, setTemplate] = useState("blank");
  const chosen = AGENT_TEMPLATES.find((t) => t.key === template);

  return (
    <div>
      <PageHeader
        title="Create agent"
        subtitle="Configure a new autonomous agent."
      />
      <div className="flex flex-wrap gap-2 pb-6">
        {[
          {
            key: "blank",
            title: "Blank",
            description: "All tools enabled, nothing prefilled.",
          },
          ...AGENT_TEMPLATES,
        ].map((t) => (
          <button
            key={t.key}
            aria-pressed={template === t.key}
            onClick={() => setTemplate(t.key)}
            className={cn(
              "w-56 rounded-lg border p-3 text-left hover:bg-secondary/40",
              template === t.key && "border-foreground",
            )}
          >
            <span className="block text-sm font-medium">{t.title}</span>
            <span className="block pt-0.5 text-[13px] text-muted-foreground">
              {t.description}
            </span>
          </button>
        ))}
      </div>
      {/* Remount on template change: the editor owns its form state. */}
      <AgentEditor
        key={template}
        mode="create"
        initial={chosen ? formFromConfig(chosen.config) : newAgentForm()}
      />
    </div>
  );
}
