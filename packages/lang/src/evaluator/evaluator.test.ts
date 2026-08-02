import { describe, expect, it } from "vitest";
import { tokenize } from "../lexer/lexer.js";
import { parseFile } from "../parser/parser.js";
import { analyze } from "../semantic/semantic.js";
import { runProgram } from "./driver.js";
import { evaluate } from "./evaluator.js";

function run(src: string, inputLines: string[] = []) {
  const file = parseFile(tokenize(src));
  const info = analyze(file);
  return runProgram(file, info, inputLines);
}

function expectOutput(src: string, want: string, inputLines: string[] = []): void {
  const result = run(src, inputLines);
  if (result.error) throw new Error(`unexpected runtime error: ${result.error.toFullString()}`);
  expect(result.output).toBe(want);
}

function expectRuntimeErrContains(src: string, substr: string): void {
  const result = run(src);
  expect(result.error).toBeDefined();
  expect(result.error!.message).toContain(substr);
}

describe("evaluator", () => {
  it("computes arithmetic with standard precedence", () => {
    expectOutput(
      `
Program Main
Dictionary
	r: Integer
Algorithm
	r = 2 + 3 * 4
	OUTPUT r
Endprogram
`,
      "14\n",
    );
  });

  it("widens Integer to Real in arithmetic", () => {
    expectOutput(
      `
Program Main
Dictionary
	r: Real
Algorithm
	r = 10 / 4.0
	OUTPUT r
Endprogram
`,
      "2.5\n",
    );
  });

  it("truncates Integer division", () => {
    expectOutput(
      `
Program Main
Dictionary
	r: Integer
Algorithm
	r = 7 / 2
	OUTPUT r
Endprogram
`,
      "3\n",
    );
  });

  it("computes MOD", () => {
    expectOutput(
      `
Program Main
Dictionary
	r: Integer
Algorithm
	r = 7 MOD 2
	OUTPUT r
Endprogram
`,
      "1\n",
    );
  });

  it("runs a WHILE loop", () => {
    expectOutput(
      `
Program Main
Dictionary
	i, sum: Integer
Algorithm
	i = 1
	sum = 0
	WHILE i <= 5
		sum = sum + i
		i = i + 1
	ENDWHILE
	OUTPUT sum
Endprogram
`,
      "15\n",
    );
  });

  it("runs a FOR loop with a negative STEP", () => {
    expectOutput(
      `
Program Main
Dictionary
	i: Integer
Algorithm
	FOR i = 3 TO 1 STEP -1
		OUTPUT i
	ENDFOR
Endprogram
`,
      "3\n2\n1\n",
    );
  });

  it("handles IF / ELSE IF / ELSE chains", () => {
    expectOutput(
      `
Program Main
Dictionary
	n: Integer
Algorithm
	n = 2
	IF n == 1 THEN
		OUTPUT "one"
	ELSE IF n == 2 THEN
		OUTPUT "two"
	ELSE
		OUTPUT "other"
	ENDIF
Endprogram
`,
      "two\n",
    );
  });

  it("computes a recursive factorial", () => {
    expectOutput(
      `
function factorial(n: Integer) -> Integer
Dictionary
Algorithm
	IF n <= 1 THEN
		return 1
	ENDIF
	return n * factorial(n - 1)
Endfunction

Program Main
Dictionary
	f: Integer
Algorithm
	f = factorial(5)
	OUTPUT f
Endprogram
`,
      "120\n",
    );
  });

  it("passes 'in' parameters by value", () => {
    expectOutput(
      `
procedure tryModify(in a: Integer)
Dictionary
Algorithm
	a = 999
Endprocedure

Program Main
Dictionary
	x: Integer
Algorithm
	x = 5
	tryModify(x)
	OUTPUT x
Endprogram
`,
      "5\n",
    );
  });

  it("reflects 'in/out' parameters immediately", () => {
    expectOutput(
      `
procedure swap(in/out a, b: Integer)
Dictionary
	temp: Integer
Algorithm
	temp = a
	a = b
	b = temp
Endprocedure

Program Main
Dictionary
	x, y: Integer
Algorithm
	x = 10
	y = 20
	swap(x, y)
	OUTPUT x, y
Endprogram
`,
      "20 10\n",
    );
  });

  it("starts 'out' parameters uninitialized and copies back on return", () => {
    expectOutput(
      `
procedure reset(out z: Integer)
Dictionary
Algorithm
	z = 42
Endprocedure

Program Main
Dictionary
	x: Integer
Algorithm
	x = 5
	reset(x)
	OUTPUT x
Endprogram
`,
      "42\n",
    );
  });

  it("fills and reads a 1-indexed array", () => {
    expectOutput(
      `
Program Main
Dictionary
	i: Integer
	nums: Array[1..5] of Integer
Algorithm
	FOR i = 1 TO 5
		nums[i] = i * 2
	ENDFOR
	FOR i = 1 TO 5
		OUTPUT nums[i]
	ENDFOR
Endprogram
`,
      "2\n4\n6\n8\n10\n",
    );
  });

  it("handles nested arrays", () => {
    expectOutput(
      `
Program Main
Dictionary
	grid: Array[1..2] of Array[1..2] of Integer
Algorithm
	grid[1][1] = 1
	grid[1][2] = 2
	grid[2][1] = 3
	grid[2][2] = 4
	OUTPUT grid[1][1] + grid[2][2]
Endprogram
`,
      "5\n",
    );
  });

  it("handles struct fields", () => {
    expectOutput(
      `
type Point struct <
	x: Real
	y: Real
>

Program Main
Dictionary
	p: Point
Algorithm
	p.x = 3.5
	p.y = 2.0
	OUTPUT p.x + p.y
Endprogram
`,
      "5.5\n",
    );
  });

  it("reads INPUT and echoes it", () => {
    expectOutput(
      `
Program Main
Dictionary
	name: String
Algorithm
	INPUT name
	OUTPUT "Hello,", name
Endprogram
`,
      "? Hello, Ada\n",
      ["Ada"],
    );
  });

  it("throws a runtime error on division by zero", () => {
    expectRuntimeErrContains(
      `
Program Main
Dictionary
	a, b, c: Integer
Algorithm
	a = 10
	b = 0
	c = a / b
Endprogram
`,
      "Division by zero",
    );
  });

  it("throws a runtime error on an out-of-bounds array access", () => {
    expectRuntimeErrContains(
      `
Program Main
Dictionary
	arr: Array[1..10] of Integer
	x: Integer
Algorithm
	x = arr[0]
Endprogram
`,
      "out of bounds",
    );
  });

  it("throws a runtime error reading an uninitialized variable", () => {
    expectRuntimeErrContains(
      `
Program Main
Dictionary
	a: Integer
Algorithm
	OUTPUT a
Endprogram
`,
      "used before assignment",
    );
  });

  it("throws a runtime error when input runs out", () => {
    expectRuntimeErrContains(
      `
Program Main
Dictionary
	name: String
Algorithm
	INPUT name
Endprogram
`,
      "Unexpected end of input",
    );
  });

  it("throws a runtime error when recursion exceeds the limit", () => {
    expectRuntimeErrContains(
      `
function loopy(n: Integer) -> Integer
Dictionary
Algorithm
	return loopy(n + 1)
Endfunction

Program Main
Dictionary
	r: Integer
Algorithm
	r = loopy(0)
Endprogram
`,
      "Recursion limit",
    );
  });

  it("short-circuits AND", () => {
    // If AND did not short-circuit, evaluating arr[0] would raise an
    // out-of-bounds error. Since the left side is false, the right side
    // must never be evaluated.
    expectOutput(
      `
Program Main
Dictionary
	arr: Array[1..5] of Integer
	flag: Boolean
Algorithm
	flag = false AND (arr[0] == 1)
	OUTPUT flag
Endprogram
`,
      "false\n",
    );
  });

  it("short-circuits OR", () => {
    expectOutput(
      `
Program Main
Dictionary
	arr: Array[1..5] of Integer
	flag: Boolean
Algorithm
	flag = true OR (arr[0] == 1)
	OUTPUT flag
Endprogram
`,
      "true\n",
    );
  });

  it("can be driven manually step-by-step and cancelled early via .return()", () => {
    const file = parseFile(
      tokenize(`
Program Main
Dictionary
	i: Integer
Algorithm
	FOR i = 1 TO 1000000
		OUTPUT i
	ENDFOR
Endprogram
`),
    );
    const info = analyze(file);
    const gen = evaluate(file, info);
    let events = 0;
    let resume: string | undefined;
    for (;;) {
      const { value, done } = gen.next(resume);
      if (done) break;
      events++;
      resume = undefined;
      if (events > 5) {
        gen.return();
        break;
      }
      void value;
    }
    expect(events).toBeGreaterThan(0);
    expect(events).toBeLessThanOrEqual(6);
  });

  it("runs identically regardless of keyword/type-name casing", () => {
    // Canonical casing (uppercase keywords/types, lowercase true/false) is
    // the recommended style, not a requirement -- either way the program
    // must behave identically.
    const lower = `
program Main
dictionary
	n: integer
	flag: boolean
algorithm
	n = 5
	flag = TRUE
	if flag AND n > 0 then
		output n * 2
	endif
endprogram
`;
    const canonical = `
PROGRAM Main
DICTIONARY
	n: INTEGER
	flag: BOOLEAN
ALGORITHM
	n = 5
	flag = true
	IF flag AND n > 0 THEN
		OUTPUT n * 2
	ENDIF
ENDPROGRAM
`;
    expectOutput(lower, "10\n");
    expectOutput(canonical, "10\n");
  });
});
