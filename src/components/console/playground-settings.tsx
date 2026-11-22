import { useState } from "react";
import {
  ArrowUpRight,
  ChevronRight,
  Info,
  Plus,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { PlaygroundModel } from "@/lib/platform/playground";
import { cn } from "@/lib/utils";
import type { PlaygroundDraft } from "./playground-editor";
import { isObject, thinkingLimitCorrection } from "./playground-snippet";

type ModelSelectProps = {
  models: PlaygroundModel[];
  model: string;
  loading: boolean;
  running: boolean;
  onSelect: (id: string) => void;
};

export function PlaygroundModelSelect({
  models,
  model,
  loading,
  running,
  onSelect,
  fullWidth,
}: ModelSelectProps & { fullWidth?: boolean }) {
  const selected = models.find((entry) => entry.id === model);
  return (
    <Select
      value={model || null}
      disabled={!models.length || running}
      onValueChange={(value) => {
        if (value) onSelect(value);
      }}
    >
      <SelectTrigger
        size="sm"
        aria-label="Model"
        data-model={model}
        className={cn(
          "border-transparent bg-muted/70 text-sm font-medium",
          fullWidth ? "w-full data-[size=sm]:h-10" : "w-[13.5rem] max-w-[65%]",
        )}
      >
        <SelectValue>
          {selected?.display_name ??
            (loading
              ? "Loading models…"
              : model
                ? `${model} (unavailable)`
                : models.length
                  ? "Select a model"
                  : "No models")}
        </SelectValue>
      </SelectTrigger>
      <SelectContent align="start" alignItemWithTrigger={false}>
        {models.map((entry) => (
          <SelectItem key={entry.id} value={entry.id}>
            {entry.display_name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function InfoLabel({ label, help }: { label: string; help: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-medium">
      {label}
      <Tooltip>
        <TooltipTrigger
          type="button"
          aria-label={`More info about ${label}`}
          className="rounded text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
        >
          <Info className="size-3.5" />
        </TooltipTrigger>
        <TooltipContent>{help}</TooltipContent>
      </Tooltip>
    </span>
  );
}

const slider =
  "block h-7 w-full cursor-pointer appearance-none rounded-md bg-muted px-1 accent-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-default disabled:opacity-50 [&::-webkit-slider-thumb]:size-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-sm [&::-webkit-slider-thumb]:bg-background [&::-webkit-slider-thumb]:shadow-sm [&::-moz-range-thumb]:size-5 [&::-moz-range-thumb]:rounded-sm [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-background [&::-moz-range-thumb]:shadow-sm";
const number =
  "h-7 w-20 border-transparent bg-muted/70 px-1.5 text-right font-mono text-xs tabular-nums";

// Messages ThinkingConfigEnabledParam requires a budget >= 1,024, below max_tokens.
const startingThinkingBudget = 1024;

type SettingsProps = Omit<ModelSelectProps, "onSelect"> & {
  draft: PlaygroundDraft;
  onChange: (next: PlaygroundDraft) => void;
};

function SettingsFields({ draft, onChange, ...modelProps }: SettingsProps) {
  const { models, model } = modelProps;
  const selected = models.find((entry) => entry.id === model);
  const thinking = selected?.capabilities?.thinking;
  const parameters = draft.parameters ?? {};
  const thinkingConfig = isObject(parameters.thinking)
    ? parameters.thinking
    : undefined;
  const currentThinking = thinkingConfig?.type;
  const activeBudget =
    currentThinking === "enabled" &&
    typeof thinkingConfig?.budget_tokens === "number"
      ? thinkingConfig.budget_tokens
      : undefined;
  const tokenMinimum = (draft.formThinkingBudget ?? 0) + 1;
  const correction = thinkingLimitCorrection(draft);
  const supportedModes = (["enabled", "adaptive"] as const).filter(
    (mode) => thinking?.types?.[mode]?.supported,
  );
  const canSetThinking = thinking?.supported && supportedModes.length > 0;
  const [advanced, setAdvanced] = useState(false);
  const [editingLimit, setEditingLimit] = useState(Number(draft.tokens) || 1);
  // A zero or missing max_tokens means the gateway has no shared model limit.
  const reportedLimit = selected?.max_tokens;
  const budgetFitsModel =
    !reportedLimit || reportedLimit > startingThinkingBudget;
  const needsMoreTokens = !(Number(draft.tokens) > startingThinkingBudget);
  const rangeMax =
    reportedLimit && reportedLimit > 0
      ? reportedLimit
      : Math.max(1, editingLimit, Number(draft.tokens) || 0);
  const [temperatureText, setTemperatureText] = useState(
    String(parameters.temperature ?? 1),
  );
  // Keep an explicit temperature from Code visible so it can be changed or cleared.
  const showTemperature =
    !(currentThinking === "enabled" || currentThinking === "adaptive") ||
    parameters.temperature !== undefined;
  const [stops, setStops] = useState<{ text: string; value?: string }[]>(() =>
    Array.isArray(parameters.stop_sequences)
      ? parameters.stop_sequences
          .filter((stop): stop is string => typeof stop === "string")
          .map((value) => ({ value, text: value.replaceAll("\n", "\\n") }))
      : [],
  );
  function setParameter(key: string, value: unknown) {
    const next = { ...parameters };
    if (value === undefined) delete next[key];
    else next[key] = value;
    onChange({
      ...draft,
      parameters: next,
      ...(key === "thinking" && { formThinkingBudget: undefined }),
    });
  }
  function setThinking(mode: string) {
    if (mode !== "enabled") {
      setParameter("thinking", mode === "default" ? undefined : { type: mode });
      return;
    }
    onChange({
      ...draft,
      formThinkingBudget: startingThinkingBudget,
      tokens: needsMoreTokens
        ? String(startingThinkingBudget + 1)
        : draft.tokens,
      parameters: {
        ...parameters,
        thinking: { type: mode, budget_tokens: startingThinkingBudget },
      },
    });
  }
  function setTokens(value: string) {
    if (!reportedLimit && Number.isFinite(Number(value)))
      setEditingLimit(Math.max(editingLimit, Number(value)));
    onChange({ ...draft, tokens: value });
  }
  function setTemperature(value: string) {
    setTemperatureText(value);
    setParameter("temperature", value === "" ? undefined : Number(value));
  }
  function updateStops(next: typeof stops) {
    setStops(next);
    const defined = next
      .map((stop) => stop.value)
      .filter((value) => value !== undefined);
    setParameter("stop_sequences", defined.length ? defined : undefined);
  }
  return (
    <TooltipProvider>
      <fieldset
        disabled={modelProps.running}
        className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4"
      >
        <PlaygroundModelSelect
          {...modelProps}
          fullWidth
          onSelect={(selection) => onChange({ ...draft, selection })}
        />
        {canSetThinking && (
          <div className="space-y-2">
            <InfoLabel
              label="Thinking"
              help="Choose a thinking mode or use the model’s default."
            />
            <div
              role="radiogroup"
              aria-label="Thinking"
              className="flex rounded-lg bg-muted p-0.5"
            >
              {["default", "disabled", ...supportedModes].map((mode) => (
                <label
                  key={mode}
                  className="relative flex-1 cursor-pointer rounded-md px-1 py-1 text-center text-xs font-medium capitalize has-checked:bg-background has-checked:shadow-sm has-disabled:cursor-default has-disabled:opacity-50 has-focus-visible:outline-2 has-focus-visible:outline-ring"
                >
                  <input
                    type="radio"
                    className="sr-only"
                    name="playground-thinking"
                    value={mode}
                    checked={(currentThinking ?? "default") === mode}
                    disabled={mode === "enabled" && !budgetFitsModel}
                    aria-describedby={
                      mode === "enabled"
                        ? "playground-thinking-budget"
                        : undefined
                    }
                    onChange={() => setThinking(mode)}
                  />
                  {mode.charAt(0).toUpperCase() + mode.slice(1)}
                </label>
              ))}
            </div>
            {supportedModes.includes("enabled") && (
              <p
                id="playground-thinking-budget"
                className="text-xs leading-relaxed text-muted-foreground"
              >
                {!budgetFitsModel
                  ? "Manual thinking requires a model with at least 1,025 output tokens."
                  : activeBudget !== undefined
                    ? `The request includes a ${activeBudget.toLocaleString()}-token thinking budget. Edit it in Code.`
                    : needsMoreTokens
                      ? "Choosing Enabled sets Max tokens to 1,025 for a 1,024-token thinking budget."
                      : "Enabled uses a 1,024-token thinking budget."}
              </p>
            )}
          </div>
        )}
        {!canSetThinking && parameters.thinking != null && (
          <div className="flex items-center justify-between gap-3">
            <InfoLabel
              label="Thinking"
              help="This request sets a thinking mode. The selected model hasn’t advertised support for it."
            />
            <Button
              type="button"
              variant="secondary"
              size="xs"
              onClick={() => setParameter("thinking", undefined)}
            >
              Use model default
            </Button>
          </div>
        )}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <InfoLabel
              label="Max tokens"
              help={
                reportedLimit
                  ? `Limit the number of output tokens. This alias supports up to ${reportedLimit.toLocaleString()} tokens.`
                  : "Limit the number of output tokens. Enter a larger value to extend the slider’s range."
              }
            />
            <Input
              aria-label="Max tokens value"
              type="number"
              min={tokenMinimum}
              step={1}
              className={number}
              value={draft.tokens}
              onChange={(event) => setTokens(event.target.value)}
              aria-invalid={correction !== undefined || undefined}
              aria-describedby={
                correction === undefined ? undefined : "playground-budget-fix"
              }
            />
          </div>
          <input
            aria-label="Max tokens"
            type="range"
            className={slider}
            min={Math.min(tokenMinimum, rangeMax)}
            max={rangeMax}
            step={1}
            value={Math.min(rangeMax, Number(draft.tokens) || 1)}
            onChange={(event) => setTokens(event.target.value)}
          />
          {correction !== undefined && (
            <div
              id="playground-budget-fix"
              className="flex flex-wrap items-center justify-between gap-2 text-xs"
            >
              <span>Max tokens must exceed the thinking budget.</span>
              <Button
                type="button"
                size="xs"
                variant="secondary"
                onClick={() => setTokens(String(correction))}
              >
                Set Max tokens to {correction.toLocaleString()}
              </Button>
            </div>
          )}
        </div>
        <div className="border-t pt-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-expanded={advanced}
            aria-controls="playground-advanced"
            className="-ml-2"
            onClick={() => setAdvanced(!advanced)}
          >
            <ChevronRight className={advanced ? "rotate-90" : undefined} />
            Advanced
          </Button>
          {advanced && (
            <div id="playground-advanced" className="mt-4 space-y-5">
              {showTemperature && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <InfoLabel
                      label="Temperature"
                      help="Change sampling randomness from 0 to 1."
                    />
                    <Input
                      aria-label="Temperature value"
                      type="number"
                      min={0}
                      max={1}
                      step="any"
                      value={temperatureText}
                      onChange={(event) => setTemperature(event.target.value)}
                      className={number}
                    />
                  </div>
                  <input
                    aria-label="Temperature"
                    type="range"
                    className={slider}
                    min={0}
                    max={1}
                    step={0.01}
                    value={temperatureText === "" ? 1 : Number(temperatureText)}
                    onChange={(event) => setTemperature(event.target.value)}
                  />
                </div>
              )}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium">Stop sequences</span>
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    onClick={() => setStops([...stops, { text: "" }])}
                  >
                    <Plus />
                    Add
                  </Button>
                </div>
                {stops.map((stop, index) => (
                  <div key={index} className="flex items-center gap-1.5">
                    <Input
                      aria-label={`Stop sequence ${index + 1}`}
                      value={stop.text}
                      onChange={(event) =>
                        updateStops(
                          stops.map((existing, i) =>
                            i === index
                              ? {
                                  text: event.target.value,
                                  value: event.target.value
                                    ? event.target.value.replaceAll("\\n", "\n")
                                    : undefined,
                                }
                              : existing,
                          ),
                        )
                      }
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label="Remove stop sequence"
                      onClick={() =>
                        updateStops(stops.filter((_, i) => i !== index))
                      }
                    >
                      <X />
                    </Button>
                  </div>
                ))}
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Generation ends when any of these strings is emitted. Use{" "}
                  <code>{"\\n"}</code> for newlines.
                </p>
              </div>
              <div className="flex items-center justify-between">
                <InfoLabel
                  label="Streaming"
                  help="Receive the response incrementally as the model generates it."
                />
                <button
                  type="button"
                  role="switch"
                  aria-label="Streaming"
                  aria-checked={draft.stream === true}
                  onClick={() => onChange({ ...draft, stream: !draft.stream })}
                  className="inline-flex h-5 w-8 items-center rounded-full bg-muted-foreground/40 p-0.5 transition-colors focus-visible:outline-2 focus-visible:outline-ring aria-checked:bg-foreground"
                >
                  <span
                    className={cn(
                      "size-4 rounded-full bg-background shadow-sm transition-transform",
                      draft.stream === true && "translate-x-3",
                    )}
                  />
                </button>
              </div>
            </div>
          )}
        </div>
      </fieldset>
      <a
        href="https://platform.claude.com/docs/en/api/messages/create"
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-1.5 border-t px-5 py-4 text-xs text-muted-foreground hover:text-foreground hover:underline"
      >
        View API reference <ArrowUpRight className="size-3.5" />
      </a>
    </TooltipProvider>
  );
}

export function PlaygroundSettings(props: SettingsProps) {
  return (
    <Dialog modal={false}>
      <DialogTrigger
        render={
          <Button
            type="button"
            variant="secondary"
            size="icon-sm"
            disabled={props.running}
            aria-label="Model settings"
            title="Model settings"
          />
        }
      >
        <SlidersHorizontal />
      </DialogTrigger>
      <DialogContent
        showCloseButton={false}
        showOverlay={false}
        className="top-[calc(var(--console-header-height)+0.75rem)] right-3 bottom-3 left-auto flex h-auto w-[23rem] max-w-[calc(100%-1.5rem)] translate-x-0 translate-y-0 flex-col gap-0 p-0 shadow-lg sm:max-w-[calc(100%-1.5rem)] data-open:zoom-in-100 data-closed:zoom-out-100"
      >
        <div className="flex items-center justify-between px-5 pt-3">
          <DialogTitle>Model</DialogTitle>
          <DialogClose
            render={
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label="Close settings"
              />
            }
          >
            <X />
          </DialogClose>
        </div>
        <SettingsFields {...props} />
      </DialogContent>
    </Dialog>
  );
}
