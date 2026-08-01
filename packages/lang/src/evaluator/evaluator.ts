/**
 * Executes a semantically-checked PseudoGo AST. A port of `pseudogo-cli`'s
 * `internal/evaluator` package, with one structural difference required by
 * the web target: every execution function is a generator (`function*`),
 * chained via `yield*`, so execution can pause at `INPUT`/`OUTPUT` and
 * periodically during loops (see `events.ts`) instead of blocking
 * synchronously the way the Go CLI's stdin/stdout reads do.
 */

import * as ast from "../ast/ast.js";
import { PseudoError } from "../errors/errors.js";
import { Env } from "../runtime/env.js";
import {
  type Box,
  type Value,
  box,
  boolVal,
  charVal,
  deepCopy,
  defaultValue,
  format,
  intVal,
  realVal,
  stringVal,
} from "../runtime/value.js";
import type { SemanticInfo } from "../semantic/semantic.js";
import type { EvalEvent, EvalResume } from "./events.js";

// NOTE on this number vs. the Go CLI's 10000: Go's goroutine stacks grow
// dynamically and cheaply, so a recursive PseudoGo call there costs very
// little native stack. Here, every recursive PseudoGo call chains through
// several `yield*`-delegated generator frames (execStmt -> evalExpr ->
// callFunction -> bindParams -> ... -> the next callFunction), and each of
// those costs real JS call-stack depth. Empirically, this evaluator's exact
// call chain overflows Node's default stack at ~545 levels of PseudoGo
// recursion; 300 leaves solid headroom for smaller stacks in some browsers/
// devices and heavier real programs, while still being far beyond anything
// a legitimate teaching program needs (factorial, tree traversal, etc. stay
// well under 100 levels deep in practice). This is a deliberate, disclosed
// deviation from the Go CLI's number -- see PRD_pseudogo_web.md. The
// RangeError catch in callFunction/callProcedure below is a defense-in-depth
// fallback in case a program overflows the native stack some other way
// (e.g. deep non-recursive nesting) before this counter trips.
const MAX_RECURSION_DEPTH = 300;
const CHECKPOINT_INTERVAL = 2000;

interface Frame {
  env: Env;
  scope: Map<string, ast.TypeExpr>;
}

type Ctrl = { kind: "normal" } | { kind: "return"; value: Value };

interface OutBinding {
  paramName: string;
  argExpr: ast.Expr;
}

type Gen<T> = Generator<EvalEvent, T, EvalResume>;

class Evaluator {
  private callDepth = 0;
  private stepCount = 0;

  constructor(private readonly info: SemanticInfo) {}

  *run(file: ast.File): Gen<void> {
    const prog = file.program;
    const env = new Env();
    const scope = new Map<string, ast.TypeExpr>();
    for (const decl of prog.locals) {
      for (const name of decl.names) {
        env.define(name, box(defaultValue(decl.type, this.info.structDefs)));
        scope.set(name, decl.type);
      }
    }
    yield* this.execStmts(prog.body, { env, scope });
  }

  /** Increments the step counter and periodically yields a checkpoint, so a
   * driver can cancel a runaway loop even if it never touches INPUT/OUTPUT. */
  private *tick(): Gen<void> {
    this.stepCount++;
    if (this.stepCount % CHECKPOINT_INTERVAL === 0) {
      yield { type: "checkpoint" };
    }
  }

  // ===================== Statement execution =====================

  private *execStmts(stmts: ast.Stmt[], frame: Frame): Gen<Ctrl> {
    for (const s of stmts) {
      const c = yield* this.execStmt(s, frame);
      if (c.kind === "return") return c;
    }
    return { kind: "normal" };
  }

