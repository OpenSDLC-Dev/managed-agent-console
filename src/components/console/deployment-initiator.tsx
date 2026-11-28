"use client";

import { NativeSelect } from "@/components/ui/native-select";
import { useContext, useRef, useState } from "react";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { ConsoleSessionContext } from "@/components/shell/console-session";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ErrorState } from "./bits";
import { isUnimplemented } from "@/lib/platform/surfaces";
import {
  ORGANIZATION,
  nativeGet,
  nativeWrite,
  type ServiceAccountPage,
} from "@/lib/platform/native";

// Platform internal/api/deploymentinitiator.go; deliberately absent from Deployment.
type Initiator = { principal_id: string | null; api_key_id: string | null };

export function DeploymentInitiator({ id }: { id: string }) {
  const session = useContext(ConsoleSessionContext)?.data;
  if (!session?.signed_in || session.role !== "admin") return null;
  return (
    <InitiatorSetting key={`${session.id}:${id}`} id={id} actor={session.id!} />
  );
}

function InitiatorSetting({ id, actor }: { id: string; actor: string }) {
  const path = `${ORGANIZATION}/deployments/${encodeURIComponent(id)}/initiator`;
  const key = ["deployment-initiator", actor, id];
  const client = useQueryClient();
  const query = useQuery({
    queryKey: key,
    queryFn: () => nativeGet<Initiator>(path),
  });
  const trigger = useRef<HTMLButtonElement>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  if (isUnimplemented(query.error)) return null;
  if (query.error) return <ErrorState error={query.error} />;
  if (!query.data) return <p role="status">Loading initiator…</p>;
  const current = query.data.principal_id ?? query.data.api_key_id;
  return (
    <section className="space-y-2 border-t pt-3 text-sm">
      <h3 className="font-medium">Scheduled run initiator</h3>
      <p
        className="break-all text-muted-foreground"
        data-initiator-id={current ?? ""}
      >
        {current ?? "No initiator"}
      </p>
      <p className="text-xs text-muted-foreground">
        Scheduled sessions run under this identity. Manual runs use the caller.
      </p>
      <Button
        type="button"
        size="sm"
        variant="outline"
        ref={trigger}
        disabled={busy}
        onClick={() => setEditing(true)}
      >
        Change initiator
      </Button>
      <Dialog open={editing} onOpenChange={setEditing}>
        {editing && (
          <DialogContent finalFocus={trigger}>
            <InitiatorForm
              actor={actor}
              path={path}
              busy={busy}
              setBusy={setBusy}
              onSaved={async (value) => {
                await client.cancelQueries({ queryKey: key, exact: true });
                client.setQueryData(key, value);
                setEditing(false);
              }}
              onCancel={() => setEditing(false)}
            />
          </DialogContent>
        )}
      </Dialog>
    </section>
  );
}

function InitiatorForm({
  actor,
  path,
  onSaved,
  onCancel,
  busy,
  setBusy,
}: {
  actor: string;
  path: string;
  onSaved: (value: Initiator) => Promise<void>;
  onCancel: () => void;
  busy: boolean;
  setBusy: (busy: boolean) => void;
}) {
  const [selected, setSelected] = useState("");
  const [error, setError] = useState<string>();
  const accounts = useInfiniteQuery({
    queryKey: ["deployment-initiator-service-accounts", actor],
    queryFn: ({ pageParam }) =>
      nativeGet<ServiceAccountPage>(`${ORGANIZATION}/service_accounts`, {
        limit: 100,
        page: pageParam,
        include_archived: false,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_page ?? undefined,
  });
  const services =
    accounts.data?.pages
      .flatMap((page) => page.data)
      .filter((account) => !account.archived_at) ?? [];
  async function save(event: React.FormEvent) {
    event.preventDefault();
    // The dialog is a portal inside the configuration form's React tree.
    event.stopPropagation();
    setBusy(true);
    setError(undefined);
    try {
      await onSaved(
        await nativeWrite<Initiator>(path, { principal_id: selected }),
      );
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "The initiator could not be changed.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={save}>
      <DialogHeader>
        <DialogTitle>Change scheduled run initiator</DialogTitle>
        <DialogDescription>
          Use a service account for work that must continue after a person
          leaves. This affects future scheduled sessions. Existing sessions keep
          their initiator. A paused deployment stays paused until you unpause
          it.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-3 py-4">
        <Label htmlFor="deployment-initiator-account">Service account</Label>
        <NativeSelect
          id="deployment-initiator-account"
          className="h-9 w-full min-w-0 rounded-md border bg-background px-3 text-sm"
          value={selected}
          onChange={(event) => setSelected(event.target.value)}
          disabled={busy}
        >
          <option value="">Select a service account</option>
          {services.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name || account.id}
            </option>
          ))}
        </NativeSelect>
        {accounts.isFetching && <p role="status">Loading service accounts…</p>}
        {accounts.isSuccess && services.length === 0 && (
          <p>No active service accounts.</p>
        )}
        {accounts.error && (
          <p role="alert" className="text-sm text-destructive">
            {accounts.error.message}
          </p>
        )}
        {(accounts.isError || accounts.isRefetchError) && (
          <Button
            type="button"
            variant="outline"
            disabled={busy || accounts.isFetching}
            onClick={() => void accounts.refetch()}
          >
            Retry
          </Button>
        )}
        {accounts.hasNextPage && (
          <Button
            type="button"
            variant="outline"
            disabled={busy || accounts.isFetching}
            onClick={() => void accounts.fetchNextPage()}
          >
            Load more service accounts
          </Button>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={
            busy ||
            !!accounts.error ||
            !services.some((account) => account.id === selected)
          }
        >
          {busy ? "Saving…" : "Save initiator"}
        </Button>
      </DialogFooter>
    </form>
  );
}
