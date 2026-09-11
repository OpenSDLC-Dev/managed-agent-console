"use client";

import { useLayoutEffect, useRef, type ComponentProps } from "react";

type Props = Omit<
  ComponentProps<"textarea">,
  "value" | "onChange" | "onKeyDown"
> & {
  value: string;
  onValueChange: (value: string) => void;
};

/** A JSON draft editor that lets keyboard users indent without trapping focus. */
export function SchemaTextarea({ value, onValueChange, ...props }: Props) {
  const input = useRef<HTMLTextAreaElement>(null);
  const exitOnTab = useRef(false);
  const caret = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (caret.current !== null) {
      input.current?.setSelectionRange(caret.current, caret.current);
      caret.current = null;
    }
  }, [value]);
  return (
    <textarea
      {...props}
      ref={input}
      value={value}
      onBlur={() => {
        exitOnTab.current = false;
      }}
      onChange={(event) => onValueChange(event.target.value)}
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing) return;
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          exitOnTab.current = true;
          return;
        }
        const leave = exitOnTab.current;
        exitOnTab.current = false;
        if (
          event.key !== "Tab" ||
          leave ||
          event.shiftKey ||
          event.ctrlKey ||
          event.metaKey ||
          event.altKey
        )
          return;
        event.preventDefault();
        const element = event.currentTarget;
        const next =
          value.slice(0, element.selectionStart) +
          "  " +
          value.slice(element.selectionEnd);
        const position = element.selectionStart + 2;
        if (next === value) element.setSelectionRange(position, position);
        else {
          caret.current = position;
          onValueChange(next);
        }
      }}
    />
  );
}
