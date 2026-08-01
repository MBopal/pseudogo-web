/**
 * AST node types produced by the PseudoGo parser. Every node carries its
 * source line number so later phases can produce precise, line-numbered
 * error messages. A direct port of `pseudogo-cli`'s `internal/ast` package,
 * using discriminated unions (via a `kind` tag) instead of Go's interface +
 * type-switch pattern.
 */

// ===================== Type expressions =====================

export type TypeExpr = PrimitiveType | ArrayType | StructType;

export interface PrimitiveType {
  kind: "PrimitiveType";
  name: "Integer" | "Real" | "Boolean" | "Char" | "String";
  line: number;
}

export interface ArrayType {
  kind: "ArrayType";
  lower: number;
  upper: number;
  elem: TypeExpr;
  line: number;
}

export interface StructType {
  kind: "StructType";
  name: string;
  line: number;
}

export function typeExprToString(t: TypeExpr): string {
  switch (t.kind) {
    case "PrimitiveType":
      return t.name;
    case "ArrayType":
      return `Array[${t.lower}..${t.upper}] of ${typeExprToString(t.elem)}`;
    case "StructType":
      return t.name;
  }
}

// ===================== Top-level file structure =====================

export interface File {
  typeDefs: TypeDefNode[];
  functions: FunctionNode[];
  procedures: ProcedureNode[];
  program: ProgramNode;
}

export interface TypeDefNode {
  kind: "TypeDefNode";
  name: string;
  fields: FieldDecl[];
  line: number;
}

export interface FieldDecl {
  name: string;
  type: TypeExpr;
  line: number;
}

export type ParamMode = "in" | "out" | "in/out";

export interface Param {
  name: string;
  type: TypeExpr;
  mode: ParamMode;
  line: number;
}

export interface VarDeclNode {
  kind: "VarDeclNode";
  names: string[];
  type: TypeExpr;
  line: number;
}

export interface FunctionNode {
  kind: "FunctionNode";
  name: string;
  params: Param[];
  returnType: TypeExpr;
  locals: VarDeclNode[];
  body: Stmt[];
  line: number;
}

export interface ProcedureNode {
  kind: "ProcedureNode";
  name: string;
  params: Param[];
  locals: VarDeclNode[];
  body: Stmt[];
  line: number;
}

export interface ProgramNode {
  kind: "ProgramNode";
  name: string;
  locals: VarDeclNode[];
  body: Stmt[];
  line: number;
}

// ===================== Statements =====================

export type Stmt =
  | AssignNode
  | InputNode
  | OutputNode
  | IfNode
  | ForNode
  | WhileNode
  | CallNode
  | ReturnNode;

export interface AssignNode {
  kind: "AssignNode";
  target: Expr;
  value: Expr;
  line: number;
}

export interface InputNode {
  kind: "InputNode";
  target: Expr;
  line: number;
}

export interface OutputNode {
  kind: "OutputNode";
  values: Expr[];
  line: number;
}

export interface ElseIfClause {
  cond: Expr;
  body: Stmt[];
  line: number;
}

export interface IfNode {
  kind: "IfNode";
  cond: Expr;
  then: Stmt[];
  elseIfs: ElseIfClause[];
  /** undefined when there is no ELSE branch. */
  elseBody: Stmt[] | undefined;
  line: number;
}

export interface ForNode {
  kind: "ForNode";
  varName: string;
  start: Expr;
  end: Expr;
  /** undefined => default step of 1. */
  step: Expr | undefined;
  body: Stmt[];
  line: number;
}

export interface WhileNode {
  kind: "WhileNode";
  cond: Expr;
  body: Stmt[];
  line: number;
}

export interface CallNode {
  kind: "CallNode";
  name: string;
  args: Expr[];
  line: number;
}

export interface ReturnNode {
  kind: "ReturnNode";
  /** undefined for a bare `return` (only legal inside procedures). */
  value: Expr | undefined;
  line: number;
}

// ===================== Expressions =====================

export type Expr =
  | BinaryExpr
  | UnaryExpr
  | LiteralExpr
  | IdentifierExpr
  | ArrayAccessExpr
  | FieldAccessExpr
  | FunctionCallExpr;

export type BinaryOp =
  | "AND" | "OR"
  | "EQ" | "NEQ" | "LT" | "GT" | "LTE" | "GTE"
  | "PLUS" | "MINUS" | "STAR" | "SLASH" | "MOD";

export interface BinaryExpr {
  kind: "BinaryExpr";
  op: BinaryOp;
  left: Expr;
  right: Expr;
  line: number;
}

export type UnaryOp = "NOT" | "MINUS";

export interface UnaryExpr {
  kind: "UnaryExpr";
  op: UnaryOp;
  operand: Expr;
  line: number;
}

// NOTE on Integer representation: the Go CLI's `Integer` type is a 64-bit
// int. Here it's represented as a plain JS `number`, not `bigint`. This is a
// deliberate, disclosed deviation from bit-for-bit parity: PseudoGo is a
// teaching language (loop counters, array indices, small recursive
// computations like factorial/fibonacci) where values never realistically
// approach 2^53, and `number` keeps arithmetic, comparisons, and Integer/Real
// interop (widening, MOD, mixed expressions) simple and fast throughout the
// evaluator, rather than threading `bigint`/`number` conversions through
// every operator. If a future use case needs true 64-bit integer semantics,
// this is the one place to revisit.
export type LiteralExpr =
  | { kind: "LiteralExpr"; litKind: "Int"; intVal: number; line: number }
  | { kind: "LiteralExpr"; litKind: "Real"; realVal: number; line: number }
  | { kind: "LiteralExpr"; litKind: "String"; strVal: string; line: number }
  | { kind: "LiteralExpr"; litKind: "Char"; charVal: string; line: number }
  | { kind: "LiteralExpr"; litKind: "Bool"; boolVal: boolean; line: number };

export interface IdentifierExpr {
  kind: "IdentifierExpr";
  name: string;
  line: number;
}

export interface ArrayAccessExpr {
  kind: "ArrayAccessExpr";
  array: Expr;
  index: Expr;
  line: number;
}

export interface FieldAccessExpr {
  kind: "FieldAccessExpr";
  struct: Expr;
  field: string;
  line: number;
}

export interface FunctionCallExpr {
  kind: "FunctionCallExpr";
  name: string;
  args: Expr[];
  line: number;
}
