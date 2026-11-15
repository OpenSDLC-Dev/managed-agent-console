"use client";

import { useContext, useState } from "react";
import { ConsoleSessionContext } from "@/components/shell/console-session";
import { ErrorState, ListSkeleton } from "@/components/console/bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useGatewayModelLimits,
  usePutGatewayModelLimit,
} from "@/lib/platform/gateway-queries";
import { isNativeConsole, wireInteger } from "@/lib/platform/http";
import { isUnimplemented } from "@/lib/platform/surfaces";
import type { GatewayModelLimit } from "@/lib/platform/types";

const FIELDS = [
  ["requests_per_minute", "Requests per minute"],
  ["input_tokens_per_minute", "Input tokens per minute"],
  ["output_tokens_per_minute", "Output tokens per minute"],
] as const;
const EMPTY = {
  requests_per_minute: null,
  input_tokens_per_minute: null,
  output_tokens_per_minute: null,
};

export function ModelRateLimits({ model }: { model: string }) {
  const session = useContext(ConsoleSessionContext)?.data;
  if (
    !isNativeConsole() ||
    !session?.signed_in ||
    !["admin", "developer"].includes(session.role ?? "")
  )
    return null;
  // Rebinding or demotion discards any open draft. The backend rechecks the
  // current admin in the write transaction; this is only the UI affordance.
  return (
    <Limits
      key={`${session.id}:${session.role}:${model}`}
      model={model}
      admin={session.role === "admin"}
    />
  );
}

function Limits({ model, admin }: { model: string; admin: boolean }) {
  const query = useGatewayModelLimits();
  const [editing, setEditing] = useState(false);
  if (isUnimplemented(query.error)) return null;
  const limit = query.data?.data.find((row) => row.model === model) ?? {
    model,
    ...EMPTY,
  };
  return (
    <section className="pt-5">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-[15px] font-medium">Organization limits</h4>
        {admin && query.isSuccess && (
          <Button
            size="sm"
            variant="outline"
            className="h-8"
            onClick={() => setEditing(true)}
          >
            Edit limits
          </Button>
        )}
      </div>
      <p className="py-2 text-[13px] text-muted-foreground">
        {model === "*"
          ? "All names matched by * share these limits."
          : "All keys, protocols and upstreams share this model's limits."}
      </p>
      {query.error ? (
        <ErrorState error={query.error} />
      ) : query.isPending ? (
        <ListSkeleton />
      ) : (
        <dl className="grid gap-1 text-[13px]">
          {FIELDS.map(([field, label]) => (
            <div key={field} className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{label}</dt>
              <dd data-limit={field} data-value={limit[field] ?? ""}>
                {limit[field] === null
                  ? "No limit"
                  : limit[field].toLocaleString("en-US")}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {editing && (
        <LimitDialog limit={limit} onClose={() => setEditing(false)} />
      )}
    </section>
  );
}

function LimitDialog({
  limit,
  onClose,
}: {
  limit: GatewayModelLimit;
  onClose: () => void;
}) {
  const put = usePutGatewayModelLimit(limit.model);
  const [draft, setDraft] = useState(() =>
    Object.fromEntries(
      FIELDS.map(([field]) => [
        field,
        limit[field] === null ? "" : String(limit[field]),
      ]),
    ),
  );
  const submit = () =>
    put.mutate(
      {
        requests_per_minute: draft.requests_per_minute.trim()
          ? wireInteger(draft.requests_per_minute)
          : null,
        input_tokens_per_minute: draft.input_tokens_per_minute.trim()
          ? wireInteger(draft.input_tokens_per_minute)
          : null,
        output_tokens_per_minute: draft.output_tokens_per_minute.trim()
          ? wireInteger(draft.output_tokens_per_minute)
          : null,
      },
      { onSuccess: onClose },
    );
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !put.isPending) onClose();
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto p-6 sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="text-2xl">
            Organization limits · {limit.model}
          </DialogTitle>
          <DialogDescription>
            Leave a field blank for no limit. Changes apply to every caller of
            this model.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          {FIELDS.map(([field, label]) => (
            <div key={field} className="space-y-1.5">
              <Label htmlFor={`model-${field}`}>{label}</Label>
              <Input
                id={`model-${field}`}
                type="text"
                inputMode="numeric"
                placeholder="No limit"
                value={draft[field]}
                disabled={put.isPending}
                onChange={(e) =>
                  setDraft({ ...draft, [field]: e.target.value })
                }
              />
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Input includes cache writes, not cache reads. Tokens count when calls
          finish; requests already running can pass the limit.
        </p>
        {put.error instanceof Error && (
          <p role="alert" className="text-sm text-destructive">
            {put.error.message}
          </p>
        )}
        <DialogFooter className="m-0 border-0 bg-transparent p-0">
          <Button variant="ghost" disabled={put.isPending} onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={put.isPending} onClick={submit}>
            {put.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
