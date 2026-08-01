/**
 * Events yielded by the generator-based evaluator (see PRD_pseudogo_web.md,
 * "Execution architecture"). The evaluator pauses:
 *
 *  - at every OUTPUT, so a driver can stream printed text live rather than
 *    buffering an entire program's output until it finishes;
 *  - at every INPUT, so a driver can supply a value asynchronously (a typed
 *    line, a pre-queued line, etc.) without the interpreter itself knowing
 *    or caring where that value comes from;
 *  - periodically during loops (a "checkpoint", carrying no data), purely
 *    so a driver running a tight/runaway loop gets frequent opportunities
 *    to call the generator's built-in `.return()` and cancel cleanly,
 *    without needing any custom cancellation protocol.
 */

export type EvalEvent = { type: "output"; text: string } | { type: "input"; line: number } | { type: "checkpoint" };

/** The value a driver resumes the generator with via `.next(value)`. Only
 * meaningful when the yielded event was `{ type: "input" }` (the raw input
 * line, no trailing newline); ignored for "output" and "checkpoint". */
export type EvalResume = string | undefined;