  private *execStmt(s: ast.Stmt, frame: Frame): Gen<Ctrl> {
    yield* this.tick();
    switch (s.kind) {
      case "AssignNode": {
        const val = yield* this.evalExpr(s.value, frame);
        const b = yield* this.resolveLValue(s.target, frame);
        const targetType = this.lvalueType(s.target, frame);
        b.value = coerce(deepCopy(val), targetType);
        return { kind: "normal" };
      }

      case "InputNode":
        yield* this.execInput(s, frame);
        return { kind: "normal" };

      case "OutputNode": {
        const parts: string[] = [];
        for (const v of s.values) {
          const val = yield* this.evalExpr(v, frame);
          parts.push(format(val));
        }
        yield { type: "output", text: `${parts.join(" ")}\n` };
        return { kind: "normal" };
      }

      case "IfNode": {
        const cond = yield* this.evalExpr(s.cond, frame);
        if (isTrue(cond)) return yield* this.execStmts(s.then, frame);
        for (const ei of s.elseIfs) {
          const c = yield* this.evalExpr(ei.cond, frame);
          if (isTrue(c)) return yield* this.execStmts(ei.body, frame);
        }
        if (s.elseBody !== undefined) return yield* this.execStmts(s.elseBody, frame);
        return { kind: "normal" };
      }

      case "ForNode":
        return yield* this.execFor(s, frame);

      case "WhileNode":
        return yield* this.execWhile(s, frame);

      case "CallNode":
        yield* this.callProcedure(s.name, s.args, frame, s.line);
        return { kind: "normal" };

      case "ReturnNode": {
        if (s.value === undefined) return { kind: "return", value: { kind: "Uninitialized" } };
        const v = yield* this.evalExpr(s.value, frame);
        return { kind: "return", value: v };
      }
    }
  }

  private *execFor(s: ast.ForNode, frame: Frame): Gen<Ctrl> {
    const b = frame.env.get(s.varName)!;
    const startV = yield* this.evalExpr(s.start, frame);
    const endV = yield* this.evalExpr(s.end, frame);
    let step = 1;
    if (s.step !== undefined) {
      const stepV = yield* this.evalExpr(s.step, frame);
      step = stepV.kind === "Integer" ? stepV.v : 1;
    }
    if (step === 0) throw new PseudoError("Runtime error", s.line, "FOR loop STEP cannot be 0");

    const start = startV.kind === "Integer" ? startV.v : 0;
    const end = endV.kind === "Integer" ? endV.v : 0;
    let cur = start;
    while ((step > 0 && cur <= end) || (step < 0 && cur >= end)) {
      b.value = intVal(cur);
      const c = yield* this.execStmts(s.body, frame);
      if (c.kind === "return") return c;
      cur += step;
    }
    return { kind: "normal" };
  }

  private *execWhile(s: ast.WhileNode, frame: Frame): Gen<Ctrl> {
    for (;;) {
      const cond = yield* this.evalExpr(s.cond, frame);
      if (!isTrue(cond)) break;
      const c = yield* this.execStmts(s.body, frame);
      if (c.kind === "return") return c;
    }
    return { kind: "normal" };
  }

  private *execInput(n: ast.InputNode, frame: Frame): Gen<void> {
    yield { type: "output", text: "? " };
    const raw = yield { type: "input", line: n.line };
    if (raw === undefined) {
      // A driver resumes with undefined specifically to signal "no more
      // input available" (as opposed to an empty string, which is valid
      // input for a String-typed target). Centralized here, rather than
      // duplicated per-driver, so this matches the Go CLI's exact error
      // regardless of which driver (test harness, future Worker) is used.
      throw new PseudoError("Runtime error", n.line, "Unexpected end of input");
    }

    const t = this.lvalueType(n.target, frame);
    const primName = t?.kind === "PrimitiveType" ? t.name : undefined;
    let val: Value;
    switch (primName) {
      case "Integer": {
        const trimmed = raw.trim();
        if (!/^[+-]?\d+$/.test(trimmed)) {
          throw new PseudoError("Runtime error", n.line, `Invalid input '${raw}': expected an Integer`);
        }
        val = intVal(Number(trimmed));
        break;
      }
      case "Real": {
        const trimmed = raw.trim();
        const f = Number(trimmed);
        if (trimmed === "" || Number.isNaN(f)) {
          throw new PseudoError("Runtime error", n.line, `Invalid input '${raw}': expected a Real`);
        }
        val = realVal(f);
        break;
      }
      case "Boolean": {
        const trimmed = raw.trim();
        if (trimmed === "true") val = boolVal(true);
        else if (trimmed === "false") val = boolVal(false);
        else throw new PseudoError("Runtime error", n.line, `Invalid input '${raw}': expected 'true' or 'false'`);
        break;
      }
      case "Char": {
        const trimmed = raw.trim();
        if ([...trimmed].length !== 1) {
          throw new PseudoError("Runtime error", n.line, `Invalid input '${raw}': expected a single character`);
        }
        val = charVal(trimmed);
        break;
      }
      default:
        val = stringVal(raw);
    }

    const b = yield* this.resolveLValue(n.target, frame);
    b.value = val;
  }

  // ===================== Calls =====================

