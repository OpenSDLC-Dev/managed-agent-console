"use client";

import { use } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Breadcrumb } from "@/components/console/breadcrumb";
import { RedactMemoryVersion } from "@/components/console/redact-memory-version";
import { IdCell } from "@/components/console/copy-id";
import { DetailSection, Field, FieldList } from "@/components/console/detail";
import { DetailSkeleton, ErrorState, Time } from "@/components/console/bits";
import { PlatformError } from "@/lib/platform/http";
import { useMemoryVersion } from "@/lib/platform/queries";
import type { MemoryActor } from "@/lib/platform/types";

function actorLabel(actor: MemoryActor | null) {
  if (!actor) return "—";
  if (actor.type === "session_actor") return `session · ${actor.session_id}`;
  if (actor.type === "api_actor") return `API key · ${actor.api_key_id}`;
  if (actor.type === "user_actor") return `user · ${actor.user_id}`;
  return `service account · ${actor.service_account_id}`;
}

const mismatchError = new PlatformError(404, {
  type: "error",
  error: { type: "not_found_error", message: "memory version not found" },
});

export default function MemoryVersionPage({
  params,
}: {
  params: Promise<{ id: string; versionId: string }>;
}) {
  const { id, versionId } = use(params);
  const query = useMemoryVersion(id, versionId);
  if (query.error) return <ErrorState error={query.error} />;
  if (query.isPending || !query.data) return <DetailSkeleton />;
  const version = query.data;
  if (version.memory_store_id !== id)
    return <ErrorState error={mismatchError} />;
  return (
    <div>
      <Breadcrumb
        parent={{ href: `/memory-stores/${id}`, label: "Memory store" }}
        current={version.id}
      />
      <PageHeader
        title="Memory version"
        subtitle={version.id}
        actions={
          version.redacted_at ? (
            <Badge variant="outline">redacted</Badge>
          ) : (
            <RedactMemoryVersion storeId={id} versionId={version.id} />
          )
        }
      />
      <DetailSection title="Overview">
        <FieldList>
          <Field label="ID">
            <IdCell id={version.id} />
          </Field>
          <Field label="Memory">
            <Link
              className="hover:underline"
              href={`/memory-stores/${id}/memories/${version.memory_id}`}
            >
              {version.memory_id}
            </Link>
          </Field>
          <Field label="Operation">
            <Badge variant="outline">{version.operation}</Badge>
          </Field>
          <Field label="Path">{version.path ?? "Redacted"}</Field>
          <Field label="Size">
            {version.content_size_bytes === null
              ? "—"
              : `${version.content_size_bytes.toLocaleString()} bytes`}
          </Field>
          <Field label="SHA-256">
            <span className="break-all font-mono text-[12px]">
              {version.content_sha256 ?? "—"}
            </span>
          </Field>
          <Field label="Created by">{actorLabel(version.created_by)}</Field>
          <Field label="Created">
            <Time iso={version.created_at} />
          </Field>
          {version.redacted_at && (
            <Field label="Redacted">
              <Time iso={version.redacted_at} /> ·{" "}
              {actorLabel(version.redacted_by)}
            </Field>
          )}
        </FieldList>
      </DetailSection>
      <DetailSection title="Content" testId="memory-version-content">
        <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap rounded-lg border bg-card p-4 font-mono text-[13px] leading-relaxed">
          {version.content ??
            (version.redacted_at
              ? "Redacted"
              : "No content for this operation")}
        </pre>
      </DetailSection>
    </div>
  );
}
