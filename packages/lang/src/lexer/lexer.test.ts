import { describe, expect, it } from "vitest";
import { tokenize } from "./lexer.js";
import type { TokenType } from "../token/token.js";

function typesOf(src: string): TokenType[] {
  return tokenize(src).map((t) => t.type);
}

describe("lexer", () => {
  it("tokenizes basic expressions", () => {
    expect(typesOf(`x = 5 + 3.5 * (2 - 1)`)).toEqual([
      "IDENT", "ASSIGN", "INT_LIT", "PLUS", "REAL_LIT",
      "STAR", "LPAREN", "INT_LIT", "MINUS", "INT_LIT",
      "RPAREN", "EOF",
    ]);
  });

  it("tokenizes keywords", () => {
    expect(
      typesOf(
        `Program Dictionary Algorithm Endprogram IF THEN ELSE ENDIF FOR TO STEP ENDFOR WHILE ENDWHILE INPUT OUTPUT`,
      ),
    ).toEqual([
      "PROGRAM", "DICTIONARY", "ALGORITHM", "ENDPROGRAM",
      "IF", "THEN", "ELSE", "ENDIF", "FOR", "TO",
      "STEP", "ENDFOR", "WHILE", "ENDWHILE", "INPUT",
      "OUTPUT", "EOF",
    ]);
  });

  it("tokenizes in/out parameter modes", () => {
    expect(typesOf(`in out in/out`)).toEqual(["IN", "OUT", "INOUT", "EOF"]);
  });

  it("tokenizes two-character operators", () => {
    expect(typesOf(`== != <= >= ->`)).toEqual(["EQ", "NEQ", "LTE", "GTE", "ARROW", "EOF"]);
  });

  it("tokenizes array bounds as two separate dots", () => {
    expect(typesOf(`Array[1..10] of Integer`)).toEqual([
      "ARRAY", "LBRACKET", "INT_LIT", "DOT", "DOT",
      "INT_LIT", "RBRACKET", "OF", "IDENT", "EOF",
    ]);
  });

  it("resolves string escapes", () => {
    const toks = tokenize(`"hello\\nworld"`);
    expect(toks[0]).toMatchObject({ type: "STRING_LIT", literal: "hello\nworld" });
  });

  it("parses a char literal", () => {
    const toks = tokenize(`'a'`);
    expect(toks[0]).toMatchObject({ type: "CHAR_LIT", literal: "a" });
  });

  it("skips line comments", () => {
    expect(typesOf("x = 5 -- ignored\ny = 6")).toEqual([
      "IDENT", "ASSIGN", "INT_LIT", "IDENT", "ASSIGN", "INT_LIT", "EOF",
    ]);
  });

  it("skips block comments", () => {
    expect(typesOf("x = /* ignored\nmultiline */ 5")).toEqual(["IDENT", "ASSIGN", "INT_LIT", "EOF"]);
  });

  it("tracks line numbers", () => {
    const toks = tokenize("x = 1\ny = 2\nz = 3");
    expect(toks[0]?.pos.line).toBe(1);
    expect(toks[3]?.pos.line).toBe(2);
    expect(toks[6]?.pos.line).toBe(3);
  });

  it("throws a lexical error on an illegal character", () => {
    expect(() => tokenize("x = 5 $ 3")).toThrow(/Unexpected character/);
  });

  it("throws a lexical error on an unterminated string", () => {
    expect(() => tokenize(`x = "unterminated`)).toThrow(/Unterminated string/);
  });
});
