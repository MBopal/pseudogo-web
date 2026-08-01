/**
 * CodeMirror editor theme: dark "chalkboard" styling matching the app's
 * design tokens (see index.css), plus syntax highlighting colors for the
 * tags produced by pseudogo-language.ts.
 */

import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";

// Keep in sync with the @theme block in index.css.
const colors = {
  app: "#1a211d",
  panel: "#212925",
  panelRaised: "#283029",
  inset: "#191f1b",
  ink: "#f3efe3",
  muted: "#9aa79c",
  faint: "#62705f",
  accent: "#e3b23c",
  accentSoft: "#4a4433",
  success: "#8fbf8a",
  danger: "#e5484d",
  border: "#33403a",
};

export const pseudoGoEditorTheme = EditorView.theme(
  {
    "&": {
      color: colors.ink,
      backgroundColor: colors.panel,
      height: "100%",
      fontSize: "13.5px",
    },
    ".cm-content": {
      fontFamily: "var(--font-mono)",
      caretColor: colors.accent,
      padding: "12px 0",
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: colors.accent,
      borderLeftWidth: "2px",
    },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
      backgroundColor: `${colors.accentSoft} !important`,
    },
    ".cm-activeLine": {
      backgroundColor: "rgba(227, 178, 60, 0.06)",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "rgba(227, 178, 60, 0.06)",
      color: colors.ink,
    },
    ".cm-gutters": {
      backgroundColor: colors.panel,
      color: colors.faint,
      border: "none",
      borderRight: `1px solid ${colors.border}`,
    },
    ".cm-lineNumbers .cm-gutterElement": {
      padding: "0 12px 0 16px",
    },
    ".cm-foldPlaceholder": {
      backgroundColor: colors.panelRaised,
      border: `1px solid ${colors.border}`,
      color: colors.muted,
    },
    ".cm-matchingBracket, .cm-nonmatchingBracket": {
      backgroundColor: colors.accentSoft,
      outline: `1px solid ${colors.accent}`,
    },
    ".cm-tooltip": {
      backgroundColor: colors.panelRaised,
      border: `1px solid ${colors.border}`,
      color: colors.ink,
      fontFamily: "var(--font-display)",
      fontSize: "12.5px",
    },
    ".cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]": {
      backgroundColor: colors.accentSoft,
      color: colors.ink,
    },
    ".cm-panels": {
      backgroundColor: colors.panelRaised,
      color: colors.ink,
    },
    // Lint diagnostics: styled with our success/danger tokens rather than
    // CodeMirror's default red/yellow, and dashed rather than squiggly for
    // a slightly more "chalk underline" feel.
    ".cm-diagnostic-error": {
      borderLeft: `3px solid ${colors.danger}`,
    },
    ".cm-lintRange-error": {
      backgroundImage: "none",
      borderBottom: `2px dashed ${colors.danger}`,
    },
  },
  { dark: true },
);

export const pseudoGoHighlightStyle = HighlightStyle.define([
  { tag: t.keyword, color: colors.accent, fontWeight: "600" },
  { tag: t.typeName, color: colors.success },
  { tag: t.bool, color: colors.accent },
  { tag: t.string, color: "#c9a86a" },
  { tag: t.character, color: "#c9a86a" },
  { tag: t.number, color: "#7fb8c4" },
  { tag: t.comment, color: colors.faint, fontStyle: "italic" },
  { tag: t.operator, color: colors.muted },
  { tag: t.bracket, color: colors.muted },
  { tag: t.punctuation, color: colors.muted },
  { tag: t.variableName, color: colors.ink },
]);

export const pseudoGoEditorExtensions = [pseudoGoEditorTheme, syntaxHighlighting(pseudoGoHighlightStyle)];
