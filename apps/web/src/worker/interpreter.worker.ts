/**
 * The execution Web Worker: owns the entire PseudoGo pipeline for one RUN
 * request, translating the evaluator generator's yielded EvalEvents into
 * postMessage'd FromWorkerMessages, and translating INPUT_RESPONSE/CANCEL
 * messages back into generator resumes.
 *
 * Cancellation is cooperative (see PRD "Cancellation" decision): CANCEL
 * just sets a flag that's checked the next time the generator yields a
 * "checkpoint" (or "input") event -- there's no way to interrupt a
 * generator from the *outside* mid-synchronous-execution, only at its own
 * yield points. The main thread's `worker.terminate()` fallback (for a
 * generator that somehow never yields) necessarily lives on the main-thread
 * side, not here -- a worker can't terminate itself from within a running
 * script.
 */

import { PseudoError, analyze, evaluate, parseFile, tokenize } from "@pseudogo/lang";
import type { FromWorkerMessage, ToWorkerMessage } from "./protocol";

let cancelRequested = false;

// Resolves the Promise a paused INPUT wait is blocked on, once an
// INPUT_RESPONSE message arrives. Only one INPUT can be pending at a time
// (the generator is fully synchronous between yields), so a single slot
// suffices.
let pendingInputResolve: ((value: string | undefined) => void) | null = null;

function post(msg: FromWorkerMessage): void {
  postMessage(msg);
}

function waitForInput(): Promise<string | undefined> {
  return new Promise((resolve) => {
    pendingInputResolve = resolve;
  });
}

async function runSource(source: string): Promise<void> {
  cancelRequested = false;

  let file;
  try {
    file = parseFile(tokenize(source));
  } catch (err) {
    reportError(err);
    return;
  }

  let info;
  try {
    info = analyze(file);
  } catch (err) {
    reportError(err);
    return;
  }

  const gen = evaluate(file, info);
  let resume: string | undefined;

  try {
    for (;;) {
      const { value: event, done } = gen.next(resume);
      if (done) {
        post({ type: "DONE" });
        return;
      }

      switch (event.type) {
        case "output":
          post({ type: "OUTPUT", text: event.text });
          resume = undefined;
          break;

        case "input": {
          post({ type: "INPUT_REQUEST", line: event.line });
          const value = await waitForInput();
          if (cancelRequested) {
            gen.return();
            post({ type: "CANCELLED" });
            return;
          }
          resume = value;
          break;
        }

        case "checkpoint":
          if (cancelRequested) {
            gen.return();
            post({ type: "CANCELLED" });
            return;
          }
          resume = undefined;
          break;
      }
    }
  } catch (err) {
    reportError(err);
  }
}

function reportError(err: unknown): void {
  if (err instanceof PseudoError) {
    post({ type: "ERROR", phase: err.phase, line: err.line, message: err.message });
    return;
  }
  post({
    type: "ERROR",
    phase: "Runtime error",
    line: 0,
    message: `Internal error: ${err instanceof Error ? err.message : String(err)}`,
  });
}

self.onmessage = (ev: MessageEvent<ToWorkerMessage>) => {
  const msg = ev.data;
  switch (msg.type) {
    case "RUN":
      void runSource(msg.source);
      break;
    case "INPUT_RESPONSE":
      pendingInputResolve?.(msg.value);
      pendingInputResolve = null;
      break;
    case "CANCEL":
      cancelRequested = true;
      // If a checkpoint/input wait is what's currently blocking, wake it so
      // the cancellation is noticed immediately rather than only at the
      // next natural yield -- resuming a still-blocked input wait with
      // undefined is indistinguishable from genuine end-of-input, and the
      // cancelRequested check above runs before that value is used either way.
      pendingInputResolve?.(undefined);
      pendingInputResolve = null;
      break;
  }
};
