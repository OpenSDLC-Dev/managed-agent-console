"use client";

import { DetailSection } from "@/components/console/detail";
import { DataTable, type Column } from "@/components/console/data-table";
import {
  EmptyState,
  ErrorState,
  IdCode,
  Time,
} from "@/components/console/bits";
import { Badge } from "@/components/ui/badge";
import {
  useEnvironmentKeys,
  useEnvironmentStillExists,
} from "@/lib/platform/queries";
import { useNow } from "@/lib/session-trace/use-now";
import { isUnimplemented } from "@/lib/platform/surfaces";
import type { Environment, EnvironmentKey } from "@/lib/platform/types";

/**
 * Active or expired, derived from `expires_at` against a caller-supplied clock.
 *
 * The platform lists expired keys deliberately — "an operator whose worker has
 * stopped connecting needs to see the credential it is failing on"
 * (`internal/api/envkeys.go:102-106`) — so the console has to say which is
 * which. That is a rendering derivation, not domain logic (principle 4), but it
 * owns a clock, so `now` is a parameter rather than a `Date.now()` buried in a
 * branch.
 *
 * A null `expires_at` is a key that does not expire. Our platform assigns every
 * key a one-year lifetime today, so this arm is unreachable through issuance —
 * it exists because the column is nullable on the wire and a row that says
 * "never" must not read as "expired".
 */
export function environmentKeyState(
  expiresAt: string | null | undefined,
  now: number,
): "active" | "expired" {
  if (!expiresAt) return "active";
  const parsed = Date.parse(expiresAt);
  // An unparseable timestamp is not evidence of expiry.
  if (Number.isNaN(parsed)) return "active";
  return parsed <= now ? "expired" : "active";
}

/**
 * Whether this environment can be issued a key at all.
 *
 * The platform refuses both cases with a 400 — a non-`self_hosted` environment
 * because its work is run by the platform's own executor, which holds no
 * environment key, and an archived one outright
 * (`internal/api/consoleapi.go:200-205`). Hiding the control rather than
 * letting an operator discover the refusal mirrors the reference, and is a
 * client-side mirror of the wire rather than a rule stricter than it.
 */
export function canIssueEnvironmentKey(environment: Environment): boolean {
  return (
    environment.config.type === "self_hosted" && environment.archived_at == null
  );
}

/**
 * The environment-key section of the environment detail page — read-only here;
 * issuing and revoking arrive in slice 3.
 *
 * Rendered only for `self_hosted` environments, matching the reference: a cloud
 * environment has no worker to hold a key. An *archived* self-hosted
 * environment still shows its section, because the platform still serves and
 * still revokes those keys (`consoleapi.go:122-126`) — an operator who archives
 * an environment needs the credentials it handed out to be revocable, not
 * invisible.
 */
export function EnvironmentKeysSection({
  environment,
}: {
  environment: Environment;
}) {
  const selfHosted = environment.config.type === "self_hosted";
  const keys = useEnvironmentKeys(environment.id, selfHosted);
  // The repo's existing clock, rather than a `Date.now()` in render: it keeps
  // this component pure, and a key that expires while the page sits open flips
  // to Expired on its own instead of lying until a reload.
  const now = useNow();

  // Seam 6 — feature detection on a route that carries an id.
  //
  // `isUnimplemented` is documented as valid only on collection routes, because
  // elsewhere a 404 could be the id rather than the endpoint, and this route
  // carries an environment id. Two things can answer 404 here: the router
  // catch-all on a platform predating plan 30 (`server.go:152`), and
  // `consoleEnvironment` on an environment that is gone
  // (`consoleapi.go:127-142`).
  //
  // Having loaded the environment is not enough to rule the second one out —
  // an environment is mutable, and another operator can delete it while this
  // page is open, which would then render as "this deployment lacks the
  // feature". So the 404 is not read as feature-absence until a re-read of the
  // environment confirms it is still there. The re-read runs only on that
  // 404, so a platform that serves the surface never pays for it.
  const maybeUnimplemented =
    selfHosted && keys.error != null && isUnimplemented(keys.error);
  const stillExists = useEnvironmentStillExists(
    environment.id,
    maybeUnimplemented,
  );

  if (!selfHosted) return null;

  // Only a confirmed-live environment licenses hiding. A deleted one, or a
  // re-read that failed, keeps the error visible — the fail-safe direction,
  // since a wrongly shown error is a nuisance and a wrongly hidden surface is
  // a lie.
  if (maybeUnimplemented && stillExists.data === true) return null;
  // While the re-read is in flight the answer is not known yet; showing the
  // error and then hiding it would flash a failure that was never real.
  const deciding = maybeUnimplemented && stillExists.isPending;

  const columns: Column<EnvironmentKey>[] = [
    { key: "name", header: "Name", className: "w-full", cell: (k) => k.name },
    {
      key: "id",
      header: "ID",
      cell: (k) => (
        <span data-token-id={k.id}>
          <IdCode id={k.id} />
        </span>
      ),
    },
    {
      key: "created",
      header: "Created",
      cell: (k) => <Time iso={k.created_at} />,
    },
    {
      key: "expires",
      header: "Expires",
      cell: (k) => {
        const state = environmentKeyState(k.expires_at, now);
        return (
          <span
            className="flex items-center gap-2 whitespace-nowrap"
            data-expires-at={k.expires_at ?? ""}
            data-key-state={state}
          >
            <Time iso={k.expires_at} />
            {state === "expired" && (
              <Badge variant="outline" className="font-normal">
                Expired
              </Badge>
            )}
          </span>
        );
      },
    },
  ];

  const page = keys.data;
  return (
    <DetailSection title="Environment keys">
      <p className="pb-3 text-[13px] text-muted-foreground">
        An environment key lets a runner on your infrastructure connect to this
        environment and pull jobs. Generate one per host so you can revoke
        access individually.
      </p>
      {keys.error && !deciding ? (
        <ErrorState error={keys.error} />
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={page?.data ?? []}
            rowKey={(k) => k.id}
            loading={keys.isPending || deciding}
            empty={<EmptyState title="No environment keys yet." />}
          />
          {/* The platform caps a page at 100 and the console asks for exactly
              that (consoleapi.go:62), so this line is the only way an operator
              with more keys than that learns the list is not the whole list.
              A pager for a surface whose realistic size is "one per host" would
              be machinery nobody asked for; saying so plainly is not. */}
          {page?.pagination.has_more && (
            <p
              className="pt-2 text-[13px] text-muted-foreground"
              data-has-more="true"
              data-total-keys={page.pagination.total}
            >
              Showing the first {page.data.length} of {page.pagination.total}{" "}
              keys.
            </p>
          )}
        </>
      )}
    </DetailSection>
  );
}
