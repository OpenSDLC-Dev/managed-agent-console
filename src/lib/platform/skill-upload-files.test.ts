import { expect, it } from "vitest";
import { droppedSkillFiles, skillUploadFiles } from "./skill-upload-files";

it("sends archives unchanged and preserves the platform fallback for a loose manifest without a name", async () => {
  const archive = new File(["PK"], "demo.skill");
  expect(await skillUploadFiles([archive])).toEqual([archive]);
  const manifest = new File(
    ["---\ndescription: Instruction text.\n---"],
    "SKILL.md",
  );
  const [wrapped] = await skillUploadFiles([manifest]);
  expect(wrapped.name).toBe("skill/SKILL.md");
  expect(await wrapped.text()).toBe(await manifest.text());
});

it("reads every directory batch and preserves nested relative paths in a drop", async () => {
  const fileEntry = (path: string) => ({
    isFile: true,
    fullPath: "/" + path,
    file: (accept: (file: File) => void) =>
      accept(new File(["notes"], path.split("/").at(-1)!)),
  });
  const folder = (batches: unknown[][]) => ({
    isDirectory: true,
    isFile: false,
    createReader() {
      let index = 0;
      return {
        readEntries: (accept: (items: unknown[]) => void) =>
          accept(batches[index++] ?? []),
      };
    },
  });
  const root = folder([
    [fileEntry("notes/SKILL.md")],
    [folder([[fileEntry("notes/examples/intro.md")]])],
  ]);
  const transfer = {
    items: [{ kind: "file", webkitGetAsEntry: () => root }],
  } as unknown as DataTransfer;
  const files = await droppedSkillFiles(transfer);
  expect(files.map((file) => file.name)).toEqual([
    "notes/SKILL.md",
    "notes/examples/intro.md",
  ]);
  expect(await skillUploadFiles(files)).toEqual(files);
});

it("accepts flat drops when an entry API is unavailable", async () => {
  const file = new File(["hi"], "SKILL.md");
  expect(
    await droppedSkillFiles({ files: [file] } as unknown as DataTransfer),
  ).toEqual([file]);
  expect(
    await droppedSkillFiles({
      items: [{ kind: "file", getAsFile: () => file }],
    } as unknown as DataTransfer),
  ).toEqual([file]);
});
