import type { OutcomeEvaluation } from "@/lib/platform/types";

const TERMINAL_RESULTS = new Set<OutcomeEvaluation["result"]>([
  "satisfied",
  "max_iterations_reached",
  "failed",
  "interrupted",
]);

const RESULT_LABELS: Record<string, string> = {
  pending: "Pending",
  running: "Running",
  evaluating: "Evaluating",
  satisfied: "Satisfied",
  needs_revision: "Needs revision",
  max_iterations_reached: "Max iterations reached",
  failed: "Failed",
  interrupted: "Interrupted",
};

export function isTerminalOutcome(
  result: OutcomeEvaluation["result"],
): boolean {
  return TERMINAL_RESULTS.has(result);
}

export function outcomeResultLabel(result: string): string {
  return RESULT_LABELS[result] ?? result;
}

export function outcomeIterationLabel(iteration: number): string {
  return `Iteration ${iteration + 1}`;
}
