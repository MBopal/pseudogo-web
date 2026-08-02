# PseudoGo Web

PseudoGo Web is a browser-based IDE for **PseudoGo**, a teaching pseudocode
language. It's a TypeScript reimplementation of
[`pseudogo-cli`](https://github.com/MBopal/pseudogo-cli), built to run
entirely in the browser — no install, no backend. Write PseudoGo, click
Run, get real output and real errors on the spot.

## Tech Stack

- **Language**: TypeScript, in a pnpm workspace
  - `packages/lang` — the PseudoGo interpreter (lexer, parser, semantic
    analyzer, evaluator), pure TS with zero DOM/UI dependencies
  - `apps/web` — the IDE itself
- **Frontend**: React 19 + Vite
- **Styling**: Tailwind CSS v4, shadcn-style components (Radix UI)
- **Editor**: CodeMirror 6, with a custom PseudoGo language mode and live
  linting wired directly into the interpreter
- **Execution**: a Web Worker running the interpreter off the main thread
- **Testing**: Vitest
- **CI**: GitHub Actions
- **Deployment**: Vercel

## Core Features

- Full PseudoGo language support, in strict parity with `pseudogo-cli`
  (same grammar, types, and error messages). Keywords and type names are
  case-insensitive (`PROGRAM`/`Program`/`program` all work)
- Live linting — compile errors show up as you type, before you click Run
- Interactive console: supports `INPUT`, including pasting multiple lines
  ahead of a loop that calls `INPUT` repeatedly
- Stop button with cooperative cancellation, so a runaway loop never
  freezes the page
- Autosaves to `localStorage`; programs can be shared via a URL
- Runs 100% client-side — no backend, no accounts

## Getting Started

**Requirements**: Node 20+ and [pnpm](https://pnpm.io)

**Installation**:

```bash
git clone https://github.com/MBopal/pseudogo-web.git
cd pseudogo-web
pnpm install
```

**Running the application**:

```bash
pnpm --filter @pseudogo/web dev
```

Opens at `http://localhost:5173`.

Other useful commands (run from the repo root):

```bash
pnpm test        # run the interpreter's test suite
pnpm typecheck    # typecheck everything
pnpm build        # production build
```

## Project Structure

```
pseudogo-web/
├── packages/
│   └── lang/            The PseudoGo interpreter (pure TypeScript)
│       └── src/
│           ├── lexer/
│           ├── parser/
│           ├── semantic/
│           ├── evaluator/
│           ├── ast/
│           ├── runtime/
│           ├── fixtures/    Golden tests vs. pseudogo-cli
│           └── index.ts
└── apps/
    └── web/              The React IDE
        └── src/
            ├── components/   Editor, Console, UI
            ├── lib/          Syntax highlighting, live-lint, persistence
            ├── worker/       Execution Web Worker
            ├── hooks/
            └── App.tsx
```
