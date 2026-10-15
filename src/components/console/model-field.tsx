"use client";

import Link from "next/link";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useGatewayAliases } from "@/lib/platform/gateway-queries";
import { isUnimplemented } from "@/lib/platform/surfaces";

export interface ModelChoices {
  /** The gateway's chat Models; unset where the field is a text box. */
  names?: string[];
  /** The list is still being read, so nothing can be chosen yet. */
  pending?: boolean;
  /** Why a configured gateway's list is unknown. */
  failed?: Error;
}

/**
 * What the agent and Dream model field offers (plan 10 decision 6): the
 * gateway's chat Models by name, without the `*` catch-all. Until the list
 * arrives, Save waits: a slow gateway must not leave a window for a name it
 * does not list. A console without a gateway gets the BFF's 404 at once and
 * keeps its text box. A failed read falls back to the text box too, even with
 * a list cached from an earlier read: the wire takes any string, and an
 * outage should not stop an agent's other edits.
 */
export function useModelChoices(): ModelChoices {
  const aliases = useGatewayAliases();
  return {
    names: aliases.error
      ? undefined
      : aliases.data?.data
          .filter((a) => a.kind === "chat" && a.name !== "*")
          .map((a) => a.name),
    pending: aliases.isPending,
    failed:
      aliases.error && !isUnimplemented(aliases.error)
        ? aliases.error
        : undefined,
  };
}

/** Whether Save can take `value`: a listed name, or whatever the text box holds. */
export const modelChosen = (choices: ModelChoices, value: string) =>
  !choices.pending && (!choices.names || choices.names.includes(value));

/**
 * A saved name the list lacks shows empty, so Save waits for a choice. A
 * read-only view shows the saved name as it is.
 */
export function ModelField({
  id,
  value,
  onChange,
  choices,
  readOnly,
  placeholder,
  className,
  error,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  choices: ModelChoices;
  readOnly?: boolean;
  placeholder?: string;
  /** For the text box; the select shows names in mono. */
  className?: string;
  /** Why Save sent nothing; only the select can lack a choice. */
  error?: string;
}) {
  // Shown under either control: while the list loads, Save's reason sits
  // under a disabled box that cannot take focus.
  const errorNote = error && (
    <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
      {error}
    </p>
  );
  if (readOnly || !choices.names)
    return (
      <>
        <Input
          id={id}
          className={className}
          value={value}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
          placeholder={
            choices.pending && !readOnly
              ? "Loading the gateway's models…"
              : placeholder
          }
          disabled={choices.pending && !readOnly}
          onChange={(e) => onChange(e.target.value)}
        />
        {errorNote}
        {choices.failed && !readOnly && (
          <p className="text-xs text-muted-foreground">
            Could not read the gateway&apos;s models: {choices.failed.message}
          </p>
        )}
      </>
    );
  const known = choices.names.includes(value);
  return (
    <>
      <Select
        value={known ? value : null}
        onValueChange={(next) => next && onChange(next)}
      >
        <SelectTrigger
          id={id}
          className="w-full"
          data-model={known ? value : ""}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
        >
          <SelectValue
            placeholder={
              choices.names.length
                ? "Choose a model"
                : "The gateway has no chat models yet"
            }
          >
            {known ? <span className="font-mono">{value}</span> : undefined}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {choices.names.map((name) => (
            <SelectItem key={name} value={name} className="font-mono">
              {name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {errorNote}
      <p className="text-xs text-muted-foreground">
        The gateway&apos;s chat models. To add one, go to{" "}
        <Link href="/models" className="underline underline-offset-2">
          Model Gateway → Models
        </Link>
        .
      </p>
    </>
  );
}
