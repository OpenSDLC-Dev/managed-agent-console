import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { SchemaTextarea } from "./schema-textarea";
import "@testing-library/jest-dom/vitest";
afterEach(cleanup);
function Form() {
  const [value, setValue] = useState("{}");
  return (
    <>
      <SchemaTextarea
        aria-label="Schema"
        value={value}
        onValueChange={setValue}
      />
      <button>Next</button>
    </>
  );
}
it("inserts indentation, retains the caret, and exits on Escape then Tab", async () => {
  const user = userEvent.setup();
  render(<Form />);
  const editor = screen.getByLabelText("Schema") as HTMLTextAreaElement;
  editor.focus();
  editor.setSelectionRange(1, 1);
  await user.tab();
  expect(editor).toHaveValue("{  }");
  expect(editor).toHaveFocus();
  expect(editor.selectionStart).toBe(3);
  await user.keyboard("[Escape]");
  await user.tab();
  expect(screen.getByRole("button")).toHaveFocus();
  await user.tab({ shift: true });
  editor.setSelectionRange(3, 3);
  await user.tab();
  expect(editor).toHaveFocus();
  expect(editor).toHaveValue("{    }");
});
it("replaces selected text and consumes Escape before a surrounding dialog", () => {
  const close = vi.fn();
  render(
    <div onKeyDown={close}>
      <Form />
    </div>,
  );
  const editor = screen.getByLabelText("Schema") as HTMLTextAreaElement;
  editor.focus();
  editor.setSelectionRange(0, 2);
  fireEvent.keyDown(editor, { key: "Tab" });
  expect(editor).toHaveValue("  ");
  expect(editor.selectionStart).toBe(2);
  close.mockClear();
  fireEvent.keyDown(editor, { key: "Escape" });
  expect(close).not.toHaveBeenCalled();
  fireEvent.keyDown(editor, { key: "ArrowLeft" });
  fireEvent.keyDown(editor, { key: "Tab" });
  expect(editor).toHaveValue("    ");
});
it("keeps modified Tab and composition available to the browser", () => {
  const change = vi.fn();
  render(
    <SchemaTextarea aria-label="Schema" value="{}" onValueChange={change} />,
  );
  const editor = screen.getByLabelText("Schema");
  for (const options of [
    { shiftKey: true },
    { ctrlKey: true },
    { metaKey: true },
    { altKey: true },
    { isComposing: true },
  ])
    fireEvent.keyDown(editor, { key: "Tab", ...options });
  expect(change).not.toHaveBeenCalled();
});

it("synchronizes successful native insertion without replacing the value", () => {
  const change = vi.fn();
  render(
    <SchemaTextarea aria-label="Schema" value="{}" onValueChange={change} />,
  );
  const editor = screen.getByLabelText("Schema") as HTMLTextAreaElement;
  const original = document.execCommand;
  const command = vi.fn(() => {
    editor.value = "{  }";
    return true;
  });
  document.execCommand = command;
  try {
    fireEvent.keyDown(editor, { key: "Tab" });
    expect(command).toHaveBeenCalledWith("insertText", false, "  ");
    expect(change).toHaveBeenCalledWith("{  }");
  } finally {
    document.execCommand = original;
  }
});
