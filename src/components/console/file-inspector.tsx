"use client";

import { SyntaxCode, fileLanguage } from "./syntax-code";
import { useState, type ComponentProps } from "react";
import { FileText, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFile, useFileText } from "@/lib/platform/queries";
import type { PlatformFile } from "@/lib/platform/types";
import { DetailSkeleton, ErrorState, Time } from "./bits";
import { Field, JsonBlock } from "./detail";
import { CopyIdButton } from "./copy-id";
import { FileSize, ResourceDate } from "./library-format";
import { ResourceDownload } from "./resource-download";
import { ResourceInspector } from "./resource-inspector";
import { PlaygroundViewSwitch } from "./playground-view-switch";

export const fileContentPath = (id: string) =>
  "v1/files/" + encodeURIComponent(id) + "/content";

function FileContent({ file }: { file: PlatformFile }) {
  const preview =
    file.downloadable &&
    file.size_bytes <= 1024 * 1024 &&
    /^(text\/|application\/(json|xml)(;|$))/i.test(file.mime_type);
  const content = useFileText(file.id, preview);
  if (preview && content.error) return <ErrorState error={content.error} />;
  if (preview && content.isPending) return <DetailSkeleton />;
  if (preview)
    return (
      <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted p-3 text-xs">
        <SyntaxCode language={fileLanguage(file.mime_type, file.filename)}>
          {content.data}
        </SyntaxCode>
      </pre>
    );
  return (
    <p className="flex items-center gap-2 rounded-xl border p-3 text-sm">
      <Info className="size-4 shrink-0 text-muted-foreground" />
      {file.downloadable
        ? "Download this file to view its contents."
        : "Only agent-generated files can be downloaded."}
    </p>
  );
}

function FileDetail({ id }: { id: string }) {
  const [view, setView] = useState<"Rendered" | "API">("Rendered");
  const { data, error } = useFile(id);
  if (error) return <ErrorState error={error} />;
  if (!data) return <DetailSkeleton />;
  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="flex min-w-0 items-center gap-2 break-all text-sm font-medium">
          <FileText className="size-4 shrink-0" />
          {data.filename}
        </h2>
        {data.downloadable ? (
          <ResourceDownload
            className="rounded-md bg-secondary px-2 py-1 text-xs"
            path={fileContentPath(id)}
            filename={data.filename}
          >
            Download
          </ResourceDownload>
        ) : (
          <Button size="sm" variant="secondary" disabled>
            Download
          </Button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {view === "API" ? (
          <JsonBlock value={data} />
        ) : (
          <>
            <dl className="mb-6 grid grid-cols-[minmax(64px,25%)_1fr] gap-y-2 text-xs">
              <Field label="ID">
                <CopyIdButton showValue id={id} />
              </Field>
              <Field label="Type">
                <code>{data.mime_type}</code>
              </Field>
              <Field label="Size">
                <FileSize bytes={data.size_bytes} />
              </Field>
              <Field label="Created">
                <ResourceDate iso={data.created_at} />
              </Field>
              <Field label="Expires">
                {data.expires_at ? <Time iso={data.expires_at} /> : "None"}
              </Field>
            </dl>
            <h3 className="mb-2 text-sm font-medium">Preview</h3>
            <FileContent file={data} />
          </>
        )}
      </div>
      <div className="flex justify-end pt-3">
        <PlaygroundViewSwitch
          label="Pane view"
          options={["Rendered", "API"]}
          value={view}
          onChange={setView}
        />
      </div>
    </div>
  );
}

export function FileInspector(
  props: Omit<ComponentProps<typeof ResourceInspector>, "kind" | "children">,
) {
  return (
    <ResourceInspector {...props} kind="file">
      <FileDetail key={props.id} id={props.id} />
    </ResourceInspector>
  );
}
