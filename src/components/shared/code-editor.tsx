"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useTheme } from "next-themes";
import { EditorView, Decoration, type DecorationSet } from "@codemirror/view";
import { StateEffect, StateField, type Extension } from "@codemirror/state";
import { defaultHighlightStyle, HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { html } from "@codemirror/lang-html";
import { java } from "@codemirror/lang-java";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { oneDark } from "@codemirror/theme-one-dark";

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

/**
 * CodeMirror's default light syntax colours, except three that fall below 4.5:1
 * contrast (on white or the active-line tint): darker versions of the same hues.
 */
const LIGHT_FIXES: Record<string, string> = { "#085": "#006b42", "#e40": "#b42d00", "#f00": "#c00000" };
const lightHighlighting = syntaxHighlighting(
  HighlightStyle.define(defaultHighlightStyle.specs.map((spec) => (spec.color && LIGHT_FIXES[spec.color] ? { ...spec, color: LIGHT_FIXES[spec.color] } : spec))),
);

const baseTheme = EditorView.theme({
  "&": { fontSize: "13px", height: "100%", backgroundColor: "transparent" },
  ".cm-scroller": { fontFamily: "var(--font-mono, ui-monospace, monospace)" },
  ".cm-gutters": { backgroundColor: "transparent", borderRight: "1px solid var(--border)" },
  "&.cm-editor, & .cm-scroller": { backgroundColor: "transparent" },
  // Readable line numbers in both modes (the app remaps neutral-600 for dark mode).
  "&.cm-editor .cm-gutters": { color: "var(--color-neutral-600)" },
  "&.cm-editor .cm-placeholder": { color: "var(--color-neutral-600)" },
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
  // The editor loads lazily, so remember its view once created (a highlight may be requested before that).
  const [view, setView] = useState<EditorView | null>(null);
  const dark = resolvedTheme === "dark";
  const extensions = useMemo(
    () => [
      ...LANGS[language](),
      ...(dark ? [] : [lightHighlighting]),
      baseTheme,
      highlightField,
      EditorView.lineWrapping,
      EditorView.contentAttributes.of({ "aria-label": ariaLabel }),
    ],
    [language, ariaLabel, dark],
  );

  useEffect(() => {
    if (!view) return;
    const effects: StateEffect<unknown>[] = [setHighlight.of(highlightLine)];
    if (highlightLine && highlightLine <= view.state.doc.lines) {
      effects.push(EditorView.scrollIntoView(view.state.doc.line(highlightLine).from, { y: "center" }));
    }
    view.dispatch({ effects });
  }, [view, highlightLine, value]);

  return (
    <div
      className={cn("overflow-hidden rounded-lg border border-neutral-200 bg-card", className)}
      onKeyDown={onKeyDown}
    >
      <CodeMirror
        onCreateEditor={setView}
        value={value}
        onChange={onChange}
        extensions={extensions}
        theme={dark ? oneDark : "light"}
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
