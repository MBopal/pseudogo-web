/**
 * Golden-fixture parity tests: runs every example program from
 * `pseudogo-cli/examples/` (including `error-demos/`) through the TS
 * interpreter and asserts it produces the exact same output / error text
 * the Go CLI produced when `manifest.json` was generated (see the repo
 * root for the generation approach -- these are real captured outputs,
 * not hand-typed expectations).
 *
 * The Go CLI's `main.go` appends "Execution finished.\n" on success and
 * nothing extra on failure; that trailer is a CLI-presentation concern, not
 * part of the interpreter's own behavior, so it's stripped before
 * comparison here.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { run } from "../index.js";

const here = dirname(fileURLToPath(import.meta.url));

interface FixtureEntry {
  name: string;
  sourceFile: string;
  stdin: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  compare: boolean;
}

const manifest: FixtureEntry[] = JSON.parse(readFileSync(join(here, "manifest.json"), "utf8"));

const SUCCESS_TRAILER = "Execution finished.\n";

function linesFromStdin(stdin: string): string[] {
  if (stdin === "") return [];
  const lines = stdin.split("\n");
  if (lines[lines.length - 1] === "") lines.pop(); // drop trailing "" from a final \n
  return lines;
}

describe("golden fixtures (parity with pseudogo-cli)", () => {
  const comparable = manifest.filter((f) => f.compare);
  it("has fixtures to compare", () => {
    expect(comparable.length).toBeGreaterThan(0);
  });

  for (const fixture of comparable) {
    it(`${fixture.name} matches the Go CLI`, () => {
      const source = readFileSync(join(here, fixture.sourceFile), "utf8");
      const result = run(source, linesFromStdin(fixture.stdin));

      if (fixture.exitCode === 0) {
        expect(result.error, `expected no error for ${fixture.name}`).toBeUndefined();
        const expectedOutput = fixture.stdout.endsWith(SUCCESS_TRAILER)
          ? fixture.stdout.slice(0, -SUCCESS_TRAILER.length)
          : fixture.stdout;
        expect(result.output).toBe(expectedOutput);
      } else {
        expect(result.error, `expected an error for ${fixture.name}`).toBeDefined();
        const expectedErrText = fixture.stderr.trimEnd();
        expect(result.error!.toFullString()).toBe(expectedErrText);
        expect(result.output).toBe(fixture.stdout);
      }
    });
  }

  const skipped = manifest.filter((f) => !f.compare);
  it.each(skipped.map((f) => f.name))("%s is intentionally excluded from output comparison but still runs", (name) => {
    const fixture = manifest.find((f) => f.name === name)!;
    const source = readFileSync(join(here, fixture.sourceFile), "utf8");
    // Not compared byte-for-byte (see manifest generation notes: bubble_sort
    // is a large perf smoke test, recursion_limit is calibrated to Go's much
    // larger stack-depth budget), but it should still parse, type-check, and
    // run without throwing an unexpected (non-PseudoError) exception.
    expect(() => run(source, linesFromStdin(fixture.stdin))).not.toThrow();
  });
});
