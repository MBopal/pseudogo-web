/**
 * A synchronous driver that runs the generator-based evaluator to
 * completion, feeding it a pre-supplied queue of input lines (the "queue"
 * side of the input-queue console model from PRD_pseudogo_web.md -- when
 * the queue runs dry, this driver treats that as end-of-input, matching the
 * Go CLI's behavior for a closed stdin).
 *
 * This is what the test suite and golden fixtures use to assert on a
 * program's complete output. It's also a preview of the real driver: the
 * future Web Worker driver has the same shape, except it resumes "input"
 * events by asking the UI for a line (queued or freshly typed) instead of
 * shifting one off a fixed array, and it can call `.return()` on a
 * "checkpoint" event to cancel instead of always continuing.
 */

import type * as ast from "../ast/ast.js";
import { isPseudoError, PseudoError } from "../errors/errors.js";
import type { SemanticInfo } from "../semantic/semantic.js";
import { evaluate } from "./evaluator.js";

export interface RunResult {
  /** Every "output" event's text, concatenated in order. */
  output: string;
  /** Set if the program failed with a PseudoError (lexical/syntax/semantic
   * errors never reach this driver -- see runProgramSource -- but a
   * runtime error can). Undefined on success. */
  error: PseudoError | undefined;
}

/** Runs an already-checked file to completion. `inputLines` is consumed in
 * order by successive INPUT statements; once exhausted, any further INPUT
 * raises the same "Unexpected end of input" error the Go CLI raises on a
 * closed stdin. */
export function runProgram(file: ast.File, info: SemanticInfo, inputLines: string[] = []): RunResult {
  const queue = [...inputLines];
  const gen = evaluate(file, info);
  let output = "";

  try {
    let resumeValue: string | undefined;
    for (;;) {
      const { value: event, done } = gen.next(resumeValue);
      if (done) break;
      switch (event.type) {
        case "output":
          output += event.text;
          resumeValue = undefined;
          break;
        case "input":
          resumeValue = queue.length > 0 ? queue.shift() : undefined;
          break;
        case "checkpoint":
          resumeValue = undefined;
          break;
      }
    }
    return { output, error: undefined };
  } catch (err) {
    if (isPseudoError(err)) return { output, error: err };
    throw err;
  }
}
