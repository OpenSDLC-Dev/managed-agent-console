"use client";

import { NativeSelect } from "@/components/ui/native-select";
import { SyntaxCode } from "./syntax-code";
import { useState, type ReactNode, type RefObject } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Check, Copy, KeyRound, Laptop } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DialogClose,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { copyText } from "@/lib/copy-text";

function focusHeading(heading: HTMLHeadingElement | null) {
  heading?.focus();
}

// The key issuer also exists on older edges without CLI OAuth. A parameterless
// GET reaches clioauth.go's input check before login, consent, or code issuance.
async function cliLoginAvailable({ signal }: { signal: AbortSignal }) {
  const response = await fetch("/oauth/authorize", {
    signal,
    credentials: "same-origin",
    redirect: "error",
    cache: "no-store",
  });
  if (response.status !== 400) return false;
  const body = await response.json();
  return (
    body?.type === "error" &&
    body.error?.type === "invalid_request_error" &&
    body.error.message === "invalid CLI authorization parameters"
  );
}

export function KeyConnectionMethods({
  onCli,
  onKey,
  cliButtonRef,
}: {
  onCli: () => void;
  onKey: () => void;
  cliButtonRef: RefObject<HTMLButtonElement | null>;
}) {
  const cli = useQuery({
    queryKey: ["cli-login-available"],
    queryFn: cliLoginAvailable,
    staleTime: 60_000,
    retry: false,
  });
  const card =
    "flex flex-col items-start gap-2 rounded-xl bg-muted/65 p-4 text-left hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring";
  return (
    <>
      <DialogHeader>
        <DialogTitle>Connect to the API</DialogTitle>
        <DialogDescription>Where does your code run?</DialogDescription>
      </DialogHeader>
      <div className={cli.data ? "grid gap-3 sm:grid-cols-2" : "grid gap-3"}>
        {cli.data && (
          <button
            type="button"
            ref={cliButtonRef}
            className={card}
            aria-labelledby="cli-method"
            aria-describedby="cli-method-description"
            onClick={onCli}
          >
            <Laptop aria-hidden className="mb-2 size-5" />
            <span id="cli-method" className="font-medium">
              Your own machine
            </span>
            <span id="cli-method-description" className="text-muted-foreground">
              Sign in with the ant CLI.
            </span>
            <span className="rounded-full bg-foreground/5 px-2 py-0.5 text-xs">
              No key needed
            </span>
          </button>
        )}
        <button
          type="button"
          className={card}
          aria-labelledby="api-key-method"
          aria-describedby="api-key-method-description"
          onClick={onKey}
        >
          <KeyRound aria-hidden className="mb-2 size-5" />
          <span id="api-key-method" className="font-medium">
            Somewhere else
          </span>
          <span
            id="api-key-method-description"
            className="text-muted-foreground"
          >
            Use an API key, including with tools that require one.
          </span>
        </button>
      </div>
    </>
  );
}

const installCommands = {
  homebrew: "brew install anthropics/tap/ant",
  go: "go install github.com/anthropics/anthropic-cli/cmd/ant@v1.30.0",
} as const;

function CliCommand({
  command,
  copyLabel,
  children,
}: {
  command: string;
  copyLabel: string;
  children: ReactNode;
}) {
  const [copied, setCopied] = useState<{ command: string; ok: boolean }>();
  const result = copied?.command === command ? copied : undefined;
  return (
    <div className="mt-3 space-y-1">
      <div className="rounded-lg bg-muted/65 px-3 py-2">
        <div className="flex min-h-6 items-center justify-between gap-2 text-xs">
          {children}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="size-6"
            aria-label={copyLabel}
            title="Copy code"
            onClick={async () =>
              setCopied({ command, ok: await copyText(command) })
            }
          >
            {result?.ok ? (
              <Check className="size-3.5" />
            ) : (
              <Copy className="size-3.5" />
            )}
          </Button>
        </div>
        <pre className="mt-2 whitespace-pre-wrap wrap-anywhere py-1 font-mono text-[13px] leading-5">
          <SyntaxCode language="bash">{command}</SyntaxCode>
        </pre>
      </div>
      <p
        role="status"
        className={
          result && !result.ok ? "text-xs text-destructive" : "sr-only"
        }
      >
        {result && (result.ok ? "Code copied" : "Could not copy the code")}
      </p>
    </div>
  );
}

