/**
 * Recursive-descent parser turning a PseudoGo token stream into an AST
 * (`ast.File`). A direct port of `pseudogo-cli`'s `internal/parser` package.
 *
 * The parser fails fast: on the first unexpected token it throws a
 * PseudoError with the exact source line, rather than attempting error
 * recovery. Go's version uses panic/recover to unwind the recursive descent
 * without threading `error` returns through every call; here that's just a
 * plain `throw`, which propagates naturally to whoever calls `parseFile`.
 */

import * as ast from "../ast/ast.js";
import { PseudoError } from "../errors/errors.js";
import { type Token, type TokenType, displayTokenType } from "../token/token.js";

const PRIMITIVE_NAMES = new Set(["Integer", "Real", "Boolean", "Char", "String"]);

function describeTok(t: Token): string {
  if (t.type === "EOF") return "end of file";
  return t.literal !== "" ? t.literal : displayTokenType(t.type);
}

class Parser {
  private readonly tokens: Token[];
  private pos = 0;
  private cur: Token;
  private peek: Token;

  constructor(tokens: Token[]) {
    this.tokens = tokens.length > 0 ? tokens : [{ type: "EOF", literal: "", pos: { line: 1, column: 0 } }];
    this.cur = this.tokens[0]!;
    this.peek = this.tokens.length > 1 ? this.tokens[1]! : this.tokens[0]!;
  }

  private advance(): void {
    this.pos++;
    if (this.pos < this.tokens.length) this.cur = this.tokens[this.pos]!;
    this.peek = this.pos + 1 < this.tokens.length ? this.tokens[this.pos + 1]! : this.tokens[this.tokens.length - 1]!;
  }

  // Routed through methods (rather than reading `this.curType()`/`this.peekType()`
  // directly) so TypeScript's control-flow narrowing can't incorrectly assume
  // the token type stays a stale narrowed literal across loop iterations that
  // mutate it indirectly via `this.advance()`.
  private curType(): TokenType {
    return this.cur.type;
  }

  private peekType(): TokenType {
    return this.peek.type;
  }

  private fail(message: string): never {
    throw new PseudoError("Syntax error", this.cur.pos.line, message);
  }

  private expect(t: TokenType): Token {
    if (this.curType() !== t) {
      this.fail(`Expected '${displayTokenType(t)}' but found '${describeTok(this.cur)}'`);
    }
    const tok = this.cur;
    this.advance();
    return tok;
  }

  // ===================== Top level =====================

  parseFile(): ast.File {
    const typeDefs: ast.TypeDefNode[] = [];
    const functions: ast.FunctionNode[] = [];
    const procedures: ast.ProcedureNode[] = [];

    while (this.curType() !== "PROGRAM" && this.curType() !== "EOF") {
      if (this.curType() === "TYPE") {
        typeDefs.push(this.parseTypeDef());
      } else if (this.curType() === "FUNCTION") {
        functions.push(this.parseFunctionDef());
      } else if (this.curType() === "PROCEDURE") {
        procedures.push(this.parseProcedureDef());
      } else {
        this.fail(`Unexpected token '${describeTok(this.cur)}' at top level`);
      }
    }
    if (this.curType() !== "PROGRAM") {
      this.fail("Expected a 'Program' block but reached end of file");
    }
    const program = this.parseProgram();
    if (this.curType() !== "EOF") {
      this.fail(`Unexpected token '${describeTok(this.cur)}' after Endprogram (only one Program block is allowed)`);
    }
    return { typeDefs, functions, procedures, program };
  }

  private parseTypeDef(): ast.TypeDefNode {
    const line = this.cur.pos.line;
    this.expect("TYPE");
    const name = this.expect("IDENT").literal;
    this.expect("STRUCT");
    this.expect("LT");
    const fields: ast.FieldDecl[] = [];
    while (this.curType() === "IDENT") {
      const fline = this.cur.pos.line;
      const fname = this.cur.literal;
      this.advance();
      this.expect("COLON");
      const type = this.parseType();
      fields.push({ name: fname, type, line: fline });
    }
    if (fields.length === 0) {
      this.fail(`Struct '${name}' must declare at least one field`);
    }
    this.expect("GT");
    return { kind: "TypeDefNode", name, fields, line };
  }

  private parseType(): ast.TypeExpr {
    const line = this.cur.pos.line;
    if (this.curType() === "ARRAY") {
      this.advance();
      this.expect("LBRACKET");
      const lower = this.parseIntBound();
      this.expect("DOT");
      this.expect("DOT");
      const upper = this.parseIntBound();
      this.expect("RBRACKET");
      this.expect("OF");
      const elem = this.parseType();
      if (upper < lower) {
        this.fail(`Array upper bound ${upper} is less than lower bound ${lower}`);
      }
      return { kind: "ArrayType", lower, upper, elem, line };
    }
    if (this.curType() === "IDENT") {
      const name = this.cur.literal;
      this.advance();
      if (PRIMITIVE_NAMES.has(name)) {
        return { kind: "PrimitiveType", name: name as ast.PrimitiveType["name"], line };
      }
      return { kind: "StructType", name, line };
    }
    this.fail(`Expected a type but found '${describeTok(this.cur)}'`);
  }

