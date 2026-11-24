"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, Bot, Check, Code2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useAgent,
  useEnvironments,
  type AgentWriteBody,
} from "@/lib/platform/queries";
import { AGENTS_CREATE_ROUTE } from "@/lib/routes";
import { ErrorState, ListSkeleton } from "./bits";
import { AgentConfigView } from "./agent-config-view";
import { EnvironmentEditor, newEnvForm } from "./environment-editor";
import { SessionCreateForm } from "./session-create-form";
import { useListFilters } from "@/lib/use-list-filters";

const stages = [
  "Create agent",
  "Configure environment",
  "Start session",
  "Integrate",
];
export function CreatedAgent({ id }: { id: string }) {
  const agent = useAgent(id);
  const envs = useEnvironments({ limit: 100 });
  const guide = useListFilters();
  const step = guide.params.get("stage");
  const stage = step !== null && /^[0-3]$/.test(step) ? Number(step) : 1;
  const setStage = (next: number) =>
    guide.update({ stage: String(next) }, "replace");
  const [panel, setPanel] = useState(false);
  const [dialog, setDialog] = useState<"environment" | "session" | null>(null);
  const environment = guide.params.get("environment") ?? "";
  const session = guide.params.get("session") ?? "";
  if (agent.error) return <ErrorState error={agent.error} />;
  if (!agent.data) return <ListSkeleton />;
  const a = agent.data;
  const config: AgentWriteBody = {
    name: a.name,
    model: a.model,
    description: a.description,
    system: a.system,
    tools: a.tools,
    mcp_servers: a.mcp_servers,
    skills: a.skills,
    multiagent: a.multiagent && {
      ...a.multiagent,
      agents: a.multiagent.agents.map((member) =>
        member.id === a.id ? { type: "self" } : member,
      ),
    },
    metadata: a.metadata,
  };
  const row = "flex items-center gap-2 rounded-lg border p-3 text-sm";
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(270px,32%)]">
      <section className="flex min-w-0 flex-col items-start gap-5">
        <Link
          href={AGENTS_CREATE_ROUTE}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground"
        >
          <ArrowLeft className="size-4" />
          Templates
        </Link>
        <h1 className="font-serif text-xl">Agent created</h1>
        <Link
          className={row + " w-full"}
          href={"/agents/" + encodeURIComponent(id)}
        >
          <Check className="size-4" />
          {a.name}
          <span className="ml-auto">v{a.version}</span>
        </Link>
        {a.archived_at ? (
          <p className="text-sm">This agent is archived.</p>
        ) : (
          <>
            <p className="text-sm">
              Your agent is ready. Configure its environment, then start a
              session.
            </p>
            {stage === 0 ? (
              <Button variant="outline" size="sm" onClick={() => setStage(1)}>
                Configure environment
              </Button>
            ) : stage === 1 ? (
              <section className="w-full rounded-xl border p-4">
                <h2 className="mb-3 text-sm font-medium">
                  Configure environment
                </h2>
                {envs.error && <ErrorState error={envs.error} />}
                <label className="block text-sm">
                  Choose an environment
                  <select
                    className="mt-1 block w-full rounded-lg border bg-background p-2"
                    value={environment}
                    onChange={(e) =>
                      guide.update(
                        { environment: e.target.value || null },
                        "replace",
                      )
                    }
                  >
                    <option value="">Select environment</option>
                    {envs.data?.data.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="mt-3 flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setDialog("environment")}
                  >
                    Create environment
                  </Button>
                  <Button
                    size="sm"
                    disabled={!environment}
                    onClick={() => setStage(2)}
                  >
                    Continue
                  </Button>
                </div>
              </section>
            ) : stage === 2 ? (
              <div className="flex items-center gap-3">
                <Button onClick={() => setDialog("session")}>
                  Start session
                </Button>
                {session && (
                  <Link
                    className="text-sm underline"
                    href={"/sessions/" + encodeURIComponent(session)}
                  >
                    Open session
                  </Link>
                )}
              </div>
            ) : (
              <section>
                <h2 className="text-sm font-medium">Integrate</h2>
                <Button variant="link" onClick={() => setPanel(true)}>
                  Export as code
                </Button>
                <Link
                  className="text-sm underline"
                  href={
                    "/deployments/new?" +
                    new URLSearchParams({
                      agent: id,
                      version: String(a.version),
                      ...(environment && { environment }),
                    })
                  }
                >
                  Create deployment
                </Link>
              </section>
            )}
          </>
        )}
      </section>
      <aside className="flex min-w-0 flex-col gap-5 border-t pt-4 lg:border-t-0 lg:border-l lg:pl-5">
        <section>
          <h2 className="text-sm font-semibold">Progress</h2>
          <ol className="mt-2 space-y-2">
            {stages.map((s, i) => (
              <li key={s}>
                <button
                  aria-current={stage === i ? "step" : undefined}
                  className="flex items-center gap-2 rounded-md text-sm hover:underline"
                  onClick={() => setStage(i)}
                >
                  <span className="grid size-5 place-items-center rounded-full bg-muted text-xs">
                    {!i || (i === 1 && environment) || (i === 2 && session) ? (
                      <Check className="size-3" />
                    ) : (
                      i + 1
                    )}
                  </span>
                  {s}
                </button>
              </li>
            ))}
          </ol>
        </section>
        <section>
          <h2 className="text-sm font-semibold">Agent</h2>
          <button
            onClick={() => setPanel(!panel)}
            className={row + " mt-2 w-full"}
          >
            <Bot className="size-4" />
            {a.name}
            <span className="ml-auto">v{a.version}</span>
          </button>
        </section>
        <section>
          <h2 className="text-sm font-semibold">Resources</h2>
          {!environment && !session ? (
            <p className="mt-1 text-[13px] text-muted-foreground">
              Track the environment and session as they’re configured.
            </p>
          ) : (
            <div className="flex flex-col gap-1 text-sm">
              {environment && (
                <Link
                  className="underline"
                  href={"/environments/" + encodeURIComponent(environment)}
                >
                  {envs.data?.data.find((e) => e.id === environment)?.name ??
                    environment}
                </Link>
              )}
              {session && (
                <Link
                  className="underline"
                  href={"/sessions/" + encodeURIComponent(session)}
                >
                  Open session
                </Link>
              )}
            </div>
          )}
        </section>
        <Button variant="outline" onClick={() => setPanel(!panel)}>
          <Code2 />
          Export as code
        </Button>
      </aside>
      {panel && (
        <div className="min-w-0 lg:col-span-2">
          <AgentConfigView config={config} />
        </div>
      )}
      <Dialog
        open={!!dialog}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
      >
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-[720px]">
          <DialogTitle>
            {dialog === "environment" ? "Create environment" : "Start session"}
          </DialogTitle>
          <DialogDescription>
            Set up an instance of this agent in its environment.
          </DialogDescription>
          {dialog === "environment" ? (
            <EnvironmentEditor
              mode="create"
              initial={newEnvForm()}
              onDone={(env) => {
                setDialog(null);
                if (env) {
                  guide.update({ environment: env.id, stage: "2" }, "replace");
                }
              }}
            />
          ) : dialog === "session" ? (
            <SessionCreateForm
              initialAgent={a}
              initialEnvironmentId={environment}
              onCancel={() => setDialog(null)}
              onCreated={(s) => {
                setDialog(null);
                guide.update(
                  { environment: s.environment_id, session: s.id, stage: "3" },
                  "replace",
                );
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
