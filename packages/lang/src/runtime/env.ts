import type { Box } from "./value.js";

/**
 * A single flat variable scope for one call frame (a function body, a
 * procedure body, or the Program body). PseudoGo has no block-local scoping
 * below the call-frame level: variables declared in a Dictionary are
 * visible throughout that entire Algorithm block, including inside nested
 * loops and conditionals. Ported from `pseudogo-cli`'s `internal/runtime`
 * `Env` type.
 */
export class Env {
  private readonly vars = new Map<string, Box>();

  define(name: string, b: Box): void {
    this.vars.set(name, b);
  }

  get(name: string): Box | undefined {
    return this.vars.get(name);
  }
}