  private parseIntBound(): number {
    let neg = false;
    if (this.curType() === "MINUS") {
      neg = true;
      this.advance();
    }
    const tok = this.expect("INT_LIT");
    const n = Number(tok.literal);
    if (!Number.isFinite(n)) this.fail(`Invalid array bound '${tok.literal}'`);
    return neg ? -n : n;
  }

  /** Parses zero or more Dictionary declaration lines, stopping once the
   * current token is no longer an identifier (i.e. Algorithm was reached). */
  private parseVarDecls(): ast.VarDeclNode[] {
    const decls: ast.VarDeclNode[] = [];
    while (this.curType() === "IDENT") {
      const line = this.cur.pos.line;
      const names = [this.cur.literal];
      this.advance();
      while (this.curType() === "COMMA") {
        this.advance();
        names.push(this.expect("IDENT").literal);
      }
      this.expect("COLON");
      const type = this.parseType();
      decls.push({ kind: "VarDeclNode", names, type, line });
    }
    return decls;
  }

  private parseParamList(): ast.Param[] {
    const params: ast.Param[] = [];
    if (this.curType() === "RPAREN") return params;
    for (;;) {
      let mode: ast.ParamMode = "in";
      if (this.curType() === "IN") {
        this.advance();
        mode = "in";
      } else if (this.curType() === "OUT") {
        this.advance();
        mode = "out";
      } else if (this.curType() === "INOUT") {
        this.advance();
        mode = "in/out";
      }
      const line = this.cur.pos.line;
      const names = [this.expect("IDENT").literal];
      while (this.curType() === "COMMA") {
        this.advance();
        names.push(this.expect("IDENT").literal);
      }
      this.expect("COLON");
      const type = this.parseType();
      for (const name of names) {
        params.push({ name, type, mode, line });
      }
      if (this.curType() === "COMMA") {
        this.advance();
        continue;
      }
      break;
    }
    return params;
  }

  private parseFunctionDef(): ast.FunctionNode {
    const line = this.cur.pos.line;
    this.expect("FUNCTION");
    const name = this.expect("IDENT").literal;
    this.expect("LPAREN");
    const params = this.parseParamList();
    this.expect("RPAREN");
    this.expect("ARROW");
    const returnType = this.parseType();
    this.expect("DICTIONARY");
    const locals = this.parseVarDecls();
    this.expect("ALGORITHM");
    const body = this.parseStmtList("ENDFUNCTION");
    this.expect("ENDFUNCTION");
    return { kind: "FunctionNode", name, params, returnType, locals, body, line };
  }

  private parseProcedureDef(): ast.ProcedureNode {
    const line = this.cur.pos.line;
    this.expect("PROCEDURE");
    const name = this.expect("IDENT").literal;
    this.expect("LPAREN");
    const params = this.parseParamList();
    this.expect("RPAREN");
    this.expect("DICTIONARY");
    const locals = this.parseVarDecls();
    this.expect("ALGORITHM");
    const body = this.parseStmtList("ENDPROCEDURE");
    this.expect("ENDPROCEDURE");
    return { kind: "ProcedureNode", name, params, locals, body, line };
  }

  private parseProgram(): ast.ProgramNode {
    const line = this.cur.pos.line;
    this.expect("PROGRAM");
    const name = this.expect("IDENT").literal;
    this.expect("DICTIONARY");
    const locals = this.parseVarDecls();
    this.expect("ALGORITHM");
    const body = this.parseStmtList("ENDPROGRAM");
    this.expect("ENDPROGRAM");
    return { kind: "ProgramNode", name, locals, body, line };
  }

  // ===================== Statements =====================

  private parseStmtList(...stops: TokenType[]): ast.Stmt[] {
    const stmts: ast.Stmt[] = [];
    while (!stops.includes(this.curType()) && this.curType() !== "EOF") {
      stmts.push(this.parseStmt());
    }
    return stmts;
  }

