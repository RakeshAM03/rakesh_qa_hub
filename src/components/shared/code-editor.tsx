"use client";

import { useEffect, useMemo, useRef } from "react";
import dynamic from "next/dynamic";
import { useTheme } from "next-themes";
import type { ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { EditorView, Decoration, type DecorationSet } from "@codemirror/view";
import { StateEffect, StateField, type Extension } from "@codemirror/state";
import { html } from "@codemirror/lang-html";
import { java } from "@codemirror/lang-java";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const CodeMirror = dynamic(() => import("@uiw/react-codemirror"), {
  ssr: false,
  loading: () => <Skeleton className="h-full min-h-40 w-full" />,
});

export type CodeLanguage = "html" | "java" | "typescript" | "json" | "text";

const LANGS: Record<CodeLanguage, () => Extension[]> = {
  html: () => [html()],
  java: () => [java()],
  typescript: () => [javascript({ typescript: true })],
  json: () => [json()],
  text: () => [],
};

// ---- highlighted line (used by the converter's review notes) ----

const setHighlight = StateEffect.define<number | null>();
const highlightMark = Decoration.line({ class: "cm-review-line" });

const highlightField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    for (const e of tr.effects) {
      if (e.is(setHighlight)) {
        const line = e.value;
        if (line === null || line < 1 || line > tr.state.doc.lines) return Decoration.none;
        return Decoration.set([highlightMark.range(tr.state.doc.line(line).from)]);
      }
    }
    return deco.map(tr.changes);
  },
  provide: (f) => EditorView.decorations.from(f),
});

const baseTheme = EditorView.theme({
  "&": { fontSize: "13px", height: "100%", backgroundColor: "transparent" },
  ".cm-scroller": { fontFamily: "var(--font-mono, ui-monospace, monospace)" },
  ".cm-gutters": { backgroundColor: "transparent", borderRight: "1px solid var(--border)" },
  ".cm-review-line": { backgroundColor: "color-mix(in oklab, #f59e0b 22%, transparent)" },
  "&.cm-focused": { outline: "none" },
});

type CodeEditorProps = {
  value: string;
  onChange?: (value: string) => void;
  language: CodeLanguage;
  placeholder?: string;
  readOnly?: boolean;
  /** Accessible name for the editable area. */
  ariaLabel: string;
  className?: string;
  /** 1-based line to highlight and scroll to. */
  highlightLine?: number | null;
  minHeight?: string;
  maxHeight?: string;
  onKeyDown?: (e: React.KeyboardEvent) => void;
};

/** CodeMirror 6 editor with syntax highlighting, following the app's light/dark mode. */
export function CodeEditor({
  value,
  onChange,
  language,
  placeholder,
  readOnly,
  ariaLabel,
  className,
  highlightLine = null,
  minHeight = "12rem",
  maxHeight = "32rem",
  onKeyDown,
}: CodeEditorProps) {
  const { resolvedTheme } = useTheme();
  const ref = useRef<ReactCodeMirrorRef>(null);
  const extensions = useMemo(
    () => [
      ...LANGS[language](),
      baseTheme,
      highlightField,
      EditorView.lineWrapping,
      EditorView.contentAttributes.of({ "aria-label": ariaLabel }),
    ],
    [language, ariaLabel],
  );

  useEffect(() => {
    const view = ref.current?.view;
    if (!view) return;
    const effects: StateEffect<unknown>[] = [setHighlight.of(highlightLine)];
    if (highlightLine && highlightLine <= view.state.doc.lines) {
      effects.push(EditorView.scrollIntoView(view.state.doc.line(highlightLine).from, { y: "center" }));
    }
    view.dispatch({ effects });
  }, [highlightLine, value]);

  return (
    <div
      className={cn("overflow-hidden rounded-lg border border-neutral-200 bg-card", className)}
      onKeyDown={onKeyDown}
    >
      <CodeMirror
        ref={ref}
        value={value}
        onChange={onChange}
        extensions={extensions}
        theme={resolvedTheme === "dark" ? "dark" : "light"}
        placeholder={placeholder}
        readOnly={readOnly}
        editable={!readOnly}
        minHeight={minHeight}
        maxHeight={maxHeight}
        basicSetup={{ foldGutter: false, highlightActiveLine: !readOnly, autocompletion: false }}
      />
    </div>
  );
}
