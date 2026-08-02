# PRD: PseudoGo Web (`pseudogo-web`)

**Status:** Draft — synthesized from planning discussion, not yet published to an
issue tracker (none configured for this project; run `/setup-matt-pocock-skills`
against the new repo if you want this filed there instead of kept as a
standalone doc).

**Reference spec:** The existing `pseudogo-cli` repository's PRD
(`PRD_Architecture_Completed.md`) is the authoritative specification for the
PseudoGo *language itself* (grammar, types, semantics, error message format).
This document specifies the *web delivery* of that same language — it does not
redefine the language.

---

## Problem Statement

PseudoGo currently only exists as a Go CLI (`pseudogo-cli`). To write, run, or
debug a PseudoGo program today, a person needs Go installed, a terminal, and
familiarity with the command line — a real barrier for the tool's actual
audience (students learning algorithms, instructors demoing in class, anyone
who just wants to try an idea quickly). There's no way to share a runnable
program with someone else without sending them a file and asking them to set
up a local toolchain first. And the CLI's feedback loop is inherently
sequential — write the whole program, run it, get one error at a time — rather
than the live, in-editor feedback people expect from a modern coding tool.

## Solution

Build `pseudogo-web`: a new, standalone repository containing a from-scratch
TypeScript reimplementation of the PseudoGo language, in strict behavioral
parity with the Go CLI, paired with a browser-based IDE. The interpreter runs
entirely client-side (no backend/server execution), inside a Web Worker so
runaway loops never freeze the page. The editor shows live syntax/type errors
as you type. A custom console handles `OUTPUT` and interactive `INPUT`,
including a queue so a loop full of `INPUT` calls can be fed many values at
once instead of one at a time. Programs autosave locally and can be shared via
URL. The Go CLI's existing `examples/` programs (including its error-demo
programs) are reused directly as parity test fixtures, so the two
implementations are verified to agree, not just assumed to. A step debugger
and backend-based persistence are identified as valuable but explicitly
deferred fast-follows, not v1 scope.

## User Stories

1. As a student without Go installed, I want to write and run PseudoGo code in my browser, so that I don't need to install anything to try the language.
2. As a student, I want the web interpreter to behave identically to the CLI (same output, same error text), so that what I learn or debug in the browser transfers directly to the CLI and vice versa.
3. As a student, I want red squiggle/error indicators to appear under my code as I type, so that I catch mistakes before ever clicking Run.
4. As a student, I want to click "Run" and see my program's `OUTPUT` printed live in a console, so that I get immediate feedback on what my program does.
5. As a student, I want a clear `Phase: Line N: message` error shown if my program fails to compile or crashes at runtime, so that I know exactly what's wrong and exactly where.
6. As a student, I want to type a value when my program calls `INPUT` and have execution resume with that value, so that I can interact with my program the way I would with the CLI.
7. As a student writing a program with a `FOR` loop that calls `INPUT` many times, I want to paste in all my input values ahead of time, so that I don't have to type-and-submit one value per iteration.
8. As a student, I want the console to only show a live "waiting for input" prompt once my pre-supplied input runs out, so that pre-supplied and live input blend naturally with no mode-switching.
9. As a student whose program has an infinite loop, I want a Stop button that reliably halts execution, so that I never have to reload the tab to recover.
10. As a student, I want Stop to take effect quickly and cleanly, so that the tool stays responsive no matter what I accidentally write.
11. As a student, I want my in-progress program to still be there if I accidentally refresh or close the tab, so that I don't lose work.
12. As a student, I want to generate a shareable link to a program I've written, so that a classmate can open the exact same code directly in their own browser.
13. As an instructor, I want to share a URL to a demo program with my class, so that everyone can see and run identical code with no file transfer or setup.
14. As a contributor, I want the TypeScript interpreter (lexer/parser/semantic analyzer/evaluator) to be unit-testable independently of the browser/UI, so that I can verify correctness without a DOM.
15. As a contributor, I want the Go CLI's existing example `.pseudo` programs (including its error-demo programs) reused as fixtures for the TS interpreter's tests, so that I have real evidence the two implementations agree, not just an assumption.
16. As a contributor, I want CI to run lint, typecheck, and the full test suite on every pull request, so that a regression is caught before merge, not discovered later in production.
17. As a contributor, I want the interpreter package to have zero dependency on React or the DOM, so that it stays trivially unit-testable and reusable outside this specific web app.
18. As a maintainer, I want every push to `main` to auto-deploy, so that the live site always reflects the latest merged code with no manual deploy step.
19. As a maintainer, I want every pull request to get its own preview deployment, so that UI/UX changes can be reviewed visually, not just read as a diff.
20. As a maintainer, I want this project in its own repository separate from `pseudogo-cli`, so that the Go project's tooling, history, and simplicity stay untouched.
21. As a maintainer, I want the interpreter (`packages/lang`) and the web app (`apps/web`) to be separate packages in one workspace, so that the Web Worker can import just the interpreter without pulling in any UI code.
22. As a maintainer, I want the project under the MIT license, so that other students, educators, or contributors can freely use, fork, and learn from it.
23. As a student using a low-powered device (e.g. a school Chromebook), I want the editor to load quickly and stay smooth, so that the tool doesn't feel sluggish on modest hardware.
24. As a student, I want the browser tab to stay responsive even while my program is stuck in a runaway loop, so that I never have to force-quit my browser to recover.
25. As a future contributor, I want the evaluator's pause/resume architecture to support pausing at arbitrary statements (not only at `INPUT`), so that a step debugger can be added later without re-architecting the evaluator.
26. As a student, I want arrays, structs, recursion, and `in`/`out`/`in/out` parameter behavior to match the CLI exactly, so that a program that works (or fails) on one implementation behaves identically on the other.
27. As a maintainer, I want the Go CLI's PRD to remain the single authoritative source of truth for language semantics, so that the two implementations can't silently drift into disagreeing specs.

