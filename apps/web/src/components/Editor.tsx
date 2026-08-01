import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { bracketMatching, foldGutter, indentOnInput, indentUnit } from "@codemirror/language";
import { lintGutter } from "@codemirror/lint";
import { EditorState } from "@codemirror/state";
import { EditorView, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers } from "@codemirror/view";
import { useEffect, useRef } from "react";
import { pseudoGoEditorExtensions } from "@/lib/codemirror/pseudogo-theme";
import { pseudoGoLanguage } from "@/lib/codemirror/pseudogo-language";
import { pseudoGoLinter } from "@/lib/codemirror/pseudogo-lint";

export interface EditorProps {
  value: string;
  onChange: (value: string) => void;
  /** Called once with the underlying EditorView, for imperative access
   * (e.g. jumping to a line when a console error is clicked). Optional. */
  onViewReady?: (view: EditorView) => void;
}

export function Editor({ value, onChange, onViewReady }: EditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  // Avoids feeding a change back into CodeMirror that originated from
  // CodeMirror itself (would otherwise fight the cursor position).
  const lastValueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!containerRef.current) return;

    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        foldGutter(),
        bracketMatching(),
        indentOnInput(),
        indentUnit.of("\t"),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        pseudoGoLanguage,
        ...pseudoGoEditorExtensions,
        lintGutter(),
        pseudoGoLinter,
        EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            const next = update.state.doc.toString();
            lastValueRef.current = next;
            onChangeRef.current(next);
          }
        }),
      ],
    });

    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;
    onViewReady?.(view);

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Intentionally created once; external value changes are synced via the
    // effect below rather than recreated here (recreating would drop undo
    // history and cursor position on every keystroke).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync external value changes (loading an example, a shared link, etc.)
  // without disturbing the view when the change originated from typing.
  useEffect(() => {
    const view = viewRef.current;
    if (!view || value === lastValueRef.current) return;
    lastValueRef.current = value;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
    });
  }, [value]);

  return <div ref={containerRef} className="h-full min-h-0 overflow-auto" />;
}
