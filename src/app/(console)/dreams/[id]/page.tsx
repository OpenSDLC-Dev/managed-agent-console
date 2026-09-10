"use client";

import { use } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { Breadcrumb } from "@/components/console/breadcrumb";
import { DreamActions } from "@/components/console/dream-actions";
import { DetailSection, Field, FieldList } from "@/components/console/detail";
import { IdCell } from "@/components/console/copy-id";
import {
  ArchivedBadge,
  DetailSkeleton,
  ErrorState,
  StatusBadge,
  Time,
} from "@/components/console/bits";
import { useDream } from "@/lib/platform/queries";

export default function DreamDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const query = useDream(id);

  if (query.error) return <ErrorState error={query.error} />;
  if (query.isPending || !query.data) return <DetailSkeleton />;
  const dream = query.data;
  const memoryInput = dream.inputs.find(
    (input) => input.type === "memory_store",
  );
  const sessionInput = dream.inputs.find((input) => input.type === "sessions");

  return (
    <div>
      <Breadcrumb
        parent={{ href: "/dreams", label: "Dreams" }}
        current={dream.id}
      />
      <PageHeader
        title={dream.id}
        subtitle="Asynchronous memory consolidation"
        actions={
          <span className="flex items-center gap-2">
            <ArchivedBadge archivedAt={dream.archived_at} />
            <DreamActions dream={dream} />
          </span>
        }
      />
      <DetailSection title="Overview">
        <FieldList>
          <Field label="ID">
            <IdCell id={dream.id} />
          </Field>
          <Field label="Status">
            <span data-status={dream.archived_at ? "archived" : dream.status}>
              <StatusBadge
                status={dream.archived_at ? "archived" : dream.status}
              />
            </span>
          </Field>
          <Field label="Model">
            {dream.model.id}
            {dream.model.speed ? ` · ${dream.model.speed}` : ""}
          </Field>
          <Field label="Created">
            <Time iso={dream.created_at} />
          </Field>
          <Field label="Ended">
            <Time iso={dream.ended_at} />
          </Field>
          <Field label="Archived">
            <Time iso={dream.archived_at} />
          </Field>
        </FieldList>
      </DetailSection>
      <DetailSection title="Inputs" testId="dream-inputs">
        <FieldList>
          <Field label="Memory store">
            {memoryInput ? (
              <Link
                className="font-mono hover:underline"
                href={`/memory-stores/${memoryInput.memory_store_id}`}
              >
                {memoryInput.memory_store_id}
              </Link>
            ) : (
              "—"
            )}
          </Field>
          <Field label="Sessions">
            <span
              className="flex flex-wrap gap-x-3 gap-y-1"
              data-session-count={sessionInput?.session_ids.length ?? 0}
            >
              {sessionInput?.session_ids.map((sessionId) => (
                <Link
                  key={sessionId}
                  className="font-mono hover:underline"
                  href={`/sessions/${sessionId}`}
                >
                  {sessionId}
                </Link>
              )) ?? "—"}
            </span>
          </Field>
          <Field label="Instructions">{dream.instructions || "—"}</Field>
        </FieldList>
      </DetailSection>
      <DetailSection title="Output">
        <FieldList>
          <Field label="Behavior">
            {dream.output_behavior.type === "create_new"
              ? "Create a new memory store"
              : "Update the input store"}
          </Field>
          <Field label="Memory stores">
            <span
              className="flex flex-wrap gap-x-3 gap-y-1"
              data-output-count={dream.outputs.length}
            >
              {dream.outputs.length
                ? dream.outputs.map((output) => (
                    <Link
                      key={output.memory_store_id}
                      className="font-mono hover:underline"
                      href={`/memory-stores/${output.memory_store_id}`}
                    >
                      {output.memory_store_id}
                    </Link>
                  ))
                : "—"}
            </span>
          </Field>
          <Field label="Pipeline session">
            {dream.session_id ? (
              <Link
                className="font-mono hover:underline"
                href={`/sessions/${dream.session_id}`}
              >
                {dream.session_id}
              </Link>
            ) : (
              "—"
            )}
          </Field>
        </FieldList>
      </DetailSection>
      <DetailSection title="Usage" testId="dream-usage">
        <FieldList>
          <Field label="Input tokens">
            <span data-input-tokens={dream.usage.input_tokens}>
              {dream.usage.input_tokens.toLocaleString()}
            </span>
          </Field>
          <Field label="Output tokens">
            <span data-output-tokens={dream.usage.output_tokens}>
              {dream.usage.output_tokens.toLocaleString()}
            </span>
          </Field>
          <Field label="Cache read">
            <span data-cache-read-tokens={dream.usage.cache_read_input_tokens}>
              {dream.usage.cache_read_input_tokens.toLocaleString()}
            </span>
          </Field>
          <Field label="Cache creation">
            <span
              data-cache-creation-tokens={
                dream.usage.cache_creation_input_tokens
              }
            >
              {dream.usage.cache_creation_input_tokens.toLocaleString()}
            </span>
          </Field>
        </FieldList>
      </DetailSection>
      {dream.error && (
        <DetailSection title="Error" testId="dream-error">
          <p className="text-sm text-destructive">
            <span className="font-mono">{dream.error.type}</span> ·{" "}
            {dream.error.message}
          </p>
        </DetailSection>
      )}
    </div>
  );
}
