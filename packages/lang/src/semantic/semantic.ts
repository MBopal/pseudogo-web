/**
 * Semantic analysis: builds symbol tables, resolves names, checks types,
 * and validates control flow (e.g. every path through a function returns a
 * value) before any code executes. A direct port of `pseudogo-cli`'s
 * `internal/semantic` package.
 */

import * as ast from "../ast/ast.js";
import { PseudoError } from "../errors/errors.js";

/** Result of a successful semantic analysis pass: fully resolved symbol
 * tables the evaluator can use directly, without re-validating at runtime. */
export interface SemanticInfo {
  structDefs: Map<string, ast.TypeDefNode>;
  functions: Map<string, ast.FunctionNode>;
  procedures: Map<string, ast.ProcedureNode>;
}

interface FuncCtx {
  isFunction: boolean;
  isProcedure: boolean;
  isProgram: boolean;
  returnType: ast.TypeExpr | undefined;
  name: string;
}

/** A single call frame's variable scope: name -> declared type. */
type Scope = Map<string, ast.TypeExpr>;

function fail(line: number, message: string): never {
  throw new PseudoError("Compile error", line, message);
}

class Analyzer {
  readonly structDefs = new Map<string, ast.TypeDefNode>();
  readonly functions = new Map<string, ast.FunctionNode>();
  readonly procedures = new Map<string, ast.ProcedureNode>();

  registerCallable(name: string, line: number): void {
    if (this.functions.has(name)) fail(line, `'${name}' is already defined as a function`);
    if (this.procedures.has(name)) fail(line, `'${name}' is already defined as a procedure`);
  }

  // ===================== Type validation & comparison =====================

  validateTypeExpr(t: ast.TypeExpr): void {
    if (t.kind === "ArrayType") {
      this.validateTypeExpr(t.elem);
    } else if (t.kind === "StructType") {
      if (!this.structDefs.has(t.name)) fail(t.line, `Unknown type '${t.name}'`);
    }
  }

  // ===================== Function / procedure / program checking =====================

  checkFunction(fn: ast.FunctionNode): void {
    const sc: Scope = new Map();
    for (const p of fn.params) {
      if (sc.has(p.name)) fail(p.line, `Duplicate parameter '${p.name}' in function '${fn.name}'`);
      sc.set(p.name, p.type);
    }
    this.declareLocals(sc, fn.locals, `function '${fn.name}'`);

    const ctx: FuncCtx = { isFunction: true, isProcedure: false, isProgram: false, returnType: fn.returnType, name: fn.name };
    const returnsAll = this.checkStmts(fn.body, sc, ctx);
    if (!returnsAll) fail(fn.line, `Not all paths in function '${fn.name}' return a value`);
  }

  checkProcedure(pr: ast.ProcedureNode): void {
    const sc: Scope = new Map();
    for (const p of pr.params) {
      if (sc.has(p.name)) fail(p.line, `Duplicate parameter '${p.name}' in procedure '${pr.name}'`);
      sc.set(p.name, p.type);
    }
    this.declareLocals(sc, pr.locals, `procedure '${pr.name}'`);

    const ctx: FuncCtx = { isFunction: false, isProcedure: true, isProgram: false, returnType: undefined, name: pr.name };
    this.checkStmts(pr.body, sc, ctx);
  }

  checkProgram(prog: ast.ProgramNode): void {
    const sc: Scope = new Map();
    this.declareLocals(sc, prog.locals, `Program '${prog.name}'`);
    const ctx: FuncCtx = { isFunction: false, isProcedure: false, isProgram: true, returnType: undefined, name: prog.name };
    this.checkStmts(prog.body, sc, ctx);
  }

  private declareLocals(sc: Scope, decls: ast.VarDeclNode[], context: string): void {
    for (const d of decls) {
      this.validateTypeExpr(d.type);
      for (const name of d.names) {
        if (sc.has(name)) fail(d.line, `Variable '${name}' is already declared in ${context}`);
        sc.set(name, d.type);
      }
    }
  }

  // ===================== Statement checking =====================

  /** Checks a statement list, returning whether it guarantees a return on
   * every path reaching the end of the list. */
  private checkStmts(stmts: ast.Stmt[], sc: Scope, ctx: FuncCtx): boolean {
    let returnsAll = false;
    for (const s of stmts) {
      if (this.checkStmt(s, sc, ctx)) returnsAll = true;
    }
    return returnsAll;
  }

