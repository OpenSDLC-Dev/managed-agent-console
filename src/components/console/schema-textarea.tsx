"use client";

import { useLayoutEffect, useRef, type ComponentProps } from "react";

import { SyntaxCode, highlightLimit, type SyntaxLanguage } from "./syntax-code";

type Props = Omit<
  ComponentProps<"textarea">,
  "value" | "onChange" | "onKeyDown"
> & {
  value: string;
  onValueChange: (value: string) => void;
  indentWithTab?: boolean;
  language?: SyntaxLanguage;
};

/** A JSON draft editor that lets keyboard users indent without trapping focus. */
export function SchemaTextarea({
  value,
  onValueChange,
  indentWithTab = true,
  language,
  ...props
}: Props) {
  const input = useRef<HTMLTextAreaElement>(null);
  const mirror = useRef<HTMLPreElement>(null);
  const highlight = Boolean(language && value.length <= highlightLimit);
  useLayoutEffect(() => {
    const field = input.current;
    const preview = mirror.current;
    if (!field || !preview) return;
    const sync = () => {
      // clientWidth/Height exclude the native scrollbars on Windows and Linux.
      preview.style.width = field.clientWidth + "px";
      preview.style.height = field.clientHeight + "px";
      preview.style.left = field.offsetLeft + field.clientLeft + "px";
      preview.style.top = field.offsetTop + field.clientTop + "px";
      preview.scrollLeft = field.scrollLeft;
      preview.scrollTop = field.scrollTop;
    };
    sync();
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(sync);
    observer?.observe(field);
    field.addEventListener("scroll", sync);
    return () => {
      observer?.disconnect();
      field.removeEventListener("scroll", sync);
    };
  }, [highlight]);
  const exitOnTab = useRef(false);
  const caret = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (caret.current !== null) {
      input.current?.setSelectionRange(caret.current, caret.current);
      caret.current = null;
    }
  }, [value]);
  const textarea = (
    <textarea
      {...props}
      ref={input}
      data-syntax-input={highlight || undefined}
      value={value}
      onBlur={() => {
        exitOnTab.current = false;
      }}
      onChange={(event) => onValueChange(event.target.value)}
      onKeyDown={(event) => {
        if (
          !indentWithTab ||
          props.readOnly ||
          props.disabled ||
          event.nativeEvent.isComposing
        )
          return;
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
        // Native insertion retains undo history; direct value replacement does not.
        // execCommand is deprecated, but textarea undo has no replacement API yet.
        if (element.ownerDocument.execCommand?.("insertText", false, "  ")) {
          onValueChange(element.value);
          return;
        }
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
  // Keep the native control mounted across the size limit to retain focus, undo and selection.
  if (!language) return textarea;
  return (
    <div className="syntax-editor">
      {textarea}
      {highlight && (
        <pre
          aria-hidden="true"
          ref={mirror}
          className={props.className}
          data-wrap={props.wrap}
        >
          <SyntaxCode language={language}>{value}</SyntaxCode>
          {"\n"}
        </pre>
      )}
    </div>
  );
}
