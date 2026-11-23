import { parseDocument } from "yaml";

// Directory pickers supply webkitRelativePath. A loose SKILL.md needs the same
// top-level directory on the wire (internal/skills/skills.go:FromFiles).
export async function skillUploadFiles(files: File[]): Promise<File[]> {
  const manifest = files.find(
    (file) => file.name === "SKILL.md" && !file.webkitRelativePath,
  );
  if (!manifest) return files;
  const frontmatter = /^\uFEFF?---\r?\n([\s\S]*?)^---\r?$/m.exec(
    await manifest.text(),
  );
  const parsed =
    frontmatter && parseDocument(frontmatter[1], { logLevel: "silent" });
  const name = parsed?.get("name");
  // The platform derives a missing name from the directory. Keep validation
  // there, including any error for malformed frontmatter or an invalid name.
  const directory =
    typeof name === "string" && /^[a-z0-9-]+$/.test(name) ? name : "skill";
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
