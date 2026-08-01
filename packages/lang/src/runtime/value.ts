/**
 * Runtime value representation, ported from `pseudogo-cli`'s
 * `internal/runtime` package.
 *
 * Go's evaluator relies on `*Value` pointers throughout: env variables,
 * array elements, and struct fields are all addressable, which is what
 * makes `out`/`in-out` parameter aliasing and in-place mutation work. TS has
 * no raw pointers, so every mutable "slot" here is a `Box` — a one-field
 * `{ value: Value }` reference cell. Passing the *same* Box object around
 * (rather than copying its `.value`) reproduces Go's pointer-aliasing
 * exactly: binding an `in/out` parameter to the caller's Box, sharing an
 * array element's Box, etc.
 */

import type * as ast from "../ast/ast.js";
import type { TypeDefNode } from "../ast/ast.js";

export type ValueKind = "Uninitialized" | "Integer" | "Real" | "Boolean" | "Char" | "String" | "Array" | "Struct";

export interface ArrayValue {
  lower: number;
  upper: number;
  elems: Box[];
}

export interface StructValue {
  typeName: string;
  fields: Map<string, Box>;
  /** Field declaration order, for deterministic OUTPUT formatting. */
  order: string[];
}

export type Value =
  | { kind: "Uninitialized" }
  | { kind: "Integer"; v: number }
  | { kind: "Real"; v: number }
  | { kind: "Boolean"; v: boolean }
  | { kind: "Char"; v: string }
  | { kind: "String"; v: string }
  | { kind: "Array"; v: ArrayValue }
  | { kind: "Struct"; v: StructValue };

/** A mutable reference cell: the TS equivalent of Go's `*Value`. */
export interface Box {
  value: Value;
}

export function box(value: Value): Box {
  return { value };
}

export function uninit(): Value {
  return { kind: "Uninitialized" };
}
export function intVal(n: number): Value {
  return { kind: "Integer", v: n };
}
export function realVal(f: number): Value {
  return { kind: "Real", v: f };
}
export function boolVal(b: boolean): Value {
  return { kind: "Boolean", v: b };
}
export function charVal(c: string): Value {
  return { kind: "Char", v: c };
}
export function stringVal(s: string): Value {
  return { kind: "String", v: s };
}

/**
 * Builds the default/zero value for a declared type. Primitives default to
 * Uninitialized; arrays and structs are fully allocated with every
 * element/field itself defaulted (recursively), so indexing or field
 * access never throws -- only reading an unassigned leaf raises the
 * student-facing "used before assignment" runtime error.
 */
export function defaultValue(t: ast.TypeExpr, structDefs: Map<string, TypeDefNode>): Value {
  switch (t.kind) {
    case "PrimitiveType":
      return uninit();
    case "ArrayType": {
      const size = Math.max(0, t.upper - t.lower + 1);
      const elems: Box[] = [];
      for (let i = 0; i < size; i++) elems.push(box(defaultValue(t.elem, structDefs)));
      return { kind: "Array", v: { lower: t.lower, upper: t.upper, elems } };
    }
    case "StructType": {
      const def = structDefs.get(t.name);
      const fields = new Map<string, Box>();
      const order: string[] = [];
      if (def !== undefined) {
        for (const f of def.fields) {
          fields.set(f.name, box(defaultValue(f.type, structDefs)));
          order.push(f.name);
        }
      }
      return { kind: "Struct", v: { typeName: t.name, fields, order } };
    }
  }
}

/** Returns an independent copy of v, recursively duplicating array elements
 * and struct fields (fresh Boxes throughout). Used for pass-by-value ('in')
 * semantics and for the copy-back step of 'out' parameters. */
export function deepCopy(v: Value): Value {
  switch (v.kind) {
    case "Array": {
      const elems = v.v.elems.map((b) => box(deepCopy(b.value)));
      return { kind: "Array", v: { lower: v.v.lower, upper: v.v.upper, elems } };
    }
    case "Struct": {
      const fields = new Map<string, Box>();
      for (const [k, b] of v.v.fields) fields.set(k, box(deepCopy(b.value)));
      return { kind: "Struct", v: { typeName: v.v.typeName, fields, order: [...v.v.order] } };
    }
    default:
      return v;
  }
}

/** Renders a Value for OUTPUT statements. */
export function format(v: Value): string {
  switch (v.kind) {
    case "Integer":
      return String(v.v);
    case "Real":
      return formatReal(v.v);
    case "Boolean":
      return v.v ? "true" : "false";
    case "Char":
      return v.v;
    case "String":
      return v.v;
    case "Array":
      return `[${v.v.elems.map((b) => format(b.value)).join(", ")}]`;
    case "Struct":
      return `{${v.v.order.map((k) => `${k}: ${format(v.v.fields.get(k)!.value)}`).join(", ")}}`;
    case "Uninitialized":
      return "<uninitialised>";
  }
}

function formatReal(f: number): string {
  const s = String(f);
  // Ensure real numbers always show a decimal point, e.g. "5" -> "5.0".
  return /[.eE]/.test(s) ? s : `${s}.0`;
}
