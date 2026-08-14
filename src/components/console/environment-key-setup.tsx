"use client";

import { useState, useSyncExternalStore } from "react";
import { Check, Copy, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { copyText } from "@/lib/copy-text";

/**
 * The reference's "Set up your self-hosted environment" panel, with our
 * platform's realities substituted (plan 07, settled decision 2).
 *
 * Three substitutions, each recorded in docs/design-reference.md:
 *  - our key prefix, `sk-map-env01-`, not `sk-ant-oat01-`;
 *  - an `ANTHROPIC_BASE_URL` export the reference has no need for, because its
 *    worker already knows where its one platform is and ours does not;
 *  - `$PLATFORM_BASE_URL` as the placeholder for that value, matching the
 *    agent editor's curl block. The console genuinely cannot fill it in: the
 *    base URL is server-side configuration and `/api/health` withholds it on
 *    purpose, so a guide that printed a real URL would be a guide that leaked
 *    one to whatever can read this page.
 */

const DISMISSED_KEY = "console:environment-key-setup-dismissed";

/**
 * Dismissal lives in `localStorage`, which makes it an external store rather
 * than component state — so it is read through `useSyncExternalStore` rather
 * than seeded into `useState` from an effect.
 *
 * The distinction matters twice over: the server has no `localStorage`, so a
 * lazy initializer would hydrate mismatched, and setting state from an effect
 * to work around that is the cascading-render pattern the lint rule refuses.
 * `getServerSnapshot` answers "shown", which is also the right default for a
 * storage that throws — a guide shown to someone who dismissed it is a much
 * smaller failure than one that cannot be brought back.
 */
const listeners = new Set<() => void>();

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  // Another tab dismissing it counts too.
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

/**
 * The fallback when storage is unavailable — private mode throws on access
 * rather than returning null. Without it the dismiss button would appear
 * broken there: the write throws, the listeners fire, and the read still says
 * "not dismissed", so the panel never goes away (PR #91 review).
 */
let dismissedInMemory = false;

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return dismissedInMemory;
  }
}

function dismiss(): void {
  try {
    window.localStorage.setItem(DISMISSED_KEY, "1");
  } catch {
    // Storage is the source of truth wherever it works, so the in-memory flag
    // is set only where it does not — which also keeps it from outliving the
    // page in any deployment that has working storage. The dismissal then
    // lasts for this page view only, a much smaller failure than a button
    // that does nothing.
    dismissedInMemory = true;
  }
  for (const listener of listeners) listener();
}

function CodeBlock({ code, label }: { code: string; label: string }) {
  const [copied, setCopied] = useState<"ok" | "fail" | null>(null);
  return (
    <div className="relative mt-2 rounded-md border bg-secondary/40">
      {/* A horizontally scrollable region needs to be reachable by keyboard,
          or its overflow is readable only with a mouse (axe
          `scrollable-region-focusable`). The install command is wider than
          this column on any realistic viewport. */}
      <pre
        tabIndex={0}
        role="group"
        aria-label={label.replace(/^Copy /, "")}
        className="overflow-x-auto p-3 pr-10 font-mono text-[12px] leading-5"
      >
        {code}
      </pre>
      <button
        type="button"
        aria-label={label}
        title={label}
        className="absolute top-2 right-2 rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
        onClick={() => {
          void copyText(code).then((ok) => {
            setCopied(ok ? "ok" : "fail");
            window.setTimeout(() => setCopied(null), 1500);
          });
        }}
      >
        {copied === "ok" ? (
          <Check className="size-3.5" />
        ) : copied === "fail" ? (
          <X className="size-3.5 text-destructive" />
        ) : (
          <Copy className="size-3.5" />
        )}
      </button>
    </div>
  );
}

function Step({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-3">
      <span
        aria-hidden
        className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border text-[11px] text-muted-foreground"
      >
        {n}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium">{title}</p>
        <div className="text-[13px] text-muted-foreground">{children}</div>
      </div>
    </li>
  );
}

export function EnvironmentKeySetup({
  environmentId,
}: {
  environmentId: string;
}) {
  const dismissed = useSyncExternalStore(subscribe, readDismissed, () => false);

  if (dismissed) return null;

  return (
    <aside
      data-testid="environment-key-setup"
      className="rounded-lg border p-4"
      aria-labelledby="environment-key-setup-title"
    >
      <div className="flex items-start justify-between gap-2">
        <p id="environment-key-setup-title" className="text-sm font-medium">
          Set up your self-hosted environment
        </p>
        <Button
          variant="ghost"
          size="sm"
          className="-mt-1 -mr-1 h-7 text-muted-foreground"
          aria-label="Dismiss setup instructions"
          onClick={dismiss}
        >
          <X className="size-4" />
        </Button>
      </div>
      <p className="pt-1 text-[13px] text-muted-foreground">
        These instructions set up a CLI worker on a host you run.
      </p>

      <ol className="flex flex-col gap-4 pt-4">
        <Step n={1} title="Register an environment key">
          Generate an environment key authenticating your infrastructure with
          this environment.
        </Step>

        <Step n={2} title="Export the key and this platform's URL">
          The key authorizes the worker to poll for work; the base URL is what
          points it at this platform rather than a hosted one. Substitute the{" "}
          <code className="font-mono text-[12px]">PLATFORM_BASE_URL</code> this
          console is configured with.
          <CodeBlock
            label="Copy the environment variables"
            code={`export ANTHROPIC_ENVIRONMENT_KEY='sk-map-env01-…'
export ANTHROPIC_BASE_URL="$PLATFORM_BASE_URL"`}
          />
        </Step>

        <Step n={3} title="Install the ant CLI">
          Run this on the machine where the worker should run. This platform is
          wire-compatible with Anthropic&apos;s CLI, so the released binary is
          the worker — there is nothing of ours to install.
          <CodeBlock
            label="Copy the install command"
            code={`VERSION=1.9.0
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m | sed -e 's/x86_64/amd64/' -e 's/aarch64/arm64/')
curl -fsSL "https://github.com/anthropics/anthropic-cli/releases/download/v\${VERSION}/ant_\${VERSION}_\${OS}_\${ARCH}.tar.gz" \\
  | sudo tar -xz -C /usr/local/bin ant`}
          />
        </Step>

        <Step n={4} title="Run the worker">
          <code className="font-mono text-[12px]">ant beta:worker</code> has a
          built-in polling loop, started with the{" "}
          <code className="font-mono text-[12px]">poll</code> command.
          <CodeBlock
            label="Copy the worker command"
            code={`ant beta:worker poll \\
  --environment-id "${environmentId}" \\
  --workdir "/workspace"`}
          />
        </Step>
      </ol>
    </aside>
  );
}
