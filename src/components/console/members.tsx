"use client";

import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { PageHeader } from "@/components/shell/page-header";
import { DataTable } from "./data-table";
import { ErrorState } from "./bits";
import {
  AuthConfig,
  Member,
  MemberPage,
  ORGANIZATION,
  Role,
  enterConsole,
  nativeGet,
  nativeWrite,
  passwordProblem,
  readAccount,
} from "@/lib/platform/native";

const roleClass =
  "h-9 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-2 focus-visible:outline-ring";

export function Members() {
  const client = useQueryClient();
  const createRef = useRef<HTMLButtonElement>(null);
  const [after, setAfter] = useState<string>();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [filters, setFilters] = useState({ email: "", role: "" });
  const [create, setCreate] = useState(false);
  const [remove, setRemove] = useState<Member>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const config = useQuery({
    queryKey: ["native-config"],
    queryFn: () => nativeGet<AuthConfig>("/api/auth/config"),
  });
  const account = useQuery({
    queryKey: ["console-session"],
    queryFn: readAccount,
    staleTime: 0,
  });
  const list = useQuery({
    queryKey: ["members", after, filters],
    queryFn: () =>
      nativeGet<MemberPage>(`${ORGANIZATION}/members`, {
        limit: 20,
        after_id: after,
        email: filters.email || undefined,
        "roles[]": filters.role ? [filters.role] : undefined,
      }),
  });

  async function change(
    path: string,
    body?: unknown,
    method = "POST",
    self = false,
  ) {
    setBusy(true);
    setError(undefined);
    try {
      await nativeWrite(path, body, method);
      if (self) {
        enterConsole();
        return;
      }
      setCreate(false);
      setRemove(undefined);
      await Promise.all([
        client.invalidateQueries({ queryKey: ["members"] }),
        client.invalidateQueries({ queryKey: ["console-session"] }),
        client.invalidateQueries({ queryKey: ["surfaces"] }),
      ]);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "The member could not be changed.",
      );
    } finally {
      setBusy(false);
    }
  }

  function createMember(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const body = {
      login_name: String(fields.get("login_name")),
      password: String(fields.get("password")),
      name: String(fields.get("name") ?? ""),
      role: String(fields.get("role")),
    };
    const problem = passwordProblem(body.password);
    if (problem) {
      setError(problem);
      return;
    }
    form.reset();
    void change(`${ORGANIZATION}/members`, body);
  }

  return (
    <div>
      <PageHeader
        title="Members"
        subtitle="People in this organization. The platform controls their current role and status."
        actions={
          config.data?.mode === "password" && (
            <Button
              ref={createRef}
              onClick={() => {
                setError(undefined);
                setCreate(true);
              }}
            >
              Create local member
            </Button>
          )
        }
      />
      <form
        className="mb-4 flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          setAfter(undefined);
          setFilters({ email, role });
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="member-email">Filter by email</Label>
          <Input
            id="member-email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="member-filter-role">Filter by role</Label>
          <select
            id="member-filter-role"
            className={roleClass}
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            <option value="">All roles</option>
            {["user", "developer", "admin"].map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </div>
        <Button variant="outline" type="submit">
          Apply filters
        </Button>
      </form>
      {error && !create && !remove && (
        <p role="alert" className="mb-4 text-sm text-destructive">
          {error}
        </p>
      )}
      {list.error ? (
        <ErrorState error={list.error} />
      ) : (
        <DataTable
          rows={list.data?.data ?? []}
          rowKey={(m) => m.id}
          loading={list.isPending}
          empty={
            <p className="py-8 text-sm text-muted-foreground">
              No members match these filters.
            </p>
          }
          columns={[
            {
              key: "name",
              header: "Member",
              cell: (m) => (
                <div>
                  <div>{m.name || m.email || m.login_name || m.id}</div>
                  <div className="text-xs text-muted-foreground">
                    {m.email || m.login_name || m.id}
                  </div>
                </div>
              ),
            },
            {
              key: "role",
              header: "Role",
              cell: (m) =>
                m.role_source === "idp" ? (
                  <div>
                    <span>{m.role}</span>
                    <span className="block text-xs text-muted-foreground">
                      Managed by identity provider
                    </span>
                  </div>
                ) : (
                  <select
                    aria-label={`Role for ${m.name || m.login_name || m.id}`}
                    className={roleClass}
                    value={m.role}
                    disabled={busy}
                    onChange={(e) =>
                      void change(
                        `${ORGANIZATION}/members/${encodeURIComponent(m.id)}`,
                        { role: e.target.value as Role },
                        "POST",
                        m.id === account.data?.id,
                      )
                    }
                  >
                    {["user", "developer", "admin"].map((r) => (
                      <option key={r}>{r}</option>
                    ))}
                  </select>
                ),
            },
            {
              key: "status",
              header: "Status",
              cell: (m) => (
                <span data-member-status={m.status}>{m.status}</span>
              ),
            },
            {
              key: "actions",
              header: <span className="sr-only">Actions</span>,
              cell: (m) => (
                <Button
                  variant="ghost"
                  disabled={busy}
                  aria-label={`Remove ${m.name || m.login_name || m.id}`}
                  onClick={() => {
                    setError(undefined);
                    setRemove(m);
                  }}
                >
                  Remove
                </Button>
              ),
            },
          ]}
        />
      )}
      <div className="mt-4 flex gap-2">
        <Button
          variant="outline"
          disabled={!after}
          onClick={() => setAfter(undefined)}
        >
          First page
        </Button>
        <Button
          variant="outline"
          disabled={!list.data?.has_more}
          onClick={() => setAfter(list.data?.last_id ?? undefined)}
        >
          Next page
        </Button>
      </div>
      <Dialog
        open={create}
        onOpenChange={(open) => {
          setCreate(open);
          setError(undefined);
        }}
      >
        <DialogContent finalFocus={createRef}>
          <DialogHeader>
            <DialogTitle>Create local member</DialogTitle>
            <DialogDescription>
              Local accounts are for development and test password deployments.
              This does not send an invitation.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={createMember} method="post" className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="new-login">Login name</Label>
              <Input
                id="new-login"
                name="login_name"
                required
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-name">Name</Label>
              <Input id="new-name" name="name" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-password">Password</Label>
              <Input
                id="new-password"
                name="password"
                type="password"
                required
                autoComplete="new-password"
              />
              <p className="text-xs text-muted-foreground">
                12–1024 UTF-8 bytes, without NUL.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-role">Role</Label>
              <select
                id="new-role"
                name="role"
                defaultValue="user"
                className={roleClass}
              >
                {["user", "developer", "admin"].map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <DialogFooter>
              <Button
                variant="outline"
                type="button"
                onClick={() => {
                  setCreate(false);
                  setError(undefined);
                }}
              >
                Cancel
              </Button>
              <Button disabled={busy} type="submit">
                Create member
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!remove}
        onOpenChange={(open) => {
          if (!open) {
            setRemove(undefined);
            setError(undefined);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove member?</DialogTitle>
            <DialogDescription>
              This deactivates the account and ends its access. The platform may
              refuse removal of the last human administrator.
            </DialogDescription>
          </DialogHeader>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemove(undefined)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() =>
                remove &&
                void change(
                  `${ORGANIZATION}/members/${encodeURIComponent(remove.id)}`,
                  undefined,
                  "DELETE",
                  remove.id === account.data?.id,
                )
              }
            >
              Confirm removal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