## Implementation Decisions

**Repository & workspace structure**
- New, standalone repository: `pseudogo-web`. No code-sharing or runtime
  coupling with `pseudogo-cli` — the Go CLI's PRD is copied in as a reference
  document only.
- pnpm workspace with two packages:
  - `packages/lang` — the PseudoGo interpreter itself (lexer, parser, semantic
    analyzer, evaluator). Pure TypeScript. No React, no DOM, no browser APIs.
    This is the primary seam: everything language-related is testable and
    reasoned about entirely independently of the UI.
  - `apps/web` — the React application: editor, console, Web Worker glue,
    persistence, layout.

**Language**
- Strict parity with `pseudogo-cli`'s documented grammar, type rules, and
  error message format. No new syntax or semantics in this scope — "full
  control over syntax" is expressed as owning a hand-rolled parser, not as
  language changes.

**Execution architecture**
- The interpreter executes entirely client-side inside a **Web Worker** —
  there is no backend and no server-side code execution anywhere in this
  project.
- The evaluator is written as a **generator function**, yielding control at
  every `INPUT` statement and periodically during loop execution (not only at
  `INPUT`). This is the single mechanism behind three separate features:
  interactive `INPUT`, cooperative cancellation (below), and the future step
  debugger (out of scope for v1, see below).

**Worker ↔ main-thread communication**
- Hand-rolled `postMessage` protocol using a discriminated union — no RPC
  library (e.g. Comlink). Illustrative shape (decision-encoding, not final
  code):

  ```ts
  type WorkerMessage =
    | { type: "RUN"; source: string }
    | { type: "OUTPUT"; text: string }
    | { type: "INPUT_REQUEST" }
    | { type: "INPUT_RESPONSE"; value: string }
    | { type: "CANCEL" }
    | { type: "ERROR"; phase: string; line: number; message: string }
    | { type: "DONE" };
  ```

**Cancellation ("Stop" button)**
- Two-layered: the generator checks a cancel flag at its periodic yield
  points and exits gracefully when set (fast, clean stop in the common case);
  `worker.terminate()` is always available as a guaranteed hard-kill fallback
  if the generator itself doesn't respond.

**Console & I/O model**
- Custom-built React console component (not xterm.js) — a styled, scrolling
  output area plus an inline input affordance. Errors render in the same
  `Phase: Line N: message` format the CLI already uses on stderr.
- Input is modeled as a **queue of lines**, not a single value: multiple
  lines can be typed or pasted in ahead of time, and each `INPUT` statement
  consumes the next unread line in order. Only once the queue is empty does
  the console show a live "waiting for input" prompt. This is one mechanism
  that handles both a single `INPUT` and a loop full of them — not two
  separate modes.

**Editor & live feedback**
- **CodeMirror 6** with a custom PseudoGo language definition (tokenizer,
  bracket matching).
- Lexer → parser → semantic analyzer re-run on a debounce as the user types
  (these phases are pure and fast; only the evaluator involves the
  pause/resume machinery, so live linting never touches the Worker).
  Diagnostics feed into `@codemirror/lint` as `{line, message, severity}`.