  private checkStmt(s: ast.Stmt, sc: Scope, ctx: FuncCtx): boolean {
    switch (s.kind) {
      case "AssignNode": {
        if (!isLValue(s.target)) fail(s.line, "Left-hand side of assignment must be a variable");
        const targetType = this.checkExpr(s.target, sc);
        const valType = this.checkExpr(s.value, sc);
        if (!isAssignable(valType, targetType, true)) {
          fail(s.line, `Cannot assign ${typeName(valType)} to ${typeName(targetType)} ${exprDesc(s.target)}`);
        }
        return false;
      }

      case "InputNode": {
        if (!isLValue(s.target)) fail(s.line, "INPUT target must be a variable");
        const targetType = this.checkExpr(s.target, sc);
        if (targetType.kind !== "PrimitiveType") {
          fail(s.line, `INPUT target must be a variable of a primitive type, got ${typeName(targetType)}`);
        }
        return false;
      }

      case "OutputNode": {
        for (const v of s.values) this.checkExpr(v, sc);
        return false;
      }

      case "IfNode": {
        const cond = this.checkExpr(s.cond, sc);
        if (!isPrimitive(cond, "BOOLEAN")) fail(s.line, `IF condition must be a Boolean expression, got ${typeName(cond)}`);
        let allReturn = this.checkStmts(s.then, sc, ctx);
        for (const ei of s.elseIfs) {
          const c = this.checkExpr(ei.cond, sc);
          if (!isPrimitive(c, "BOOLEAN")) fail(ei.line, `ELSE IF condition must be a Boolean expression, got ${typeName(c)}`);
          if (!this.checkStmts(ei.body, sc, ctx)) allReturn = false;
        }
        if (s.elseBody !== undefined) {
          if (!this.checkStmts(s.elseBody, sc, ctx)) allReturn = false;
        } else {
          allReturn = false;
        }
        return allReturn;
      }

      case "ForNode": {
        const t = sc.get(s.varName);
        if (t === undefined) fail(s.line, `Variable '${s.varName}' not declared in this scope`);
        if (!isPrimitive(t, "INTEGER")) fail(s.line, `FOR loop variable '${s.varName}' must be an Integer`);
        const st = this.checkExpr(s.start, sc);
        if (!isPrimitive(st, "INTEGER")) fail(s.line, `FOR start value must be an Integer, got ${typeName(st)}`);
        const et = this.checkExpr(s.end, sc);
        if (!isPrimitive(et, "INTEGER")) fail(s.line, `FOR end value must be an Integer, got ${typeName(et)}`);
        if (s.step !== undefined) {
          const stp = this.checkExpr(s.step, sc);
          if (!isPrimitive(stp, "INTEGER")) fail(s.line, `FOR step value must be an Integer, got ${typeName(stp)}`);
        }
        this.checkStmts(s.body, sc, ctx);
        return false;
      }

      case "WhileNode": {
        const c = this.checkExpr(s.cond, sc);
        if (!isPrimitive(c, "BOOLEAN")) fail(s.line, `WHILE condition must be a Boolean expression, got ${typeName(c)}`);
        this.checkStmts(s.body, sc, ctx);
        return false;
      }

      case "CallNode": {
        const proc = this.procedures.get(s.name);
        if (proc === undefined) {
          if (this.functions.has(s.name)) {
            fail(s.line, `'${s.name}' is a function and must be used as an expression, not a statement`);
          }
          fail(s.line, `Procedure '${s.name}' not declared`);
        }
        this.checkCallArgs(proc.params, s.args, sc, s.name, "Procedure");
        return false;
      }

      case "ReturnNode": {
        if (ctx.isProgram) fail(s.line, "'return' can only be used inside a function or procedure");
        if (ctx.isProcedure) {
          if (s.value !== undefined) fail(s.line, `Procedure '${ctx.name}' must not return a value`);
          return true;
        }
        // function
        if (s.value === undefined) fail(s.line, `Function '${ctx.name}' must return a value`);
        const vt = this.checkExpr(s.value, sc);
        if (!isAssignable(vt, ctx.returnType!, true)) {
          fail(s.line, `Function '${ctx.name}' must return ${typeName(ctx.returnType)}, got ${typeName(vt)}`);
        }
        return true;
      }
    }
  }

  // ===================== Call argument checking =====================

  private checkCallArgs(params: ast.Param[], args: ast.Expr[], sc: Scope, name: string, kind: string): void {
    const line = args[0]?.line ?? 0;
    if (args.length !== params.length) {
      fail(line, `${kind} '${name}' expects ${params.length} arguments, got ${args.length}`);
    }
    params.forEach((param, i) => {
      const arg = args[i]!;
      const argType = this.checkExpr(arg, sc);
      if (param.mode === "in") {
        if (!isAssignable(argType, param.type, true)) {
          fail(arg.line, `Argument ${i + 1} of '${name}' expects ${typeName(param.type)}, got ${typeName(argType)}`);
        }
      } else {
        // out / in-out
        if (!isLValue(arg)) {
          fail(arg.line, `Argument ${i + 1} must be a variable (passed as ${param.mode})`);
        }
        if (!typesEqual(argType, param.type)) {
          fail(arg.line, `Argument ${i + 1} of '${name}' expects ${typeName(param.type)}, got ${typeName(argType)}`);
        }
      }
    });
  }

