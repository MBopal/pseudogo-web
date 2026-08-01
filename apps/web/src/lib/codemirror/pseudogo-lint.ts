/**
 * Live linting: re-runs @pseudogo/lang's lexer -> parser -> semantic
 * analyzer on every debounced edit (debouncing is @codemirror/lint's own
 * built-in behavior, configured via `delay` below) and surfaces the result
 * as a CodeMirror diagnostic.
 *
 * The interpreter fails fast -- lexing/parsing/analysis all throw the
 * *first* PseudoError they hit and stop, rather than collecting a list --
 * so there is only ever one diagnostic to show at a time. This deliberately
 * mirrors the CLI's own "Phase: Line N: message" behavior exactly; the
 * point of live linting is to show that same message sooner, not to
 * invent a different (collect-everything) error-reporting model.
 *
 * This never touches the evaluator -- only lex/parse/analyze, all pure,
 * synchronous, DOM-free functions -- so live linting never needs the Web
 * Worker or the generator/pause machinery that INPUT/OUTPUT rely on.
 */

import { type Diagnostic, linter } from "@codemirror/lint";
import { PseudoError, analyze, parseFile, tokenize } from "@pseudogo/lang";
import type { EditorView } from "@codemirror/view";

function diagnosticFromError(view: EditorView, err: PseudoError): Diagnostic {
  const doc = view.state.doc;
  const lineNumber = Math.min(Math.max(err.line, 1), doc.lines);
  const line = doc.line(lineNumber);
  // Our PseudoError carries a line number but not a column span, so the
  // whole line (from its first non-whitespace character) is underlined --
  // still precise enough to point at the right place without implying a
  // column-accuracy we don't actually have.
  const text = line.text;
  const firstNonSpace = text.length - text.trimStart().length;
  const from = err.line > 0 ? line.from + firstNonSpace : 0;
  const to = err.line > 0 ? line.to : doc.length;

  return {
    from: Math.min(from, to),
    to,
    severity: "error",
    source: err.phase,
    message: err.message,
  };
}

export const pseudoGoLinter = linter(
  (view) => {
    const source = view.state.doc.toString();
    try {
      const file = parseFile(tokenize(source));
      analyze(file);
      return [];
    } catch (err) {
      if (err instanceof PseudoError) return [diagnosticFromError(view, err)];
      // An unexpected (non-PseudoError) exception shouldn't crash the
      // editor -- surface it as a generic diagnostic on line 1 rather than
      // throwing out of the linter callback.
      return [
        {
          from: 0,
          to: Math.min(view.state.doc.length, 1),
          severity: "error",
          message: `Internal error: ${err instanceof Error ? err.message : String(err)}`,
        },
      ];
    }
  },
  { delay: 300 },
);