  private parseStmt(): ast.Stmt {
    switch (this.curType()) {
      case "INPUT": {
        const line = this.cur.pos.line;
        this.advance();
        const target = this.parseExpr();
        return { kind: "InputNode", target, line };
      }
      case "OUTPUT": {
        const line = this.cur.pos.line;
        this.advance();
        const values = [this.parseExpr()];
        while (this.curType() === "COMMA") {
          this.advance();
          values.push(this.parseExpr());
        }
        return { kind: "OutputNode", values, line };
      }
      case "IF":
        return this.parseIf();
      case "FOR":
        return this.parseFor();
      case "WHILE":
        return this.parseWhile();
      case "RETURN": {
        const line = this.cur.pos.line;
        this.advance();
        if (this.startsExpr()) {
          const value = this.parseExpr();
          return { kind: "ReturnNode", value, line };
        }
        return { kind: "ReturnNode", value: undefined, line };
      }
      case "IDENT": {
        const line = this.cur.pos.line;
        const name = this.cur.literal;
        if (this.peekType() === "LPAREN") {
          this.advance(); // consume name
          const args = this.parseArgList();
          return { kind: "CallNode", name, args, line };
        }
        const target = this.parsePostfix();
        this.expect("ASSIGN");
        const value = this.parseExpr();
        return { kind: "AssignNode", target, value, line };
      }
      default:
        this.fail(`Unexpected token '${describeTok(this.cur)}' at start of statement`);
    }
  }

  /** Whether the current token could begin an expression; used to detect a
   * bare `return` with no value. */
  private startsExpr(): boolean {
    switch (this.curType()) {
      case "INT_LIT":
      case "REAL_LIT":
      case "STRING_LIT":
      case "CHAR_LIT":
      case "TRUE_LIT":
      case "FALSE_LIT":
      case "IDENT":
      case "LPAREN":
      case "NOT":
      case "MINUS":
        return true;
      default:
        return false;
    }
  }

  private parseIf(): ast.Stmt {
    const line = this.cur.pos.line;
    this.expect("IF");
    const cond = this.parseExpr();
    this.expect("THEN");
    const thenBody = this.parseStmtList("ELSE", "ENDIF");

    const elseIfs: ast.ElseIfClause[] = [];
    let elseBody: ast.Stmt[] | undefined;
    while (this.curType() === "ELSE") {
      const eline = this.cur.pos.line;
      this.advance();
      if (this.curType() === "IF") {
        this.advance();
        const c = this.parseExpr();
        this.expect("THEN");
        const b = this.parseStmtList("ELSE", "ENDIF");
        elseIfs.push({ cond: c, body: b, line: eline });
        continue;
      }
      elseBody = this.parseStmtList("ENDIF");
      break;
    }
    this.expect("ENDIF");
    return { kind: "IfNode", cond, then: thenBody, elseIfs, elseBody, line };
  }

  private parseFor(): ast.Stmt {
    const line = this.cur.pos.line;
    this.expect("FOR");
    const varName = this.expect("IDENT").literal;
    this.expect("ASSIGN");
    const start = this.parseExpr();
    this.expect("TO");
    const end = this.parseExpr();
    let step: ast.Expr | undefined;
    if (this.curType() === "STEP") {
      this.advance();
      step = this.parseExpr();
    }
    const body = this.parseStmtList("ENDFOR");
    this.expect("ENDFOR");
    return { kind: "ForNode", varName, start, end, step, body, line };
  }

  private parseWhile(): ast.Stmt {
    const line = this.cur.pos.line;
    this.expect("WHILE");
    const cond = this.parseExpr();
    const body = this.parseStmtList("ENDWHILE");
    this.expect("ENDWHILE");
    return { kind: "WhileNode", cond, body, line };
  }

  private parseArgList(): ast.Expr[] {
    this.expect("LPAREN");
    const args: ast.Expr[] = [];
    if (this.curType() !== "RPAREN") {
      args.push(this.parseExpr());
      while (this.curType() === "COMMA") {
        this.advance();
        args.push(this.parseExpr());
      }
    }
    this.expect("RPAREN");
    return args;
  }

  // ===================== Expressions =====================
  //
  // Precedence, lowest to highest:
  //   1. OR
  //   2. AND
  //   3. Equality/Comparison (== != < > <= >=)
  //   4. Additive (+ -)
  //   5. Multiplicative (* / MOD)
  //   6. Unary (NOT, unary -)
  //   7. Postfix ([index], .field, (call))
  //   8. Primary (literals, identifiers, parenthesized expressions)

  private parseExpr(): ast.Expr {
    return this.parseOr();
  }

  private parseOr(): ast.Expr {
    let left = this.parseAnd();
    while (this.curType() === "OR") {
      const line = this.cur.pos.line;
      this.advance();
      const right = this.parseAnd();
      left = { kind: "BinaryExpr", op: "OR", left, right, line };
    }
    return left;
  }

  private parseAnd(): ast.Expr {
    let left = this.parseComparison();
    while (this.curType() === "AND") {
      const line = this.cur.pos.line;
      this.advance();
      const right = this.parseComparison();
      left = { kind: "BinaryExpr", op: "AND", left, right, line };
    }
    return left;
  }

