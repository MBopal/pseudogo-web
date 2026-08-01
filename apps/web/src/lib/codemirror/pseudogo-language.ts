/**
 * CodeMirror syntax highlighting for PseudoGo, via `@codemirror/language`'s
 * `StreamLanguage` (a simpler per-line tokenizer API, appropriate for a
 * language this size -- a full Lezer grammar would be overkill). This is a
 * *display* tokenizer independent from `@pseudogo/lang`'s real lexer; it
 * only needs to be good enough to color the text plausibly as you type,
 * including through syntax errors. Correctness is the real lexer/parser's
 * job, surfaced separately through live linting (see `pseudogo-lint.ts`).
 */

import { StreamLanguage, type StreamParser } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

const KEYWORDS = new Set([
  "Program", "Dictionary", "Algorithm", "Endprogram",
  "function", "Endfunction", "procedure", "Endprocedure", "return",
  "IF", "THEN", "ELSE", "ENDIF",
  "FOR", "TO", "STEP", "ENDFOR",
  "WHILE", "ENDWHILE",
  "INPUT", "OUTPUT",
  "type", "struct", "Array", "of",
  "in", "out",
  "AND", "OR", "NOT", "MOD",
]);

const TYPE_NAMES = new Set(["Integer", "Real", "Boolean", "Char", "String"]);
const BOOL_LITERALS = new Set(["true", "false"]);

interface State {
  inBlockComment: boolean;
}

const pseudoGoStreamParser: StreamParser<State> = {
  name: "pseudogo",

  startState(): State {
    return { inBlockComment: false };
  },

  token(stream, state) {
    if (state.inBlockComment) {
      if (stream.match(/^[^*]*\*\//)) {
        state.inBlockComment = false;
      } else {
        stream.skipToEnd();
      }
      return "comment";
    }

    if (stream.eatSpace()) return null;

    // Line comment: -- to end of line
    if (stream.match("--")) {
      stream.skipToEnd();
      return "comment";
    }

    // Block comment start
    if (stream.match("/*")) {
      if (!stream.match(/^[^*]*\*\//)) {
        state.inBlockComment = true;
        stream.skipToEnd();
      }
      return "comment";
    }

    // String literal
    if (stream.match('"')) {
      while (!stream.eol()) {
        if (stream.match('\\"')) continue;
        if (stream.match('"')) break;
        stream.next();
      }
      return "string";
    }

    // Char literal
    if (stream.match("'")) {
      while (!stream.eol()) {
        if (stream.match("\\'")) continue;
        if (stream.match("'")) break;
        stream.next();
      }
      return "character";
    }

    // Numbers (real or integer)
    if (stream.match(/^\d+(\.\d+)?/)) {
      return "number";
    }

    // in/out is a single logical token in the real lexer; match it first.
    if (stream.match(/^in\/out\b/)) {
      return "keyword";
    }

    // Identifiers / keywords / types / booleans
    if (stream.match(/^[A-Za-z_][A-Za-z0-9_]*/)) {
      const word = stream.current();
      if (KEYWORDS.has(word)) return "keyword";
      if (TYPE_NAMES.has(word)) return "typeName";
      if (BOOL_LITERALS.has(word)) return "bool";
      // Heuristic only (for color, not correctness): a capitalized
      // identifier followed by '(' reads as a call-ish name; we don't
      // actually know function vs. struct vs. variable without the real
      // semantic analyzer, so keep this modest -- just default to variableName.
      return "variableName";
    }

    // Two-character operators
    if (stream.match(/^(==|!=|<=|>=|->)/)) return "operator";

    // Single-character operators / punctuation
    if (stream.match(/^[=<>+\-*/]/)) return "operator";
    if (stream.match(/^[()[\]]/)) return "bracket";
    if (stream.match(/^[,.:]/)) return "punctuation";

    stream.next();
    return null;
  },

  blankLine(state) {
    void state;
  },
};

export const pseudoGoLanguage = StreamLanguage.define(pseudoGoStreamParser);

/** Maps our token tags to Lezer's standard highlight tags, so any CodeMirror
 * theme (including the one we author in `pseudogo-theme.ts`) can style them. */
export const pseudoGoHighlightTags = {
  keyword: t.keyword,
  typeName: t.typeName,
  bool: t.bool,
  string: t.string,
  character: t.character,
  number: t.number,
  comment: t.comment,
  operator: t.operator,
  bracket: t.bracket,
  punctuation: t.punctuation,
  variableName: t.variableName,
};
