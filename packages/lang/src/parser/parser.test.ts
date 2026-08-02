import { describe, expect, it } from "vitest";
import { tokenize } from "../lexer/lexer.js";
import { parseFile } from "./parser.js";
import type * as ast from "../ast/ast.js";

function parseSrc(src: string): ast.File {
  return parseFile(tokenize(src));
}

const minimalProgram = `
Program Hi
Dictionary
	x: Integer
Algorithm
	x = 5
	OUTPUT x
Endprogram
`;

describe("parser", () => {
  it("parses a minimal program", () => {
    const file = parseSrc(minimalProgram);
    expect(file.program.name).toBe("Hi");
    expect(file.program.locals).toHaveLength(1);
    expect(file.program.body).toHaveLength(2);
    expect(file.program.body[0]?.kind).toBe("AssignNode");
    expect(file.program.body[1]?.kind).toBe("OutputNode");
  });

  it("parses a function with grouped parameters sharing a type", () => {
    const src = `
function add(a, b: Integer) -> Integer
Dictionary
Algorithm
	return a + b
Endfunction

Program Main
Dictionary
	r: Integer
Algorithm
	r = add(1, 2)
Endprogram
`;
    const file = parseSrc(src);
    expect(file.functions).toHaveLength(1);
    const fn = file.functions[0]!;
    expect(fn.params).toHaveLength(2);
    expect(fn.params.map((p) => p.name)).toEqual(["a", "b"]);
    expect(fn.params.every((p) => p.mode === "in")).toBe(true);
  });

  it("parses procedure parameter modes", () => {
    const src = `
procedure demo(in a: Integer, out b: Integer, in/out c: Integer)
Dictionary
Algorithm
	b = a
	c = a
Endprocedure

Program Main
Dictionary
	x, y, z: Integer
Algorithm
	demo(x, y, z)
Endprogram
`;
    const file = parseSrc(src);
    const pr = file.procedures[0]!;
    expect(pr.params[0]?.mode).toBe("in");
    expect(pr.params[1]?.mode).toBe("out");
    expect(pr.params[2]?.mode).toBe("in/out");
  });

  it("parses nested array types", () => {
    const src = `
Program Main
Dictionary
	matrix: Array[1..5] of Array[1..5] of Real
Algorithm
	matrix[1][1] = 1.0
Endprogram
`;
    const file = parseSrc(src);
    const decl = file.program.locals[0]!;
    expect(decl.type.kind).toBe("ArrayType");
    const outer = decl.type as ast.ArrayType;
    expect(outer.lower).toBe(1);
    expect(outer.upper).toBe(5);
    expect(outer.elem.kind).toBe("ArrayType");
    const inner = outer.elem as ast.ArrayType;
    expect(inner.lower).toBe(1);
    expect(inner.upper).toBe(5);
    expect(inner.elem).toMatchObject({ kind: "PrimitiveType", name: "REAL" });
  });

  it("parses a struct definition", () => {
    const src = `
type Person struct <
	name: String
	age: Integer
>

Program Main
Dictionary
	p: Person
Algorithm
	p.name = "Ada"
Endprogram
`;
    const file = parseSrc(src);
    expect(file.typeDefs).toHaveLength(1);
    expect(file.typeDefs[0]).toMatchObject({ name: "Person" });
    expect(file.typeDefs[0]?.fields).toHaveLength(2);
  });

  it("parses IF / ELSE IF / ELSE chains", () => {
    const src = `
Program Main
Dictionary
	n: Integer
Algorithm
	IF n == 1 THEN
		OUTPUT 1
	ELSE IF n == 2 THEN
		OUTPUT 2
	ELSE
		OUTPUT 0
	ENDIF
Endprogram
`;
    const file = parseSrc(src);
    const ifNode = file.program.body[0] as ast.IfNode;
    expect(ifNode.elseIfs).toHaveLength(1);
    expect(ifNode.elseBody).toBeDefined();
  });

  it("parses FOR with STEP", () => {
    const src = `
Program Main
Dictionary
	i: Integer
Algorithm
	FOR i = 10 TO 1 STEP -1
		OUTPUT i
	ENDFOR
Endprogram
`;
    const file = parseSrc(src);
    const forNode = file.program.body[0] as ast.ForNode;
    expect(forNode.step).toBeDefined();
  });

  it("respects standard operator precedence (2 + 3 * 4)", () => {
    const src = `
Program Main
Dictionary
	r: Integer
Algorithm
	r = 2 + 3 * 4
Endprogram
`;
    const file = parseSrc(src);
    const assign = file.program.body[0] as ast.AssignNode;
    const bin = assign.value as ast.BinaryExpr;
    expect(bin.op).toBe("PLUS");
    expect(bin.right.kind).toBe("BinaryExpr");
    expect((bin.right as ast.BinaryExpr).op).toBe("STAR");
    expect(bin.left.kind).toBe("LiteralExpr");
  });

  it("throws a syntax error for a missing Endprogram", () => {
    const src = `
Program Main
Dictionary
Algorithm
	OUTPUT 1
`;
    expect(() => parseSrc(src)).toThrow();
  });

  it("throws a syntax error for a second Program block", () => {
    const src = `
Program A
Dictionary
Algorithm
Endprogram
Program B
Dictionary
Algorithm
Endprogram
`;
    expect(() => parseSrc(src)).toThrow();
  });

  it("throws a syntax error for IF with no condition", () => {
    const src = `
Program Main
Dictionary
Algorithm
	IF THEN
	ENDIF
Endprogram
`;
    expect(() => parseSrc(src)).toThrow();
  });

  it("matches primitive type names case-insensitively, canonicalized to uppercase", () => {
    for (const spelling of ["Integer", "INTEGER", "integer", "InTeGeR"]) {
      const src = `
Program Main
Dictionary
	x: ${spelling}
Algorithm
	x = 5
Endprogram
`;
      const file = parseSrc(src);
      const decl = file.program.locals[0]!;
      expect(decl.type, `spelling ${spelling}`).toMatchObject({ kind: "PrimitiveType", name: "INTEGER" });
    }
  });

  it("distinguishes a call statement from an assignment", () => {
    const src = `
procedure greet()
Dictionary
Algorithm
Endprocedure

Program Main
Dictionary
	arr: Array[1..3] of Integer
Algorithm
	greet()
	arr[1] = 5
Endprogram
`;
    const file = parseSrc(src);
    expect(file.program.body[0]?.kind).toBe("CallNode");
    expect(file.program.body[1]?.kind).toBe("AssignNode");
  });
});
