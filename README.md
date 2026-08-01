# PseudoGo Web

A browser-based IDE and interpreter for **PseudoGo** — the same teaching
pseudocode language as [`pseudogo-cli`](https://github.com/MBopal/pseudogo-cli),
reimplemented from scratch in TypeScript so it can run entirely in the
browser. No backend, no install — write PseudoGo, run it, get real output
and real errors, right in the page.

This repo currently contains the interpreter (`packages/lang`). The web IDE
itself (`apps/web`) is next.

See `PRD_pseudogo_web.md` for the full plan and `PRD_pseudogo_cli.md` for
the authoritative PseudoGo language specification this interpreter targets.

## Status

- ✅ `packages/lang` — lexer, parser, semantic analyzer, generator-based
  evaluator. 88 tests passing, including 18 golden fixtures verified
  byte-for-byte against real `pseudogo-cli` output.
- ✅ `apps/web` — v1 IDE: CodeMirror editor with live linting, a Web
  Worker running the interpreter off the main thread, an interactive
  console with an input queue, cooperative cancellation, localStorage
  autosave, and URL-based sharing. Not yet deployed; step debugger and
  backend persistence are deliberately deferred (see
  `PRD_pseudogo_web.md`, "Out of Scope").

## Repository structure

```
pseudogo-web/
├── packages/
│   └── lang/                 The PseudoGo language, pure TypeScript
│       └── src/
│           ├── token/        Token types + source positions
│           ├── lexer/        Lexer + tests
│           ├── ast/          AST node definitions
│           ├── parser/       Recursive-descent parser + tests
│           ├── semantic/     Symbol tables, type/control-flow checks + tests
│           ├── runtime/      Value representation (Box-based), environments
│           ├── evaluator/    Generator-based tree-walking interpreter + tests
│           ├── errors/       Shared PseudoError type
│           ├── fixtures/     Golden fixtures + parity tests vs. pseudogo-cli
│           └── index.ts      Public API
├── apps/
│   └── web/                  The React IDE
│       └── src/
│           ├── components/   Editor (CodeMirror), Console, ui/ (Button, etc.)
│           ├── lib/
│           │   ├── codemirror/   PseudoGo syntax highlighting, theme, live-lint
│           │   ├── persistence.ts  localStorage autosave + URL sharing
│           │   └── defaultProgram.ts
│           ├── worker/       Execution Web Worker + message protocol
│           ├── hooks/        useInterpreter (owns the Worker's lifecycle)
│           └── App.tsx
├── PRD_pseudogo_web.md        This project's PRD
├── PRD_pseudogo_cli.md        The PseudoGo language spec (source of truth)
└── .github/workflows/ci.yml   Required CI: typecheck + test + build
```

## Getting started

Requires Node 20+ and [pnpm](https://pnpm.io).

```bash
pnpm install
pnpm test        # run every package's test suite
pnpm typecheck    # typecheck every package
pnpm build        # build every package
```

## Running the web app

```bash
pnpm --filter @pseudogo/web dev
```

Opens the IDE at `http://localhost:5173`. A note on verification: this app
was built and tested in a sandboxed environment without a real browser
available, so while every piece typechecks strictly and the production
build succeeds (including the Worker splitting into its own chunk, and a
direct round-trip test of the URL-sharing encoding), the actual UI has not
been visually verified or clicked through. Worth specifically checking
after `pnpm dev`: Run/Stop, an `INPUT`-driven program (try the default
starter program, which prompts for your name), live-linting squiggles on
a deliberately broken program, and the Share button's clipboard copy.

## Using the interpreter

```ts
import { run } from "@pseudogo/lang";

const source = `
Program Hello
Dictionary
	message: String
Algorithm
	message = "Hello, world!"
	OUTPUT message
Endprogram
`;

const result = run(source);
console.log(result.output); // "Hello, world!\n"
```

`run()` is a synchronous, run-to-completion convenience wrapper (optionally
takes an array of pre-supplied `INPUT` lines). For streaming output and
interactive `INPUT` — what the real web IDE will do — drive the evaluator's
generator directly:

```ts
import { evaluate, parseFile, tokenize, analyze } from "@pseudogo/lang";

const file = parseFile(tokenize(source));
const info = analyze(file);
const gen = evaluate(file, info);

let resume: string | undefined;
for (;;) {
  const { value: event, done } = gen.next(resume);
  if (done) break;
  if (event.type === "output") {
    process.stdout.write(event.text);
    resume = undefined;
  } else if (event.type === "input") {
    resume = "some typed value"; // or undefined to signal end-of-input
  } else if (event.type === "checkpoint") {
    // periodic pause point; call gen.return() here to cancel a runaway loop
    resume = undefined;
  }
}
```

See `packages/lang/src/evaluator/driver.ts` for a complete, minimal
reference driver (`runProgram`), which is what `run()` and the test suite
use, and what the future Web Worker driver will closely resemble.

## Design notes: where this deliberately diverges from `pseudogo-cli`

Per the PRD, this is a **strict parity port** of the PseudoGo language
itself — same grammar, same type rules, same error message text. A couple
of implementation-level (not language-level) details necessarily differ
because JavaScript's runtime model isn't Go's:

- **Generator-based evaluator.** Go's CLI blocks synchronously on stdin for
  `INPUT`. Browsers can't block the main thread, so the evaluator is a
  generator that yields at every `OUTPUT`, every `INPUT`, and periodically
  during loops — see `evaluator/events.ts` and the module doc-comment atop
  `evaluator/evaluator.ts`.
- **Recursion limit is 300, not 10000.** Go's goroutine stacks grow cheaply;
  every recursive PseudoGo call here chains through several `yield*`
  generator frames, which cost real JS call-stack depth. 300 was chosen
  with real safety margin below the empirically-measured overflow point
  (~545 in this evaluator's exact call shape under Node's default stack),
  while comfortably exceeding anything a legitimate teaching program needs.
  See the doc comment on `MAX_RECURSION_DEPTH` in `evaluator.ts`.
- **`Integer` is a JS `number`, not a 64-bit integer type.** PseudoGo values
  in realistic teaching programs (loop counters, small recursive
  computations) never approach `2^53`; using `number` throughout keeps
  arithmetic and Integer/Real interop simple. See the note in `ast.ts`.
- **`packages/lang` never prints "Execution finished."** — that's a
  `pseudogo-cli`-specific CLI presentation detail (`cmd/pseudogo/main.go`),
  not interpreter behavior. It's stripped when comparing against captured
  Go CLI output in the golden fixture tests.

None of these change what a PseudoGo *program* computes or how it's
type-checked — only implementation details of how the interpreter itself
is built.

## Testing

```bash
pnpm test
```

| Layer | File |
|---|---|
| Lexer tokenisation | `packages/lang/src/lexer/lexer.test.ts` |
| Parser (valid & invalid grammar) | `packages/lang/src/parser/parser.test.ts` |
| Semantic analysis (scope & type errors) | `packages/lang/src/semantic/semantic.test.ts` |
| Evaluator (arithmetic, control flow, recursion, arrays, structs, I/O, cancellation) | `packages/lang/src/evaluator/evaluator.test.ts` |
| Golden-fixture parity vs. `pseudogo-cli` | `packages/lang/src/fixtures/fixtures.test.ts` |

The golden fixtures in `packages/lang/src/fixtures/` are real `.pseudo`
programs copied from `pseudogo-cli/examples/` (including `error-demos/`),
paired with a `manifest.json` of **actually captured** Go CLI output
(stdout/stderr/exit code) — not hand-typed expectations. If you update the
language spec or the fixture set, regenerate `manifest.json` by running
each `.pseudo` file through a built `pseudogo-cli` binary and capturing its
output.

## License

MIT