function CliStep({
  n,
  title,
  children,
}: {
  n: number;
  title: ReactNode;
  children: ReactNode;
}) {
  return (
    <li className="relative flex gap-3 before:absolute before:top-6 before:left-2.5 before:-bottom-5 before:w-px before:bg-border/50 last:before:hidden">
      <span
        aria-hidden
        className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs text-muted-foreground"
      >
        {n}
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-medium">{title}</h3>
        {children}
      </div>
    </li>
  );
}

const linkClass =
  "inline-flex items-center gap-0.5 text-sky-800 underline underline-offset-2 hover:text-foreground dark:text-sky-300";

export function KeyCliLogin({ onBack }: { onBack: () => void }) {
  const [method, setMethod] =
    useState<keyof typeof installCommands>("homebrew");
  // The application edge serves both OAuth authorization and token exchange.
  // Quote the current origin for the shell, including a literal apostrophe.
  const origin = "'" + window.location.origin.replaceAll("'", "'\\''") + "'";
  const command = `ant auth login --profile platform --console-url ${origin} --base-url ${origin}`;
  return (
    <>
      <DialogHeader>
        <DialogTitle tabIndex={-1} ref={focusHeading}>
          Your own machine
        </DialogTitle>
        <DialogDescription>
          Sign in once to use the CLI with this Platform.
        </DialogDescription>
      </DialogHeader>
      <ol className="my-2 space-y-5">
        <CliStep
          n={1}
          title={
            <>
              Install the <code className="rounded bg-muted px-1">ant</code> CLI
            </>
          }
        >
          <p className="mt-0.5 text-sm text-muted-foreground">
            Run this in your terminal.{" "}
            <a
              className={linkClass}
              href="https://github.com/anthropics/anthropic-cli#installation"
              target="_blank"
              rel="noopener noreferrer"
            >
              Other ways to install{" "}
              <ArrowUpRight aria-hidden className="size-3.5" />
            </a>
          </p>
          <CliCommand
            command={installCommands[method]}
            copyLabel="Copy install command"
          >
            <NativeSelect
              aria-label="Installation method"
              className="max-w-full rounded bg-transparent focus-visible:outline-2 focus-visible:outline-ring"
              value={method}
              onChange={(event) =>
                setMethod(event.target.value as keyof typeof installCommands)
              }
            >
              <option value="homebrew">Homebrew (macOS)</option>
              <option value="go">Go</option>
            </NativeSelect>
          </CliCommand>
        </CliStep>
        <CliStep n={2} title="Sign in">
          <p className="mt-0.5 text-sm text-muted-foreground">
            Your browser opens to approve access to this Platform.
          </p>
          <CliCommand command={command} copyLabel="Copy sign-in command">
            <span className="text-muted-foreground">Terminal</span>
          </CliCommand>
        </CliStep>
        <CliStep n={3} title="Send your first request">
          <a
            className={linkClass}
            href="https://github.com/OpenSDLC-Dev/managed-agent-platform/blob/main/deploy/compose/README.md#quick-start"
            target="_blank"
            rel="noopener noreferrer"
          >
            Follow the quickstart{" "}
            <ArrowUpRight aria-hidden className="size-3.5" />
          </a>
        </CliStep>
      </ol>
      <div className="mt-2 flex items-center justify-between gap-3">
        <Button type="button" size="sm" variant="secondary" onClick={onBack}>
          Back
        </Button>
        <DialogClose render={<Button type="button" size="sm" />}>
          Done
        </DialogClose>
      </div>
    </>
  );
}
