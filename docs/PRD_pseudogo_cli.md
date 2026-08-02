# PseudoGo – Product Requirements Document

**Version:** 1.0   
**Status:** Draft

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)  
2. [Problem Statement & Context](#2-problem-statement--context)  
3. [User Personas](#3-user-personas)  
4. [Core User Flow](#4-core-user-flow)  
5. [Language Specification](#5-language-specification)  
   - [5.1 Overall File Structure](#51-overall-file-structure)  
   - [5.2 Program Block](#52-program-block)  
   - [5.3 Dictionary (Variable Declarations)](#53-dictionary-variable-declarations)  
   - [5.4 Functions & Procedures](#54-functions--procedures)  
   - [5.5 Statements & Expressions](#55-statements--expressions)  
   - [5.6 Struct Definitions](#56-struct-definitions)  
   - [5.7 Error Handling](#57-error-handling)  
6. [Non-Functional Requirements](#6-non-functional-requirements)  
7. [Acceptance Criteria](#7-acceptance-criteria)  
8. [Architecture Design](#8-architecture-design)  
   - [8.1 Overview & Phases](#81-overview--phases)  
   - [8.2 Lexer](#82-lexer)  
   - [8.3 Parser & AST](#83-parser--ast)  
   - [8.4 Semantic Analyzer](#84-semantic-analyzer)  
   - [8.5 Evaluator (Interpreter)](#85-evaluator-interpreter)  
   - [8.6 CLI & Project Structure](#86-cli--project-structure)  
9. [Open Questions & Risks](#9-open-questions--risks)  
10. [Out of Scope](#10-out-of-scope)

---

## 1. Executive Summary

**PseudoGo** is an interpreter for a statically typed, textbook‑style pseudocode language.  
It reads `.pseudo` files, checks them rigorously, and executes them interactively. The runtime is written in **Go**, but the user only sees a clean, minimal teaching language designed for Computer Science students learning algorithms.  
The tool bridges the gap between algorithm pseudocode and real code by providing instant feedback, precise error messages, and clear runtime behaviour – all without requiring knowledge of a production language.

---

## 2. Problem Statement & Context

*First principles:*  
Students studying algorithms are often overwhelmed by the syntax and tooling of real programming languages. They need an environment that **executes** pseudocode as they would write it on paper, allowing them to reason about logic without debugging a language.  

PseudoGo defines a formal but human‑readable pseudocode dialect that supports variables, conditionals, loops, arrays, structs, and modular procedures/functions with pass‑by‑value and pass‑by‑reference. The interpreter is a **strict teacher** – it rejects incorrect programs at compile time and stops at the first runtime error with a student‑friendly message.

---

## 3. User Personas

| Persona | Description | Needs |
|---------|-------------|-------|
| **CS Student (Primary)** | Writes algorithms for assignments (sorting, recursion, data structures) | Immediate feedback, clear error messages, simple I/O, no syntax clutter |
| **CS Instructor (Secondary)** | Demonstrates algorithms in class | Language must match textbook pseudocode conventions, zero surprises |

---

## 4. Core User Flow
1. Student writes a .pseudo file (e.g. bubble_sort.pseudo)
    
2. Student runs: pseudogo run bubble_sort.pseudo
    
3. The interpreter parses and validates the entire file.
    
4. If errors exist, a precise message is shown (e.g. "Line 12: Variable 'x' not declared").
    
5. Otherwise, execution begins.
    
    - INPUT statements wait for user keyboard input.
        
    - OUTPUT statements print to the console immediately.
        
6. After execution finishes, the interpreter prints "Execution finished." and exits.

**Mental model:** Write → Validate → Execute → See output.

---

## 5. Language Specification

All syntax must follow the template below.

### 5.1 Overall File Structure

A `.pseudo` file contains:
- Zero or more **type definitions** (`type ... struct < ... >`)
- Zero or more **function/procedure definitions**
- Exactly one **`Program` block** (the entry point)

Example skeleton:
```
type Person struct <  
	name: String  
	age: Integer
>

function add(a, b: Integer) -> Integer  
Dictionary  
	-- no local variables here --  
Algorithm  
	return a + b  
Endfunction

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
	p: Person  
Algorithm  
	x = 5  
	y = 10  
	swap(x, y)  
	OUTPUT x, y  
	p.name = "Ada"  
	p.age = add(x, y)  
	OUTPUT p.name, p.age  
Endprogram
```
### 5.2 Program Block
```
Program <name>  
Dictionary  
<declaration list>  
Algorithm  
<statement list>  
Endprogram
```

- `<name>` must be an identifier.
- `Dictionary` block declares all global variables, arrays, and struct instances.
- `Algorithm` block contains the executable statements.
- Only **one** `Program` per file.

### 5.3 Dictionary (Variable Declarations)

Declarations are grouped by type:
`<var1>, <var2>, ... : <Type>`
Multiple variables of the same type can be declared on one line.  
A `Dictionary` can contain multiple such lines.

**Supported types:**
- Primitives: `Integer`, `Real`, `Boolean`, `Char`, `String`
- Arrays: `Array[<lower>..<upper>] of <Type>`  
  - Bounds are **integer literals** only.
  - Multidimensional arrays allowed: `Array[1..5] of Array[1..5] of Real`
- Structs: any previously defined struct name (e.g. `Person`)

**Examples:**
a, b, c: Integer  
point: Real  
name: String  
status: Boolean  
test: Char  
arr: Array[1..10] of Integer  
matrix: Array[1..5] of Array[1..5] of Real  
p: Person

**Scope:**  
Every variable must be declared in the enclosing scope’s `Dictionary`.  
Name shadowing is allowed – a local `x` hides a global `x` inside a function/procedure.

### 5.4 Functions & Procedures

#### Function
```
function <name>(<param list>) -> <return type>  
Dictionary  
<local declarations>  
Algorithm  
<statement list>  
return <expression>  
Endfunction
```

- The `<param list>` is comma‑separated, each as `<name>: <Type>`.
- A function **must** return a value of the correct type. All code paths must end with `return`.
- No multiple return values.

#### Procedure

- Parameters can include an optional passing mode:
  - `in` (default) – pass by value. Cannot be modified in a way that affects the caller.
  - `out` – uninitialised inside, must be assigned before the procedure returns. The caller’s argument receives the final value (call‑by‑value‑result).
  - `in/out` – pass by reference. Modifications inside are immediately reflected in the caller’s variable.
- Syntax: `in name: Type` (if omitted, it's `in`), `out name: Type`, `in/out name: Type`.
- For `out` and `in/out`, the caller **must** pass an existing variable (l‑value); literals or expressions are rejected at compile time.
- Recursion is fully supported – each call creates a fresh local dictionary.

### 5.5 Statements & Expressions

#### Statements

- **Assignment:** `<variable> = <expression>`  
  - The variable must be declared. The expression type must match (with `Integer → Real` widening).
- **Input/Output:**
```
  INPUT <variable>  
  OUTPUT <expression> [, <expression>]*
```
- `INPUT` reads from stdin; prompts with `?` then waits. The input must match the variable’s type.
- `OUTPUT` prints each expression separated by a space, ending with a newline.

- **Conditional:**
```
IF <condition> THEN  
	<statements>  
ELSE IF <condition> THEN  
	<statements> ]  
ELSE  
	<statements> ]  
ENDIF
```
- Condition must be a `Boolean` expression. No truthiness.
- **Loops:**
- **Classic FOR:**
```
FOR <variable> = <start> TO <end> [STEP <inc>]  
	<statements>  
ENDFOR
```
- `variable` must be an `Integer` declared variable.
- Loop runs while `variable <= end` (if step positive) or `variable >= end` (if step negative). Step defaults to `1`.
- **WHILE:**
```
WHILE <condition>  
	<statements>  
ENDWHILE
```
- Condition checked at entry.

- **Procedure call:** `<name>(<arglist>)` as a statement.
- **Return (inside function):** `return <expression>`

#### Expressions

- **Operators (in precedence order, lowest first):**
- Logical: `AND`, `OR`
- Equality/Comparison: `==`, `!=`, `<`, `>`, `<=`, `>=`
- Arithmetic: `+`, `-` (binary), `*`, `/`, `MOD`
- Unary: `NOT`, `-` (unary minus)
- Parentheses for grouping.
- **Type promotion:** `Integer + Real` → `Real`. Any invalid type combination is a runtime error.
- **Function call:** `<name>(<arglist>)` may appear anywhere an expression is expected.
- **Variable references** may include array indexing (`arr[5]`) and struct field access (`p.name`), which can be chained.

### 5.6 Struct Definitions
```
type <Name> struct <  
	<field1>: <Type>  
	<field2>: <Type>
	......  
>
```

- Field names are unique within the struct.
- Fields can be primitives, arrays, or other structs.
- Struct variables are declared in a `Dictionary` like any other type.
- Field access uses dot notation: `var.field`.
- Structs are passed by value to `in` parameters; for `in/out` and `out`, they are passed by reference.

### 5.7 Error Handling

Every error includes a **line number** and a **plain‑English message**. No stack traces.

| Situation | Phase | Message Example |
|-----------|-------|-----------------|
| Undeclared variable used | Compile | `Line 5: Variable 'x' not declared in this scope` |
| Type mismatch in assignment | Compile | `Line 8: Cannot assign String to Integer variable 'y'` |
| Wrong number of arguments | Compile | `Line 12: Procedure 'swap' expects 2 arguments, got 3` |
| Passing literal for `out`/`in-out` | Compile | `Line 15: Argument 2 must be a variable (passed as out)` |
| Missing `return` in function | Compile | `Line 30: Not all paths in function 'foo' return a value` |
| Array index out of bounds | Runtime | `Line 22: Array index 0 is out of bounds (1..10)` |
| Division by zero | Runtime | `Line 25: Division by zero` |
| Using uninitialised variable | Runtime | `Line 35: Variable 'a' used before assignment` |
| Type mismatch in expression | Runtime | `Line 40: Cannot add String and Integer` |
| Recursion limit exceeded | Runtime | `Line 50: Recursion limit (10000) exceeded` |

---

## 6. Non-Functional Requirements

- **Performance:** Must handle typical student algorithms (e.g., sorting 1000 items) in under one second.
- **Platform:** A single Go binary (Windows, macOS, Linux). No external dependencies beyond the OS terminal.
- **Usability:** Error messages understandable by a first‑year CS student. Syntax mirrors common textbook pseudocode (Cormen, CLRS‑like).
- **Extensibility:** The interpreter code must be modular to allow easy addition of new types or statements.

---

## 7. Acceptance Criteria

Each criterion is a testable scenario written in the final syntax.

### 7.1 Basic Output
**Given:**
```
Program Hello  
Dictionary  
	message: String  
Algorithm  
	message = "Hello, world!"  
	OUTPUT message  
Endprogram
```
**Expected:** Console prints `Hello, world!`

### 7.2 Array Fill & Output
**Given:**
```
Program ArrayDemo  
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
```
**Expected:** Outputs the numbers 2, 4, 6, 8, 10 (each on its own line, because `OUTPUT` is inside the loop).

### 7.3 Procedure with in/out
**Given:**
```
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
```
**Expected:** Prints `20 10`

### 7.4 Recursive Function
**Given:**
```
function factorial(n: Integer) -> Integer  
Dictionary  
Algorithm  
	IF n <= 1 THEN  
		return 1  
	ENDIF  
	return n * factorial(n - 1)  
Endfunction

Program Calc  
Dictionary  
	f: Integer  
Algorithm  
	f = factorial(5)  
	OUTPUT f  
Endprogram
```
**Expected:** Prints `120`

### 7.5 Struct Usage
**Given:**
```
type Point struct <  
	x: Real  
	y: Real
>

Program StructTest  
Dictionary  
	p: Point  
Algorithm  
	p.x = 3.5  
	p.y = 2.0  
	OUTPUT p.x + p.y  
Endprogram
```
**Expected:** Prints `5.5`

### 7.6 Compile Error – Missing Declaration
**Given:**
```
Program Oops  
Dictionary  
Algorithm  
	x = 5  
Endprogram
```
**Expected:** Interpreter stops with compile error `Variable 'x' not declared` (and a line number).

### 7.7 Input Interaction
**Given:**
```
Program Greet  
Dictionary  
	name: String  
Algorithm  
	INPUT name  
	OUTPUT "Hello,", name  
Endprogram
```
**When:** User types `Ada`  
**Expected:** Outputs `Hello, Ada`

---

## 8. Architecture Design

The interpreter is built in Go and follows a classic **four-phase pipeline**. Each phase has one responsibility, clear inputs/outputs, and can be tested separately.

### 8.1 Overview & Phases

```text
Source Code (.pseudo)
        │
        ▼
┌───────────────┐
│ Lexer         │  → token stream
└───────────────┘
        │
        ▼
┌───────────────┐
│ Parser        │  → Abstract Syntax Tree (AST)
└───────────────┘
        │
        ▼
┌───────────────┐
│ Semantic      │  → symbol tables + type-checked AST
│ Analyzer      │
└───────────────┘
        │
        ▼
┌───────────────┐
│ Evaluator     │  → program execution with interactive I/O
└───────────────┘
```

The pipeline is intentionally strict:

- **Lexer** converts characters into tokens and tracks line/column information.
- **Parser** turns tokens into a structured AST.
- **Semantic Analyzer** validates names, scopes, and types before execution.
- **Evaluator** runs only programs that have passed analysis.

This separation keeps error reporting precise and makes the interpreter easier to extend with new syntax later.

### 8.2 Lexer

The lexer reads raw `.pseudo` source text and emits a stream of tokens.

**Responsibilities**
- Skip whitespace and comments.
- Recognise identifiers, keywords, literals, operators, and punctuation.
- Attach source position metadata to every token.
- Preserve line numbers for downstream compile-time and runtime errors.

**Token categories**
- Keywords: `Program`, `Dictionary`, `Algorithm`, `Endprogram`, `function`, `procedure`, `return`, `IF`, `THEN`, `ELSE`, `ENDIF`, `FOR`, `TO`, `STEP`, `ENDFOR`, `WHILE`, `ENDWHILE`, `INPUT`, `OUTPUT`, `type`, `struct`, `Array`, `of`, `in`, `out`, `in/out`, `AND`, `OR`, `NOT`, `MOD`
- Identifiers: variable names, function names, procedure names, struct names
- Literals: `Integer`, `Real`, `String`, `Boolean`, `Char`
- Operators: `=`, `==`, `!=`, `<`, `>`, `<=`, `>=`, `+`, `-`, `*`, `/`
- Delimiters: `(`, `)`, `[`, `]`, `<`, `>`, `,`, `:`, `.`
- Comments: line comments and block comments, ignored by the lexer

**Implementation notes**
- Line and column tracking must be updated for every token.
- Numeric lexing should distinguish integer and real literals.
- String lexing should preserve escape sequences needed by the language.
- Lexical errors should stop immediately with a helpful message such as `Line 4: Unexpected character '$'`.

### 8.3 Parser & AST

The parser consumes the token stream and builds an Abstract Syntax Tree (AST). A **recursive descent parser** is the best fit because the grammar is structured and human-readable.

**Responsibilities**
- Enforce the grammar of the language.
- Build AST nodes for programs, declarations, statements, expressions, types, and definitions.
- Preserve line numbers on AST nodes for later diagnostics.
- Report syntax errors with clear messages and exact locations.

**AST shape**
- `ProgramNode`
- `TypeDefNode`
- `FunctionNode`
- `ProcedureNode`
- `VarDeclNode`
- `BlockNode`
- `IfNode`
- `ForNode`
- `WhileNode`
- `AssignNode`
- `InputNode`
- `OutputNode`
- `CallNode`
- `ReturnNode`
- Expression nodes such as:
  - `BinaryExpr`
  - `UnaryExpr`
  - `LiteralExpr`
  - `IdentifierExpr`
  - `ArrayAccessExpr`
  - `FieldAccessExpr`
  - `FunctionCallExpr`

**Parsing strategy**
- Parse the top-level file structure first.
- Parse type definitions before function/procedure bodies so custom struct names are known.
- Use precedence climbing or recursive precedence functions for expressions.
- Keep function/procedure parameters and blocks in dedicated nodes rather than flattening them.

**Error handling**
- Syntax errors should point to the first unexpected token.
- The parser should not attempt heavy recovery; it is better to fail fast with a useful message than continue with a broken tree.

### 8.4 Semantic Analyzer

The semantic analyzer validates the AST before execution begins.

**Responsibilities**
- Build symbol tables for global scope, function scope, procedure scope, and nested local scope.
- Check that every identifier is declared before use.
- Enforce type rules for assignments, expressions, conditions, parameters, and return values.
- Validate array bounds syntax, struct field access, and call argument counts.
- Ensure functions return a value on all paths.
- Ensure `out` and `in/out` arguments are valid l-values.
- Detect use of uninitialised variables where the language requires a value.

**Scope model**
- Global scope contains type definitions, global variables, functions, and procedures.
- Each function/procedure introduces a fresh local scope.
- Shadowing is allowed, but the nearest declaration wins.
- Struct fields do not pollute the surrounding variable scope.

**Type rules**
- Primitive compatibility is strict.
- Integer-to-Real widening is allowed.
- Boolean expressions are required in `IF` and `WHILE`.
- Loop variables in `FOR` must be declared integers.
- Array indexing must use integer expressions.
- Field access must target a struct type.

**Call validation**
- Function calls must match the declared return type when used as expressions.
- Procedure calls must match arity and parameter modes.
- `out` parameters must be assigned before the callee returns.
- `in/out` parameters require a variable, not a literal or expression.

**Return validation**
- Functions must return a value of the declared type.
- Every control-flow path must end in a return statement for functions.
- Procedures must not use `return <expression>`.

### 8.5 Evaluator (Interpreter)

The evaluator executes the checked AST.

**Responsibilities**
- Manage runtime environments and call frames.
- Evaluate expressions according to precedence and type rules.
- Execute statements in order.
- Handle interactive input/output.
- Enforce runtime checks such as division by zero and array bounds.

**Runtime model**
- Each call creates a new activation record containing:
  - local variables
  - parameter bindings
  - temporary values
  - return information
- The evaluator maintains a call stack for nested calls and recursion.
- Struct values and arrays are represented as nested runtime values, not plain text.

**Value representation**
- `Integer`
- `Real`
- `Boolean`
- `Char`
- `String`
- `Array`
- `Struct`
- `Null/Uninitialised` marker for values that exist but have not been assigned yet

**Execution rules**
- `INPUT` waits for user input and parses it to the expected type.
- `OUTPUT` prints evaluated expressions separated by a single space.
- `FOR` loops update the loop variable according to `STEP`.
- `WHILE` conditions are re-evaluated before each iteration.
- `in` parameters are passed by value.
- `out` parameters are copied back to the caller on successful return.
- `in/out` parameters reference the caller’s variable directly.

**Runtime errors**
- Array index out of bounds
- Division by zero
- Uninitialised variable access
- Invalid type operations
- Recursion depth exceeded

All runtime errors must include the source line number and a plain-English explanation.

### 8.6 CLI & Project Structure

The CLI is the public entry point for the interpreter.

**CLI behaviour**
- `pseudogo run file.pseudo` reads, validates, and executes the file.
- Exit code `0` indicates success.
- Non-zero exit codes indicate lexical, syntax, semantic, or runtime failure.
- Error messages are printed to stderr, while normal output is printed to stdout.

**Suggested package structure**
```text
pseudogo/
├── cmd/
│   └── pseudogo/
│       └── main.go
├── internal/
│   ├── lexer/
│   ├── parser/
│   ├── ast/
│   ├── semantic/
│   ├── evaluator/
│   ├── runtime/
│   ├── token/
│   └── errors/
├── examples/
├── tests/
└── README.md
```

**Module boundaries**
- `token`: token types and source position metadata
- `lexer`: character scanning and tokenisation
- `ast`: syntax tree node definitions
- `parser`: grammar parsing and AST construction
- `semantic`: symbol tables, type checking, and declaration analysis
- `runtime`: value representation, scopes, and stack frames
- `evaluator`: execution engine and built-in I/O
- `errors`: shared error formatting utilities

**Testing strategy**
- Unit tests for lexer tokenisation.
- Parser tests for valid and invalid grammar.
- Semantic tests for scope and type errors.
- Evaluator tests for arithmetic, control flow, recursion, arrays, structs, and I/O.
- End-to-end tests using `.pseudo` example programs.

The architecture is deliberately modular so new statements, types, or built-in functions can be added without rewriting the entire interpreter.
