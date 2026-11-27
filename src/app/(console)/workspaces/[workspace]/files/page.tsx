"use client";

import { Suspense, useState } from "react";
import { Download, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getFile, useFiles, useUploadFile } from "@/lib/platform/queries";
import { useCursorPage } from "@/lib/platform/use-cursor-page";
import type { PlatformFile } from "@/lib/platform/types";
import type { Column } from "@/components/console/data-table";
import { IdCell } from "@/components/console/copy-id";
import {
  FileInspector,
  fileContentPath,
} from "@/components/console/file-inspector";
import { FileSize, ResourceDate } from "@/components/console/library-format";
import { ResourceDownload } from "@/components/console/resource-download";
import {
  LibraryRowMenu,
  ResourceLibrary,
} from "@/components/console/resource-library";
import { ResourceUploadDialog } from "@/components/console/resource-upload-dialog";

const columns: Column<PlatformFile>[] = [
  { key: "id", header: "ID", cell: (file) => <IdCell id={file.id} full /> },
  {
    key: "name",
    header: "Name",
    className: "w-full",
    cell: (file) => file.filename,
  },
  {
    key: "size",
    header: "Size",
    cell: (file) => <FileSize bytes={file.size_bytes} />,
  },
  {
    key: "created",
    header: "Created",
    cell: (file) => <ResourceDate iso={file.created_at} />,
  },
  {
    key: "expires",
    header: "Expires",
    cell: (file) =>
      file.expires_at ? <ResourceDate iso={file.expires_at} /> : "—",
  },
];

function FileUploadButton({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const upload = useUploadFile();
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Upload />
        Upload file
      </Button>
      {open && (
        <ResourceUploadDialog
          mode="file"
          onClose={() => setOpen(false)}
          onSubmit={async ([file]) => {
            await upload.mutateAsync(file);
            toast.success("File uploaded");
            onCreated();
          }}
        />
      )}
    </>
  );
}
function FilesList() {
  const page = useCursorPage("files");
  const list = useFiles(page.page);
  return (
    <ResourceLibrary
      kind="file"
      title="Files"
      description="Upload and manage files to use with the API."
      page={page}
      list={list}
      getRecord={getFile}
      columns={columns}
      name={(file) => file.filename}
      UploadButton={FileUploadButton}
      action={(file, remove) => (
        <div className="inline-flex items-center gap-1">
          {file.downloadable ? (
            <ResourceDownload
              aria-label={"Download " + file.filename}
              className="inline-flex size-6 items-center justify-center text-muted-foreground"
              onClick={(event) => event.stopPropagation()}
              path={fileContentPath(file.id)}
              filename={file.filename}
            >
              <Download className="size-3.5" />
            </ResourceDownload>
          ) : (
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={"Download " + file.filename}
              disabled
            >
              <Download />
            </Button>
          )}
          <LibraryRowMenu name={file.filename} onDelete={remove} />
        </div>
      )}
      Inspector={FileInspector}
    />
  );
}
export default function FilesPage() {
  return (
    <Suspense>
      <FilesList />
    </Suspense>
  );
}
