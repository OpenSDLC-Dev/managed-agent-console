"use client";

import { useState } from "react";
import { Target } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DetailSection } from "@/components/console/detail";
import { IdCode, Time } from "@/components/console/bits";
import { cn } from "@/lib/utils";
import { useFileOptions, useSendEvents } from "@/lib/platform/queries";
import type { OutcomeEvaluation } from "@/lib/platform/types";
import {
  isTerminalOutcome,
  outcomeIterationLabel,
  outcomeResultLabel,
} from "@/lib/outcomes";

const RESULT_STYLES: Partial<Record<OutcomeEvaluation["result"], string>> = {
  running:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300",
  evaluating:
    "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/40 dark:text-blue-300",
  satisfied:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300",
  max_iterations_reached:
    "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300",
  failed: "border-destructive/30 text-destructive",
};

export function SessionOutcomes({
  sessionId,
  outcomes,
  disabled,
}: {
  sessionId: string;
  outcomes: OutcomeEvaluation[];
  disabled?: boolean;
}) {
  const send = useSendEvents(sessionId);
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [rubricType, setRubricType] = useState<"text" | "file">("text");
  const [rubricText, setRubricText] = useState("");
  const [fileId, setFileId] = useState("");
  const [maxIterations, setMaxIterations] = useState("3");
  const files = useFileOptions(open && rubricType === "file");
  const rubricFiles =
    files.data?.files.filter((file) => file.size_bytes <= 256 * 1024) ?? [];
  const active = outcomes.some((outcome) => !isTerminalOutcome(outcome.result));
  const valid =
    description.length > 0 &&
    (rubricType === "text"
      ? rubricText.length > 0 && [...rubricText].length <= 262_144
      : fileId.length > 0) &&
    /^\d+$/.test(maxIterations) &&
    Number(maxIterations) >= 1 &&
    Number(maxIterations) <= 20;
  const canSubmit = valid && !active && !disabled && !send.isPending;

  const close = () => {
    setOpen(false);
    send.reset();
  };

  const submit = () => {
    if (!canSubmit) return;
    send.mutate(
      [
        {
          type: "user.define_outcome",
          description,
          rubric:
            rubricType === "text"
              ? { type: "text", content: rubricText }
              : { type: "file", file_id: fileId },
          max_iterations: Number(maxIterations),
        },
      ],
      {
        onSuccess: () => {
          setDescription("");
          setRubricText("");
          setFileId("");
          setMaxIterations("3");
          setRubricType("text");
          setOpen(false);
        },
      },
    );
  };

  return (
    <DetailSection
      title="Outcomes"
      action={
        <Button
          size="sm"
          variant="outline"
          disabled={disabled || active}
          title={active ? "Wait for the active outcome to finish" : undefined}
          onClick={() => setOpen(true)}
        >
          <Target className="size-4" /> Define outcome
        </Button>
      }
    >
      <div
        className="space-y-3"
        data-testid="session-outcomes"
        data-outcome-count={outcomes.length}
        data-active-outcome={active ? "true" : "false"}
      >
        {outcomes.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No outcomes defined for this session.
          </p>
        )}
        {outcomes.map((outcome) => (
          <article
            key={outcome.outcome_id}
            className="rounded-lg border p-3"
            data-testid="outcome-evaluation"
            data-outcome-result={outcome.result}
            data-outcome-iteration={outcome.iteration}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">{outcome.description}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <IdCode id={outcome.outcome_id} />
                  <span>{outcomeIterationLabel(outcome.iteration)}</span>
                  {outcome.completed_at && (
                    <>
                      <span aria-hidden="true">·</span>
                      <Time iso={outcome.completed_at} />
                    </>
                  )}
                </div>
              </div>
              <Badge
                variant="outline"
                className={cn(
                  "shrink-0 font-normal",
                  RESULT_STYLES[outcome.result],
                )}
              >
                {outcomeResultLabel(outcome.result)}
              </Badge>
            </div>
            {outcome.explanation && (
              <p className="mt-2 whitespace-pre-wrap text-[13px] text-muted-foreground">
                {outcome.explanation}
              </p>
            )}
          </article>
        ))}
      </div>

      <Dialog open={open} onOpenChange={(next) => !next && close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Define outcome</DialogTitle>
            <DialogDescription>
              The agent works toward this result and the platform evaluates it
              against the rubric after each iteration.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="outcome-description">Description</Label>
              <Input
                id="outcome-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Produce a comparative survey document"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Rubric type</Label>
              <Select
                value={rubricType}
                onValueChange={(value) =>
                  setRubricType((value ?? "text") as "text" | "file")
                }
              >
                <SelectTrigger aria-label="Rubric type" className="w-full">
                  <SelectValue>
                    {rubricType === "text" ? "Text" : "File"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Text</SelectItem>
                  <SelectItem value="file">File</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {rubricType === "text" ? (
              <div className="space-y-1.5">
                <Label htmlFor="outcome-rubric">Rubric</Label>
                <textarea
                  id="outcome-rubric"
                  value={rubricText}
                  onChange={(event) => setRubricText(event.target.value)}
                  rows={7}
                  placeholder="List the criteria the deliverable must satisfy."
                  className="w-full rounded-lg border bg-transparent p-2.5 text-sm outline-none focus-visible:border-ring"
                />
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="outcome-file">Rubric file ID</Label>
                <Input
                  id="outcome-file"
                  list="outcome-rubric-files"
                  value={fileId}
                  onChange={(event) => setFileId(event.target.value)}
                />
                <p
                  className="text-xs text-muted-foreground"
                  data-file-options-state={
                    files.isPending
                      ? "loading"
                      : files.isError
                        ? "error"
                        : files.data?.truncated
                          ? "truncated"
                          : rubricFiles.length === 0
                            ? "empty"
                            : "ready"
                  }
                >
                  {files.isPending
                    ? "Loading uploaded files…"
                    : files.isError
                      ? "Files could not be loaded. Paste an ID to continue."
                      : files.data?.truncated
                        ? "Showing the first 1,000 files. Choose a suggestion or paste an ID."
                        : rubricFiles.length === 0
                          ? "No compatible rubric files found. Paste a file ID to continue."
                          : "Choose a suggestion by filename or paste a file ID."}
                </p>
                <datalist id="outcome-rubric-files">
                  {rubricFiles.map((file) => (
                    <option key={file.id} value={file.id}>
                      {file.filename}
                    </option>
                  ))}
                </datalist>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="outcome-iterations">Maximum iterations</Label>
              <Input
                id="outcome-iterations"
                type="number"
                min={1}
                max={20}
                step={1}
                value={maxIterations}
                onChange={(event) => setMaxIterations(event.target.value)}
              />
            </div>
            {send.error && (
              <p role="alert" className="text-sm text-destructive">
                {send.error.message}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button disabled={!canSubmit} onClick={submit}>
              Define outcome
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DetailSection>
  );
}