  private *callFunction(name: string, args: ast.Expr[], callerFrame: Frame, line: number): Gen<Value> {
    const fn = this.info.functions.get(name)!;
    this.callDepth++;
    try {
      if (this.callDepth > MAX_RECURSION_DEPTH) {
        throw new PseudoError("Runtime error", line, `Recursion limit (${MAX_RECURSION_DEPTH}) exceeded`);
      }
      const { frame: calleeFrame, outs } = yield* this.bindParams(fn.params, args, callerFrame);
      this.declareLocals(calleeFrame, fn.locals);

      const c = yield* this.execStmts(fn.body, calleeFrame);
      yield* this.writeBackOut(outs, calleeFrame.env, callerFrame);
      if (c.kind !== "return") {
        throw new PseudoError("Runtime error", line, `Function '${name}' completed without returning a value`);
      }
      return coerce(c.value, fn.returnType);
    } catch (err) {
      if (err instanceof RangeError) {
        throw new PseudoError("Runtime error", line, `Recursion limit (${MAX_RECURSION_DEPTH}) exceeded`);
      }
      throw err;
    } finally {
      this.callDepth--;
    }
  }

  private *callProcedure(name: string, args: ast.Expr[], callerFrame: Frame, line: number): Gen<Ctrl> {
    const proc = this.info.procedures.get(name)!;
    this.callDepth++;
    try {
      if (this.callDepth > MAX_RECURSION_DEPTH) {
        throw new PseudoError("Runtime error", line, `Recursion limit (${MAX_RECURSION_DEPTH}) exceeded`);
      }
      const { frame: calleeFrame, outs } = yield* this.bindParams(proc.params, args, callerFrame);
      this.declareLocals(calleeFrame, proc.locals);

      const c = yield* this.execStmts(proc.body, calleeFrame);
      yield* this.writeBackOut(outs, calleeFrame.env, callerFrame);
      return c;
    } catch (err) {
      if (err instanceof RangeError) {
        throw new PseudoError("Runtime error", line, `Recursion limit (${MAX_RECURSION_DEPTH}) exceeded`);
      }
      throw err;
    } finally {
      this.callDepth--;
    }
  }

  private declareLocals(frame: Frame, locals: ast.VarDeclNode[]): void {
    for (const decl of locals) {
      for (const name of decl.names) {
        frame.env.define(name, box(defaultValue(decl.type, this.info.structDefs)));
        frame.scope.set(name, decl.type);
      }
    }
  }

  private *bindParams(
    params: ast.Param[],
    args: ast.Expr[],
    callerFrame: Frame,
  ): Gen<{ frame: Frame; outs: OutBinding[] }> {
    const env = new Env();
    const scope = new Map<string, ast.TypeExpr>();
    const outs: OutBinding[] = [];

    for (let i = 0; i < params.length; i++) {
      const param = params[i]!;
      const arg = args[i]!;
      if (param.mode === "in") {
        const v = yield* this.evalExpr(arg, callerFrame);
        env.define(param.name, box(coerce(deepCopy(v), param.type)));
      } else if (param.mode === "out") {
        // Uninitialised inside, regardless of the caller's current value;
        // copied back to the caller only on successful return.
        env.define(param.name, box(defaultValue(param.type, this.info.structDefs)));
        outs.push({ paramName: param.name, argExpr: arg });
      } else {
        // in/out: bind directly to the caller's storage -- same Box, no copy.
        const b = yield* this.resolveLValue(arg, callerFrame);
        env.define(param.name, b);
      }
      scope.set(param.name, param.type);
    }
    return { frame: { env, scope }, outs };
  }

  private *writeBackOut(outs: OutBinding[], calleeEnv: Env, callerFrame: Frame): Gen<void> {
    for (const ob of outs) {
      const finalBox = calleeEnv.get(ob.paramName)!;
      const b = yield* this.resolveLValue(ob.argExpr, callerFrame);
      b.value = deepCopy(finalBox.value);
    }
  }

  // ===================== Expressions =====================

