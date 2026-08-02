import { describe, expect, it } from "vitest";
import { tokenize } from "../lexer/lexer.js";
import { parseFile } from "../parser/parser.js";
import { analyze } from "./semantic.js";

function analyzeSrc(src: string): void {
  analyze(parseFile(tokenize(src)));
}

function expectOK(src: string): void {
  expect(() => analyzeSrc(src)).not.toThrow();
}

function expectErrContains(src: string, substr: string): void {
  expect(() => analyzeSrc(src)).toThrow(substr);
}

describe("semantic analyzer", () => {
  it("accepts a valid minimal program", () => {
    expectOK(`
Program Main
Dictionary
	x: Integer
Algorithm
	x = 5
	OUTPUT x
Endprogram
`);
  });

  it("rejects an undeclared variable", () => {
    expectErrContains(
      `
Program Main
Dictionary
Algorithm
	x = 5
Endprogram
`,
      "not declared in this scope",
    );
  });

  it("rejects an assignment type mismatch", () => {
    expectErrContains(
      `
Program Main
Dictionary
	y: Integer
Algorithm
	y = "hello"
Endprogram
`,
      "Cannot assign STRING to INTEGER",
    );
  });

  it("allows Integer -> Real widening", () => {
    expectOK(`
Program Main
Dictionary
	r: Real
Algorithm
	r = 5
Endprogram
`);
  });

  it("rejects a function missing a return on all paths", () => {
    expectErrContains(
      `
function foo(n: Integer) -> Integer
Dictionary
Algorithm
	IF n > 0 THEN
		return 1
	ENDIF
Endfunction

Program Main
Dictionary
	r: Integer
Algorithm
	r = foo(5)
Endprogram
`,
      "Not all paths in function 'foo' return a value",
    );
  });

  it("accepts a function returning on all paths via ELSE", () => {
    expectOK(`
function foo(n: Integer) -> Integer
Dictionary
Algorithm
	IF n > 0 THEN
		return 1
	ELSE
		return 0
	ENDIF
Endfunction

Program Main
Dictionary
	r: Integer
Algorithm
	r = foo(5)
Endprogram
`);
  });

  it("rejects a procedure returning a value", () => {
    expectErrContains(
      `
procedure foo()
Dictionary
Algorithm
	return 5
Endprocedure

Program Main
Dictionary
Algorithm
	foo()
Endprogram
`,
      "must not return a value",
    );
  });

  it("rejects the wrong number of arguments", () => {
    expectErrContains(
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
	x, y, z: Integer
Algorithm
	swap(x, y, z)
Endprogram
`,
      "expects 2 arguments, got 3",
    );
  });

  it("rejects a literal passed as an out argument", () => {
    expectErrContains(
      `
procedure inc(out a: Integer)
Dictionary
Algorithm
	a = 1
Endprocedure

Program Main
Dictionary
Algorithm
	inc(5)
Endprogram
`,
      "must be a variable",
    );
  });

  it("rejects calling a function as a bare statement", () => {
    expectErrContains(
      `
function foo() -> Integer
Dictionary
Algorithm
	return 1
Endfunction

Program Main
Dictionary
Algorithm
	foo()
Endprogram
`,
      "must be used as an expression",
    );
  });

  it("rejects calling a procedure as an expression", () => {
    expectErrContains(
      `
procedure foo()
Dictionary
Algorithm
Endprocedure

Program Main
Dictionary
	r: Integer
Algorithm
	r = foo()
Endprogram
`,
      "cannot be used as an expression",
    );
  });

  it("rejects an unknown struct type", () => {
    expectErrContains(
      `
Program Main
Dictionary
	p: Ghost
Algorithm
	OUTPUT 1
Endprogram
`,
      "Unknown type 'Ghost'",
    );
  });

  it("accepts struct field access", () => {
    expectOK(`
type Point struct <
	x: Integer
	y: Integer
>

Program Main
Dictionary
	p: Point
Algorithm
	p.x = 1
	p.y = 2
	OUTPUT p.x + p.y
Endprogram
`);
  });

  it("rejects an unknown struct field", () => {
    expectErrContains(
      `
type Point struct <
	x: Integer
>

Program Main
Dictionary
	p: Point
Algorithm
	p.z = 1
Endprogram
`,
      "has no field 'z'",
    );
  });

  it("rejects a non-Integer array index", () => {
    expectErrContains(
      `
Program Main
Dictionary
	arr: Array[1..5] of Integer
	f: Real
Algorithm
	f = 1.5
	arr[f] = 1
Endprogram
`,
      "Array index must be an Integer",
    );
  });

  it("rejects a non-Boolean IF condition", () => {
    expectErrContains(
      `
Program Main
Dictionary
	x: Integer
Algorithm
	x = 5
	IF x THEN
		OUTPUT 1
	ENDIF
Endprogram
`,
      "must be a Boolean expression",
    );
  });

  it("rejects a FOR loop variable that isn't declared", () => {
    expectErrContains(
      `
Program Main
Dictionary
Algorithm
	FOR i = 1 TO 5
		OUTPUT i
	ENDFOR
Endprogram
`,
      "not declared in this scope",
    );
  });

  it("rejects a duplicate struct definition", () => {
    expectErrContains(
      `
type P struct < x: Integer >
type P struct < y: Integer >

Program Main
Dictionary
Algorithm
Endprogram
`,
      "already defined",
    );
  });

  it("allows a recursive function", () => {
    expectOK(`
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
Endprogram
`);
  });

  it("allows mutual recursion", () => {
    expectOK(`
function isEven(n: Integer) -> Boolean
Dictionary
Algorithm
	IF n == 0 THEN
		return true
	ENDIF
	return isOdd(n - 1)
Endfunction

function isOdd(n: Integer) -> Boolean
Dictionary
Algorithm
	IF n == 0 THEN
		return false
	ENDIF
	return isEven(n - 1)
Endfunction

Program Main
Dictionary
	b: Boolean
Algorithm
	b = isEven(10)
Endprogram
`);
  });
});