  // ===================== Expression checking =====================

  checkExpr(e: ast.Expr, sc: Scope): ast.TypeExpr {
    switch (e.kind) {
      case "LiteralExpr":
        switch (e.litKind) {
          case "Int":
            return { kind: "PrimitiveType", name: "INTEGER", line: e.line };
          case "Real":
            return { kind: "PrimitiveType", name: "REAL", line: e.line };
          case "String":
            return { kind: "PrimitiveType", name: "STRING", line: e.line };
          case "Char":
            return { kind: "PrimitiveType", name: "CHAR", line: e.line };
          case "Bool":
            return { kind: "PrimitiveType", name: "BOOLEAN", line: e.line };
        }
        break;

      case "IdentifierExpr": {
        const t = sc.get(e.name);
        if (t === undefined) fail(e.line, `Variable '${e.name}' not declared in this scope`);
        return t;
      }

      case "ArrayAccessExpr": {
        const arrType = this.checkExpr(e.array, sc);
        if (arrType.kind !== "ArrayType") fail(e.line, `${exprDesc(e.array)} is not an array`);
        const idxType = this.checkExpr(e.index, sc);
        if (!isPrimitive(idxType, "INTEGER")) fail(e.line, `Array index must be an Integer expression, got ${typeName(idxType)}`);
        return arrType.elem;
      }

      case "FieldAccessExpr": {
        const structType = this.checkExpr(e.struct, sc);
        if (structType.kind !== "StructType") fail(e.line, `${exprDesc(e.struct)} is not a struct`);
        const def = this.structDefs.get(structType.name)!;
        const field = def.fields.find((f) => f.name === e.field);
        if (field === undefined) fail(e.line, `Struct '${structType.name}' has no field '${e.field}'`);
        return field.type;
      }

      case "FunctionCallExpr": {
        const fn = this.functions.get(e.name);
        if (fn === undefined) {
          if (this.procedures.has(e.name)) fail(e.line, `'${e.name}' is a procedure and cannot be used as an expression`);
          fail(e.line, `Function '${e.name}' not declared`);
        }
        this.checkCallArgs(fn.params, e.args, sc, e.name, "Function");
        return fn.returnType;
      }

      case "UnaryExpr": {
        const operand = this.checkExpr(e.operand, sc);
        if (e.op === "NOT") {
          if (!isPrimitive(operand, "BOOLEAN")) fail(e.line, `'NOT' requires a Boolean operand, got ${typeName(operand)}`);
          return { kind: "PrimitiveType", name: "BOOLEAN", line: e.line };
        }
        // unary MINUS
        if (!isNumeric(operand)) fail(e.line, `Unary '-' requires a numeric operand, got ${typeName(operand)}`);
        return operand;
      }

      case "BinaryExpr":
        return this.checkBinary(e, sc);
    }
  }

  private checkBinary(e: ast.BinaryExpr, sc: Scope): ast.TypeExpr {
    const lt = this.checkExpr(e.left, sc);
    const rt = this.checkExpr(e.right, sc);

    switch (e.op) {
      case "AND":
      case "OR":
        if (!isPrimitive(lt, "BOOLEAN") || !isPrimitive(rt, "BOOLEAN")) {
          fail(e.line, `Cannot apply '${e.op}' to ${typeName(lt)} and ${typeName(rt)}`);
        }
        return { kind: "PrimitiveType", name: "BOOLEAN", line: e.line };

      case "EQ":
      case "NEQ":
        if (!(typesEqual(lt, rt) || (isNumeric(lt) && isNumeric(rt)))) {
          fail(e.line, `Cannot compare ${typeName(lt)} and ${typeName(rt)}`);
        }
        return { kind: "PrimitiveType", name: "BOOLEAN", line: e.line };

      case "LT":
      case "GT":
      case "LTE":
      case "GTE":
        if (!isNumeric(lt) || !isNumeric(rt)) {
          fail(e.line, `Cannot compare ${typeName(lt)} and ${typeName(rt)}`);
        }
        return { kind: "PrimitiveType", name: "BOOLEAN", line: e.line };

      case "PLUS":
      case "MINUS":
      case "STAR":
      case "SLASH":
        if (!isNumeric(lt) || !isNumeric(rt)) {
          fail(e.line, `Cannot apply operator '${opSymbol(e.op)}' to ${typeName(lt)} and ${typeName(rt)}`);
        }
        if (isPrimitive(lt, "REAL") || isPrimitive(rt, "REAL")) {
          return { kind: "PrimitiveType", name: "REAL", line: e.line };
        }
        return { kind: "PrimitiveType", name: "INTEGER", line: e.line };

      case "MOD":
        if (!isPrimitive(lt, "INTEGER") || !isPrimitive(rt, "INTEGER")) {
          fail(e.line, `'MOD' requires Integer operands, got ${typeName(lt)} and ${typeName(rt)}`);
        }
        return { kind: "PrimitiveType", name: "INTEGER", line: e.line };
    }
  }
}

