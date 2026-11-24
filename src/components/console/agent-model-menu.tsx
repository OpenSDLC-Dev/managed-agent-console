"use client";

import { useId } from "react";
import { Popover } from "@base-ui/react/popover";
import { Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type ModelChoices } from "./model-field";
import { effortLevels, type ModelEffort } from "@/lib/platform/schemas";

export function AgentModelMenu({
  model,
  effort,
  speed,
  choices,
  error,
  onModel,
  onEffort,
  onSpeed,
}: {
  model: string;
  effort: ModelEffort | "";
  speed: "" | "standard" | "fast";
  choices: ModelChoices;
  error?: string;
  onModel: (model: string) => void;
  onEffort: (effort: ModelEffort | "") => void;
  onSpeed: (speed: "" | "fast") => void;
}) {
  const id = useId();
  const selected = !choices.names || choices.names.includes(model) ? model : "";
  return (
    <>
      <Popover.Root>
        <Popover.Trigger
          render={<Button type="button" variant="outline" size="sm" />}
          id="agent-model"
          aria-label="Model"
          data-model={selected}
          data-effort={effort}
          data-speed={speed}
          aria-invalid={!!error}
          aria-describedby={error ? "agent-model-error" : undefined}
          className="flex w-full max-w-80 justify-start gap-2"
        >
          <span className="min-w-0 flex-1 truncate text-left">
            {selected || "Choose a model"}
          </span>
          {speed === "fast" && (
            <span className="text-muted-foreground">Fast</span>
          )}
          {effort && (
            <span className="text-muted-foreground">
              <span className="capitalize">{effort}</span> effort
            </span>
          )}
          <ChevronDown aria-hidden className="size-3.5" />
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner sideOffset={4} align="start" className="z-50">
            <Popover.Popup
              aria-label="Model settings"
              className="max-h-[var(--available-height)] w-[min(20rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border bg-popover p-1 text-sm shadow-md"
            >
              {choices.names ? (
                <div role="radiogroup" aria-label="Models">
                  {choices.names.map((name) => (
                    <label
                      key={name}
                      className="relative flex cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-secondary has-focus-visible:outline-2"
                    >
                      <input
                        className="absolute inset-0 size-full cursor-pointer opacity-0"
                        type="radio"
                        name={id}
                        checked={name === selected}
                        onChange={() => onModel(name)}
                      />
                      <span className="break-all">{name}</span>
                      {name === selected && (
                        <Check aria-hidden className="size-4" />
                      )}
                    </label>
                  ))}
                  {choices.names.length === 0 && (
                    <p className="p-2 text-muted-foreground">
                      The gateway has no chat models yet.
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-1 p-2">
                  <label htmlFor={id + "-id"}>Model ID</label>
                  <Input
                    id={id + "-id"}
                    value={model}
                    onChange={(e) => onModel(e.target.value)}
                  />
                  {choices.failed && (
                    <p className="text-xs text-muted-foreground">
                      {choices.failed.message}
                    </p>
                  )}
                </div>
              )}
              <div className="mt-1 flex items-center justify-between border-t px-2 py-2">
                <label htmlFor={id + "-effort"}>Effort</label>
                <select
                  id={id + "-effort"}
                  className="rounded-md border bg-background px-2 py-1"
                  value={effort}
                  onChange={(e) => onEffort(e.target.value as ModelEffort | "")}
                >
                  <option value="">Default</option>
                  {effortLevels.map((level) => (
                    <option key={level} value={level}>
                      {level === "xhigh"
                        ? "Extra high"
                        : level[0].toUpperCase() + level.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
              <label className="flex items-center justify-between border-t px-2 py-2">
                Fast speed
                <input
                  type="checkbox"
                  role="switch"
                  checked={speed === "fast"}
                  onChange={(e) => onSpeed(e.target.checked ? "fast" : "")}
                />
              </label>
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
      {error && (
        <p
          id="agent-model-error"
          className="text-sm text-destructive"
          role="alert"
        >
          {error}
        </p>
      )}
    </>
  );
}
