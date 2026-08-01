/**
 * Public API of @pseudogo/lang: the PseudoGo language pipeline
 * (lexer -> parser -> semantic analyzer -> evaluator), with zero DOM/UI
 * dependencies. See PRD_pseudogo_cli.md for the language specification and
 * PRD_pseudogo_web.md for this package's role in the overall project.
 */

export * as ast from "./ast/ast.js";
export type { Phase } from "./errors/errors.js";
export { isPseudoError, PseudoError } from "./errors/errors.js";
export { runProgram } from "./evaluator/driver.js";
export type { EvalEvent, EvalResume } from "./evaluator/events.js";
export { evaluate } from "./evaluator/evaluator.js";
export { Lexer, tokenize } from "./lexer/lexer.js";
export { parseFile } from "./parser/parser.js";
export * as runtime from "./runtime/value.js";
export { analyze } from "./semantic/semantic.js";
export type { SemanticInfo } from "./semantic/semantic.js";
export { displayTokenType, lookupIdent } from "./token/token.js";
export type { Pos, Token, TokenType } from "./token/token.js";

import type * as ast from "./ast/ast.js";
import { PseudoError } from "./errors/errors.js";
import { type RunResult, runProgram } from "./evaluator/driver.js";
import { tokenize } from "./lexer/lexer.js";
import { parseFile } from "./parser/parser.js";
import { analyze } from "./semantic/semantic.js";

export type { RunResult } from "./evaluator/driver.js";

/**
 * Convenience one-shot entry point: runs the full pipeline (lex -> parse ->
 * analyze -> evaluate) over PseudoGo source text and returns the result.
 * Lexical/syntax/semantic errors are returned the same way a runtime error
 * is (via `RunResult.error`), never thrown, so callers don't need three
 * separate try/catch blocks for a simple "just run this" use case.
 *
 * For streaming output/interactive INPUT, use `evaluate()` directly and
 * drive its generator yourself (see `runProgram`'s implementation for the
 * pattern); this helper always runs to completion synchronously.
 */
export function run(source: string, inputLines: string[] = []): RunResult {
  let file: ast.File;
  try {
    file = parseFile(tokenize(source));
  } catch (err) {
    if (err instanceof PseudoError) return { output: "", error: err };
    throw err;
  }

  let info;
  try {
    info = analyze(file);
  } catch (err) {
    if (err instanceof PseudoError) return { output: "", error: err };
    throw err;
  }

  return runProgram(file, info, inputLines);
}