  private *evalExpr(expr: ast.Expr, frame: Frame): Gen<Value> {
    switch (expr.kind) {
      case "LiteralExpr":
        switch (expr.litKind) {
          case "Int":
            return intVal(expr.intVal);
          case "Real":
            return realVal(expr.realVal);
          case "String":
            return stringVal(expr.strVal);
          case "Char":
            return charVal(expr.charVal);
          case "Bool":
            return boolVal(expr.boolVal);
        }
        break;

      case "IdentifierExpr": {
        const b = frame.env.get(expr.name);
        if (b === undefined) {
          throw new PseudoError("Runtime error", expr.line, `Variable '${expr.name}' not declared in this scope`);
        }
        if (b.value.kind === "Uninitialized") {
          throw new PseudoError("Runtime error", expr.line, `Variable '${expr.name}' used before assignment`);
        }
        return b.value;
      }

      case "ArrayAccessExpr": {
        const arr = yield* this.evalExpr(expr.array, frame);
        const idxV = yield* this.evalExpr(expr.index, frame);
        if (arr.kind !== "Array" || idxV.kind !== "Integer") {
          throw new PseudoError("Runtime error", expr.line, "Internal error: invalid array access");
        }
        const idx = idxV.v;
        if (idx < arr.v.lower || idx > arr.v.upper) {
          throw new PseudoError("Runtime error", expr.line, `Array index ${idx} is out of bounds (${arr.v.lower}..${arr.v.upper})`);
        }
        const elemBox = arr.v.elems[idx - arr.v.lower]!;
        if (elemBox.value.kind === "Uninitialized") {
          throw new PseudoError("Runtime error", expr.line, `Array element ${idx} used before assignment`);
        }
        return elemBox.value;
      }

      case "FieldAccessExpr": {
        const sv = yield* this.evalExpr(expr.struct, frame);
        if (sv.kind !== "Struct") {
          throw new PseudoError("Runtime error", expr.line, "Internal error: invalid field access");
        }
        const fb = sv.v.fields.get(expr.field);
        if (fb === undefined) {
          throw new PseudoError("Runtime error", expr.line, `Struct '${sv.v.typeName}' has no field '${expr.field}'`);
        }
        if (fb.value.kind === "Uninitialized") {
          throw new PseudoError("Runtime error", expr.line, `Field '${expr.field}' used before assignment`);
        }
        return fb.value;
      }

      case "FunctionCallExpr":
        return yield* this.callFunction(expr.name, expr.args, frame, expr.line);

      case "UnaryExpr": {
        const v = yield* this.evalExpr(expr.operand, frame);
        if (expr.op === "NOT") return boolVal(!isTrue(v));
        if (v.kind === "Integer") return intVal(-v.v);
        if (v.kind === "Real") return realVal(-v.v);
        throw new PseudoError("Runtime error", expr.line, "Internal error: invalid unary operand");
      }

      case "BinaryExpr":
        return yield* this.evalBinary(expr, frame);
    }
  }

  private *evalBinary(e: ast.BinaryExpr, frame: Frame): Gen<Value> {
    // Short-circuit logical operators.
    if (e.op === "AND") {
      const l = yield* this.evalExpr(e.left, frame);
      if (!isTrue(l)) return boolVal(false);
      const r = yield* this.evalExpr(e.right, frame);
      return boolVal(isTrue(r));
    }
    if (e.op === "OR") {
      const l = yield* this.evalExpr(e.left, frame);
      if (isTrue(l)) return boolVal(true);
      const r = yield* this.evalExpr(e.right, frame);
      return boolVal(isTrue(r));
    }

    const l = yield* this.evalExpr(e.left, frame);
    const r = yield* this.evalExpr(e.right, frame);

    switch (e.op) {
      case "EQ":
        return boolVal(valuesEqual(l, r));
      case "NEQ":
        return boolVal(!valuesEqual(l, r));
      case "LT":
        return boolVal(asFloat(l) < asFloat(r));
      case "GT":
        return boolVal(asFloat(l) > asFloat(r));
      case "LTE":
        return boolVal(asFloat(l) <= asFloat(r));
      case "GTE":
        return boolVal(asFloat(l) >= asFloat(r));
      case "PLUS":
        if (l.kind === "Integer" && r.kind === "Integer") return intVal(l.v + r.v);
        return realVal(asFloat(l) + asFloat(r));
      case "MINUS":
        if (l.kind === "Integer" && r.kind === "Integer") return intVal(l.v - r.v);
        return realVal(asFloat(l) - asFloat(r));
      case "STAR":
        if (l.kind === "Integer" && r.kind === "Integer") return intVal(l.v * r.v);
        return realVal(asFloat(l) * asFloat(r));
      case "SLASH":
        if (l.kind === "Integer" && r.kind === "Integer") {
          if (r.v === 0) throw new PseudoError("Runtime error", e.line, "Division by zero");
          return intVal(Math.trunc(l.v / r.v));
        }
        if (asFloat(r) === 0) throw new PseudoError("Runtime error", e.line, "Division by zero");
        return realVal(asFloat(l) / asFloat(r));
      case "MOD":
        if (l.kind !== "Integer" || r.kind !== "Integer") {
          throw new PseudoError("Runtime error", e.line, "Internal error: MOD requires Integer operands");
        }
        if (r.v === 0) throw new PseudoError("Runtime error", e.line, "Division by zero");
        return intVal(l.v % r.v);
    }
  }