function opSymbol(op: ast.BinaryOp): string {
  switch (op) {
    case "PLUS":
      return "+";
    case "MINUS":
      return "-";
    case "STAR":
      return "*";
    case "SLASH":
      return "/";
    default:
      return op;
  }
}

// ===================== Type comparison helpers =====================

function typesEqual(x: ast.TypeExpr, y: ast.TypeExpr): boolean {
  if (x.kind !== y.kind) return false;
  switch (x.kind) {
    case "PrimitiveType":
      return x.name === (y as ast.PrimitiveType).name;
    case "ArrayType": {
      const yt = y as ast.ArrayType;
      return x.lower === yt.lower && x.upper === yt.upper && typesEqual(x.elem, yt.elem);
    }
    case "StructType":
      return x.name === (y as ast.StructType).name;
  }
}

function isPrimitive(t: ast.TypeExpr, name: ast.PrimitiveType["name"]): boolean {
  return t.kind === "PrimitiveType" && t.name === name;
}

function isNumeric(t: ast.TypeExpr): boolean {
  return isPrimitive(t, "INTEGER") || isPrimitive(t, "REAL");
}

/** Integer -> Real widening is allowed only when allowWidening is true (used
 * for assignments, expressions, and 'in' parameters, but not for
 * 'out'/'in-out' arguments, which require an exact match since they alias
 * the caller's storage). */
function isAssignable(from: ast.TypeExpr, to: ast.TypeExpr, allowWidening: boolean): boolean {
  if (typesEqual(from, to)) return true;
  if (allowWidening && isPrimitive(from, "INTEGER") && isPrimitive(to, "REAL")) return true;
  return false;
}

function typeName(t: ast.TypeExpr | undefined): string {
  return t === undefined ? "unknown" : ast.typeExprToString(t);
}

// ===================== L-value classification =====================

function isLValue(e: ast.Expr): boolean {
  switch (e.kind) {
    case "IdentifierExpr":
      return true;
    case "ArrayAccessExpr":
      return isLValue(e.array);
    case "FieldAccessExpr":
      return isLValue(e.struct);
    default:
      return false;
  }
}

/** Short human-readable description of an expression for error messages,
 * preferring a variable name when one is available. */
function exprDesc(e: ast.Expr): string {
  switch (e.kind) {
    case "IdentifierExpr":
      return `variable '${e.name}'`;
    case "ArrayAccessExpr":
      return "array element";
    case "FieldAccessExpr":
      return `struct field '${e.field}'`;
    default:
      return "expression";
  }
}

/** Runs full semantic analysis over a parsed file, returning resolved
 * symbol-table info. Throws a PseudoError at the first semantic problem. */
export function analyze(file: ast.File): SemanticInfo {
  const a = new Analyzer();

  // Pass 1: register struct types in declaration order, so each struct may
  // only reference structs already defined earlier in the file.
  for (const td of file.typeDefs) {
    if (a.structDefs.has(td.name)) fail(td.line, `Struct type '${td.name}' is already defined`);
    const seen = new Set<string>();
    for (const f of td.fields) {
      if (seen.has(f.name)) fail(f.line, `Duplicate field '${f.name}' in struct '${td.name}'`);
      seen.add(f.name);
      a.validateTypeExpr(f.type);
    }
    a.structDefs.set(td.name, td);
  }

  // Pass 2: register all function/procedure signatures before checking any
  // body, so mutual recursion and forward references work.
  for (const fn of file.functions) {
    a.registerCallable(fn.name, fn.line);
    for (const p of fn.params) a.validateTypeExpr(p.type);
    a.validateTypeExpr(fn.returnType);
    a.functions.set(fn.name, fn);
  }
  for (const pr of file.procedures) {
    a.registerCallable(pr.name, pr.line);
    for (const p of pr.params) a.validateTypeExpr(p.type);
    a.procedures.set(pr.name, pr);
  }

  // Pass 3: check bodies now that the full global namespace is known.
  for (const fn of file.functions) a.checkFunction(fn);
  for (const pr of file.procedures) a.checkProcedure(pr);
  a.checkProgram(file.program);

  return { structDefs: a.structDefs, functions: a.functions, procedures: a.procedures };
}
