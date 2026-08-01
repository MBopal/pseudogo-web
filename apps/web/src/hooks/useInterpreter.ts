import { useCallback, useEffect, useRef, useState } from "react";
import type { FromWorkerMessage, ToWorkerMessage } from "@/worker/protocol";

export type RunStatus = "idle" | "running" | "done" | "error" | "cancelled";

export interface RuntimeError {
  phase: string;
  line: number;
  message: string;
}

export interface InterpreterState {
  status: RunStatus;
  /** Every OUTPUT event's text, concatenated in arrival order. */
  output: string;
  /** Non-null while the worker is paused on an INPUT statement. */
  pendingInputLine: number | null;
  error: RuntimeError | null;
}

const IDLE_STATE: InterpreterState = { status: "idle", output: "", pendingInputLine: null, error: null };

// If a cooperative CANCEL doesn't get an acknowledgement (CANCELLED/DONE)
// within this window, the worker is presumed stuck and hard-killed. See
// PRD "Cancellation": cooperative cancellation layered on a terminate()
// fallback -- the fallback necessarily lives here, on the main-thread side,
// since a worker cannot terminate itself.
const HARD_KILL_TIMEOUT_MS = 300;

export function useInterpreter() {
  const [state, setState] = useState<InterpreterState>(IDLE_STATE);
  const workerRef = useRef<Worker | null>(null);
  const hardKillTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHardKillTimer = useCallback(() => {
    if (hardKillTimerRef.current !== null) {
      clearTimeout(hardKillTimerRef.current);
      hardKillTimerRef.current = null;
    }
  }, []);

  const spawnWorker = useCallback(() => {
    const worker = new Worker(new URL("../worker/interpreter.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (ev: MessageEvent<FromWorkerMessage>) => {
      const msg = ev.data;
      switch (msg.type) {
        case "OUTPUT":
          setState((s) => ({ ...s, output: s.output + msg.text }));
          break;
        case "INPUT_REQUEST":
          setState((s) => ({ ...s, pendingInputLine: msg.line }));
          break;
        case "ERROR":
          clearHardKillTimer();
          setState((s) => ({
            ...s,
            status: "error",
            pendingInputLine: null,
            error: { phase: msg.phase, line: msg.line, message: msg.message },
          }));
          break;
        case "DONE":
          clearHardKillTimer();
          setState((s) => ({ ...s, status: "done", pendingInputLine: null }));
          break;
        case "CANCELLED":
          clearHardKillTimer();
          setState((s) => ({ ...s, status: "cancelled", pendingInputLine: null }));
          break;
      }
    };
    workerRef.current = worker;
    return worker;
  }, [clearHardKillTimer]);

  useEffect(() => {
    const worker = spawnWorker();
    return () => {
      clearHardKillTimer();
      worker.terminate();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const send = useCallback((msg: ToWorkerMessage) => {
    workerRef.current?.postMessage(msg);
  }, []);

  const run = useCallback(
    (source: string) => {
      clearHardKillTimer();
      setState({ status: "running", output: "", pendingInputLine: null, error: null });
      send({ type: "RUN", source });
    },
    [send, clearHardKillTimer],
  );

  const submitInput = useCallback(
    (value: string) => {
      setState((s) => ({ ...s, pendingInputLine: null }));
      send({ type: "INPUT_RESPONSE", value });
    },
    [send],
  );

  const cancel = useCallback(() => {
    send({ type: "CANCEL" });
    clearHardKillTimer();
    hardKillTimerRef.current = setTimeout(() => {
      // The worker didn't acknowledge in time -- hard-kill and replace it
      // so the app is immediately usable again for the next Run.
      workerRef.current?.terminate();
      spawnWorker();
      setState((s) => (s.status === "running" ? { ...s, status: "cancelled", pendingInputLine: null } : s));
    }, HARD_KILL_TIMEOUT_MS);
  }, [send, clearHardKillTimer, spawnWorker]);

  const reset = useCallback(() => {
    clearHardKillTimer();
    setState(IDLE_STATE);
  }, [clearHardKillTimer]);

  return { state, run, submitInput, cancel, reset };
}