  private static readonly COMPARISON_OPS: Partial<Record<TokenType, ast.BinaryOp>> = {
    EQ: "EQ",
    NEQ: "NEQ",
    LT: "LT",
    GT: "GT",
    LTE: "LTE",
    GTE: "GTE",
  };

  private parseComparison(): ast.Expr {
    let left = this.parseAdditive();
    let op: ast.BinaryOp | undefined;
    while ((op = Parser.COMPARISON_OPS[this.curType()]) !== undefined) {
      const line = this.cur.pos.line;
      this.advance();
      const right = this.parseAdditive();
      left = { kind: "BinaryExpr", op, left, right, line };
    }
    return left;
  }

  private parseAdditive(): ast.Expr {
    let left = this.parseMultiplicative();
    while (this.curType() === "PLUS" || this.curType() === "MINUS") {
      const op: ast.BinaryOp = this.curType() === "PLUS" ? "PLUS" : "MINUS";
      const line = this.cur.pos.line;
      this.advance();
      const right = this.parseMultiplicative();
      left = { kind: "BinaryExpr", op, left, right, line };
    }
    return left;
  }

  private parseMultiplicative(): ast.Expr {
    let left = this.parseUnary();
    while (this.curType() === "STAR" || this.curType() === "SLASH" || this.curType() === "MOD") {
      const op: ast.BinaryOp = this.curType() === "STAR" ? "STAR" : this.curType() === "SLASH" ? "SLASH" : "MOD";
      const line = this.cur.pos.line;
      this.advance();
      const right = this.parseUnary();
      left = { kind: "BinaryExpr", op, left, right, line };
    }
    return left;
  }

  private parseUnary(): ast.Expr {
    if (this.curType() === "NOT" || this.curType() === "MINUS") {
      const op: ast.UnaryOp = this.curType() === "NOT" ? "NOT" : "MINUS";
      const line = this.cur.pos.line;
      this.advance();
      const operand = this.parseUnary();
      return { kind: "UnaryExpr", op, operand, line };
    }
    return this.parsePostfix();
  }

  private parsePostfix(): ast.Expr {
    let expr = this.parsePrimary();
    for (;;) {
      if (this.curType() === "LBRACKET") {
        const line = this.cur.pos.line;
        this.advance();
        const index = this.parseExpr();
        this.expect("RBRACKET");
        expr = { kind: "ArrayAccessExpr", array: expr, index, line };
      } else if (this.curType() === "DOT") {
        const line = this.cur.pos.line;
        this.advance();
        const field = this.expect("IDENT").literal;
        expr = { kind: "FieldAccessExpr", struct: expr, field, line };
      } else {
        return expr;
      }
    }
  }

  private parsePrimary(): ast.Expr {
    const tok = this.cur;
    switch (tok.type) {
      case "INT_LIT": {
        this.advance();
        const n = Number(tok.literal);
        if (!Number.isFinite(n)) this.fail(`Invalid integer literal '${tok.literal}'`);
        return { kind: "LiteralExpr", litKind: "Int", intVal: n, line: tok.pos.line };
      }
      case "REAL_LIT": {
        this.advance();
        const f = Number(tok.literal);
        if (!Number.isFinite(f)) this.fail(`Invalid real literal '${tok.literal}'`);
        return { kind: "LiteralExpr", litKind: "Real", realVal: f, line: tok.pos.line };
      }
      case "STRING_LIT":
        this.advance();
        return { kind: "LiteralExpr", litKind: "String", strVal: tok.literal, line: tok.pos.line };
      case "CHAR_LIT":
        this.advance();
        return { kind: "LiteralExpr", litKind: "Char", charVal: tok.literal, line: tok.pos.line };
      case "TRUE_LIT":
        this.advance();
        return { kind: "LiteralExpr", litKind: "Bool", boolVal: true, line: tok.pos.line };
      case "FALSE_LIT":
        this.advance();
        return { kind: "LiteralExpr", litKind: "Bool", boolVal: false, line: tok.pos.line };
      case "IDENT": {
        const name = tok.literal;
        this.advance();
        if (this.curType() === "LPAREN") {
          const args = this.parseArgList();
          return { kind: "FunctionCallExpr", name, args, line: tok.pos.line };
        }
        return { kind: "IdentifierExpr", name, line: tok.pos.line };
      }
      case "LPAREN": {
        this.advance();
        const e = this.parseExpr();
        this.expect("RPAREN");
        return e;
      }
      default:
        this.fail(`Unexpected token '${describeTok(this.cur)}' in expression`);
    }
  }
}

/** Parses a complete .pseudo token stream into an ast.File. Throws a
 * PseudoError at the first syntax problem encountered. */
export function parseFile(tokens: Token[]): ast.File {
  return new Parser(tokens).parseFile();
}