  // ===================== L-value resolution =====================

  /** Walks a variable/array-element/struct-field expression and returns the
   * Box for its runtime storage directly, so callers can both read and
   * write through it (assignment, INPUT, out/in-out parameter binding). */
  private *resolveLValue(expr: ast.Expr, frame: Frame): Gen<Box> {
    switch (expr.kind) {
      case "IdentifierExpr": {
        const b = frame.env.get(expr.name);
        if (b === undefined) {
          throw new PseudoError("Runtime error", expr.line, `Variable '${expr.name}' not declared in this scope`);
        }
        return b;
      }
      case "ArrayAccessExpr": {
        const arrBox = yield* this.resolveLValue(expr.array, frame);
        const idxV = yield* this.evalExpr(expr.index, frame);
        if (arrBox.value.kind !== "Array" || idxV.kind !== "Integer") {
          throw new PseudoError("Runtime error", expr.line, "Internal error: invalid array access");
        }
        const av = arrBox.value.v;
        const idx = idxV.v;
        if (idx < av.lower || idx > av.upper) {
          throw new PseudoError("Runtime error", expr.line, `Array index ${idx} is out of bounds (${av.lower}..${av.upper})`);
        }
        return av.elems[idx - av.lower]!;
      }
      case "FieldAccessExpr": {
        const structBox = yield* this.resolveLValue(expr.struct, frame);
        if (structBox.value.kind !== "Struct") {
          throw new PseudoError("Runtime error", expr.line, "Internal error: invalid field access");
        }
        const fb = structBox.value.v.fields.get(expr.field);
        if (fb === undefined) {
          throw new PseudoError("Runtime error", expr.line, `Struct '${structBox.value.v.typeName}' has no field '${expr.field}'`);
        }
        return fb;
      }
      default:
        throw new PseudoError("Runtime error", expr.line, "Internal error: expression is not assignable");
    }
  }

  /** Statically determines the declared type of a variable/array-element/
   * struct-field expression, without evaluating side effects. Only ever
   * called on already-validated l-value chains. */
  private lvalueType(expr: ast.Expr, frame: Frame): ast.TypeExpr | undefined {
    switch (expr.kind) {
      case "IdentifierExpr":
        return frame.scope.get(expr.name);
      case "ArrayAccessExpr": {
        const t = this.lvalueType(expr.array, frame);
        return t?.kind === "ArrayType" ? t.elem : undefined;
      }
      case "FieldAccessExpr": {
        const t = this.lvalueType(expr.struct, frame);
        if (t?.kind === "StructType") {
          const def = this.info.structDefs.get(t.name);
          return def?.fields.find((f) => f.name === expr.field)?.type;
        }
        return undefined;
      }
      default:
        return undefined;
    }
  }
}

function isTrue(v: Value): boolean {
  return v.kind === "Boolean" && v.v;
}

function asFloat(v: Value): number {
  if (v.kind === "Integer" || v.kind === "Real") return v.v;
  return NaN;
}

function valuesEqual(l: Value, r: Value): boolean {
  if (l.kind === "Integer" || l.kind === "Real") return asFloat(l) === asFloat(r);
  switch (l.kind) {
    case "Boolean":
      return r.kind === "Boolean" && l.v === r.v;
    case "Char":
      return r.kind === "Char" && l.v === r.v;
    case "String":
      return r.kind === "String" && l.v === r.v;
    default:
      return false;
  }
}

/** Applies Integer -> Real widening when storing an Integer value into a
 * Real-typed slot, leaving all other values unchanged. */
function coerce(v: Value, target: ast.TypeExpr | undefined): Value {
  if (target?.kind === "PrimitiveType" && target.name === "Real" && v.kind === "Integer") {
    return realVal(v.v);
  }
  return v;
}

/** Executes the Program block of a semantically-checked file. Yields
 * EvalEvents for OUTPUT/INPUT/checkpoints; throws a PseudoError on any
 * runtime failure. */
export function* evaluate(file: ast.File, info: SemanticInfo): Gen<void> {
  yield* new Evaluator(info).run(file);
}
