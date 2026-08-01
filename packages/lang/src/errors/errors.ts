/**
 * The single error type used across every phase of the PseudoGo pipeline
 * (lexing, parsing, semantic analysis, evaluation) — a direct port of
 * `pseudogo-cli`'s `internal/errors` package. Every PseudoGo error carries a
 * phase, a 1-indexed source line, and a plain-English message; no stack
 * traces are ever surfaced to the user.
 */

export type Phase =
  | "Lexical error"
  | "Syntax error"
  | "Compile error"
  | "Runtime error";

export class PseudoError extends Error {
  readonly phase: Phase;
  readonly line: number;

  constructor(phase: Phase, line: number, message: string) {
    super(line > 0 ? `Line ${line}: ${message}` : message);
    this.phase = phase;
    this.line = line;
    this.name = "PseudoError";
  }

  /**
   * Full "<Phase>: Line <N>: <message>" form, matching the Go CLI's stderr
   * output exactly (see `pseudogo-cli/cmd/pseudogo/main.go`'s `reportError`).
   */
  toFullString(): string {
    return `${this.phase}: ${this.message}`;
  }
}

export function isPseudoError(err: unknown): err is PseudoError {
  return err instanceof PseudoError;
}