**Styling / component stack**
- Tailwind CSS as the styling foundation, with shadcn/ui (Radix UI primitives
  styled via Tailwind, components copied into the source rather than
  installed as an opaque package) for standard UI elements (buttons, panels,
  resizable layout, etc.).

**Persistence**
- `localStorage` autosave of the current program (survives refresh/reopen).
- Shareable links via URL-encoded (compressed/base64) source — no backend,
  no database, works within the "fully static" hosting model.
- No accounts, no server-side storage, no named/saved-project database in
  this scope (see Out of Scope).

**Deployment**
- Hosted on **Vercel** (Hobby/free tier), auto-deploying on every push to
  `main`, with automatic preview deployments per pull request.
- Entire stack (Vercel Hobby, GitHub Actions on a public repo, all
  dependencies) is free provided the repository stays public and
  non-commercial.

**Naming & licensing**
- Repository name: `pseudogo-web`. Product/UI branding stays "PseudoGo,"
  `.pseudo` file extension retained, to make the relationship to
  `pseudogo-cli` unambiguous.
- MIT license for `pseudogo-web`. (`pseudogo-cli` is explicitly left
  unlicensed for now — a deliberate decision, not an oversight, revisit
  later if desired.)

## Testing Decisions

- **Primary test seam: `packages/lang`.** Since it's pure TypeScript with no
  DOM/React dependency, the interpreter is tested entirely in isolation —
  the same phase-by-phase structure as `pseudogo-cli`'s Go tests
  (`internal/lexer/lexer_test.go`, `internal/parser/parser_test.go`,
  `internal/semantic/semantic_test.go`, `internal/evaluator/evaluator_test.go`)
  ported to Vitest (`lexer.test.ts`, `parser.test.ts`, `semantic.test.ts`,
  `evaluator.test.ts`).
- **Golden fixture parity tests**: the actual `.pseudo` files from
  `pseudogo-cli/examples/` (including `examples/error-demos/`) are copied
  into this repo as fixtures. Tests assert the TS interpreter produces the
  exact same stdout and the exact same `Phase: Line N: message` error text
  that the Go CLI produces for each one today. This is a manual/copied-fixture
  approach, not an automated cross-implementation harness that shells out to
  the Go binary (that's explicitly out of scope, see below).
- **What makes a good test here**: assert on the interpreter's *observable*
  behavior — the printed output string, or the exact error string — never on
  internal representation (AST shape, internal token structure, etc.). This
  mirrors the Go test suite's own approach of testing through the public
  `Tokenize`/`ParseFile`/`Analyze`/`Run` entry points rather than internal
  state.
- **CI**: a required GitHub Actions check runs lint, typecheck, and the full
  Vitest suite (both packages) on every push/PR — independent of, and in
  addition to, Vercel's own build-success check. A red check blocks merge.

## Out of Scope

- **Any language redesign or new syntax.** v1 is strict parity with the
  existing PseudoGo spec, full stop.
- **Step debugger** (breakpoints, step-through execution, live variable
  inspector). The generator-based evaluator is deliberately architected to
  support this later without a rewrite, but it is not built in this scope.
- **Backend/database-backed persistence** — named saved projects, user
  accounts, a `/p/:id`-style permalink service. `localStorage` + URL sharing
  is the v1 answer; a real backend is a deliberate future upgrade path if
  persistence needs grow beyond that.
- **Automated cross-implementation parity harness** that shells out to the
  Go binary and diffs output automatically. Manually-copied golden fixtures
  are used instead; the Go CLI is treated as essentially frozen, not under
  active parallel development, so the added complexity of a live-diffing
  harness isn't justified.
- **Retroactively licensing `pseudogo-cli`.** Explicitly declined for now.
- Multi-file or multi-module PseudoGo programs, user accounts/auth, and any
  native mobile app.

## Further Notes

- shadcn/ui is not an alternative to Tailwind — it's built on top of
  Tailwind + Radix UI, with components copied directly into the app's
  source rather than installed as an opaque dependency. Worth keeping in
  mind when scaffolding the project so this isn't mistaken for a
  Tailwind-vs-component-library either/or choice.
- The whole stack (Vercel Hobby tier, GitHub Actions on a public repo, all
  npm dependencies) is free as long as the project remains public and
  non-commercial; this was a deliberate check during planning, not an
  assumption.
- This PRD has not been published to a project issue tracker or tagged
  `ready-for-agent`, since no tracker is currently configured for a
  not-yet-created repository. Once `pseudogo-web` exists and
  `/setup-matt-pocock-skills` has been run against it, this document can be
  filed there directly.
