import { parse } from "yaml";

function manifestDirectory(text: string): string {
  const block = /^\uFEFF?---\r?\n([\s\S]*?)^---\r?$/m.exec(text);
  if (block) {
    try {
      // Platform decodes name into a Go string. Preserve scalar spelling for
      // valid names such as 00125 and true, including through YAML aliases.
      const metadata = parse(block[1], {
        schema: "failsafe",
        merge: true,
        logLevel: "silent",
      });
      if (
        typeof metadata?.name === "string" &&
        /^[a-z0-9-]+$/.test(metadata.name)
      )
        return metadata.name;
    } catch {
      // The platform returns bundle validation errors to the upload dialog.
    }
  }
  return "skill";
}

// Directory pickers supply webkitRelativePath. A loose SKILL.md needs the same
// top-level directory on the wire (internal/skills/skills.go:FromFiles).
export async function skillUploadFiles(files: File[]): Promise<File[]> {
  const manifest = files.find(
    (file) => file.name === "SKILL.md" && !file.webkitRelativePath,
  );
  if (!manifest) return files;
  // The platform derives a missing name from the directory. Keep validation
  // there, including any error for malformed frontmatter or an invalid name.
  const directory = manifestDirectory(await manifest.text());
  return files.map((file) =>
    file.webkitRelativePath || file.name.includes("/")
      ? file
      : new File([file], directory + "/" + file.name, {
          type: file.type,
          lastModified: file.lastModified,
        }),
  );
}

async function readEntry(entry: FileSystemEntry): Promise<File[]> {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) =>
      (entry as FileSystemFileEntry).file(resolve, reject),
    );
    return [
      new File([file], entry.fullPath.replace(/^\//, ""), {
        type: file.type,
        lastModified: file.lastModified,
      }),
    ];
  }
  const reader = (entry as FileSystemDirectoryEntry).createReader();
  const files: File[] = [];
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
      reader.readEntries(resolve, reject),
    );
    if (!batch.length) return files;
    for (const child of batch) files.push(...(await readEntry(child)));
  }
}

export async function droppedSkillFiles(
  transfer: DataTransfer,
): Promise<File[]> {
  // DataTransfer items are protected after the drop handler first yields.
  const items = Array.from(transfer.items ?? []).filter(
    (item) => item.kind === "file",
  );
  if (!items.length) return Array.from(transfer.files);
  const selections = items.map((item) => {
    const entry = item.webkitGetAsEntry?.();
    if (entry?.isDirectory) return readEntry(entry);
    const file = item.getAsFile();
    return file ? [file] : [];
  });
  return (await Promise.all(selections)).flat();
}
