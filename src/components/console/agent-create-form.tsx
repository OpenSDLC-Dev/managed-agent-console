"use client";

import { useState } from "react";
import {
  AgentEditor,
  formFromConfig,
  newAgentForm,
} from "@/components/console/agent-editor";
import { AGENT_TEMPLATES } from "@/lib/agent-config/templates";
import { cn } from "@/lib/utils";

export function AgentCreateForm({ onCancel }: { onCancel?: () => void }) {
  const [template, setTemplate] = useState("blank");
  const chosen = AGENT_TEMPLATES.find((t) => t.key === template);

  return (
    <div>
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
            type="button"
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
      <AgentEditor
        key={template}
        mode="create"
        initial={chosen ? formFromConfig(chosen.config) : newAgentForm()}
        onCancel={onCancel}
      />
    </div>
  );
}
