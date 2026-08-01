import { CornerDownLeft } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { RunStatus, RuntimeError } from "@/hooks/useInterpreter";

export interface ConsoleProps {
  status: RunStatus;
  output: string;
  pendingInputLine: number | null;
  error: RuntimeError | null;
  onSubmitInput: (value: string) => void;
}

/**
 * Renders the running transcript (interpreter OUTPUT, interleaved with a
 * local echo of whatever was submitted for each INPUT -- the interpreter
 * itself only emits the "? " prompt, not an echo of the typed value, which
 * matches a real terminal reading from a pipe; echoing the value back is a
 * console-UX addition on top of that, not a language-behavior change) plus
 * an input box that doubles as an input *queue*: pressing Enter queues
 * every line currently in the box (so pasting many values ahead of a loop
 * full of INPUT calls works in one paste), and each INPUT consumes the next
 * queued line automatically, only falling back to a live prompt once the
 * queue is empty.
 */
export function Console({ status, output, pendingInputLine, error, onSubmitInput }: ConsoleProps) {
  const [transcript, setTranscript] = useState("");
  const [queue, setQueue] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const consumedRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Fold any newly arrived interpreter output into the transcript.
  const flushOutput = () => {
    if (output.length > consumedRef.current) {
      const next = output.slice(consumedRef.current);
      consumedRef.current = output.length;
      setTranscript((t) => t + next);
    }
  };

  useEffect(() => {
    flushOutput();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [output]);

  useEffect(() => {
    // Relies on useInterpreter's `run()` resetting `status` and `output`
    // together in a single state update -- so the moment this effect sees
    // status flip to "running", `output` is guaranteed to already be back
    // to "" for the same render, making this a reliable "a fresh run just
    // started" signal rather than a race.
    if (status === "running" && output === "") {
      consumedRef.current = 0;
      setTranscript("");
      setQueue([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // Auto-consume from the queue whenever the interpreter is waiting on
  // INPUT and we already have a value queued up for it.
  useEffect(() => {
    if (pendingInputLine === null || queue.length === 0) return;
    const [value, ...rest] = queue;
    setQueue(rest);
    flushOutput();
    setTranscript((t) => `${t}${value}\n`);
    onSubmitInput(value!);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingInputLine, queue]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [transcript, pendingInputLine]);

  const waitingLive = pendingInputLine !== null && queue.length === 0;

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== "Enter" || e.shiftKey) return;
    e.preventDefault();
    const lines = draft.split("\n").filter((_, i, arr) => !(i === arr.length - 1 && arr[i] === ""));
    if (lines.length === 0) return;
    setDraft("");
    if (pendingInputLine !== null && queue.length === 0) {
      // Nothing queued and the program is waiting right now: the first
      // line answers it immediately, any extra lines queue for next time.
      const [first, ...rest] = lines;
      flushOutput();
      setTranscript((t) => `${t}${first}\n`);
      onSubmitInput(first!);
      if (rest.length > 0) setQueue((q) => [...q, ...rest]);
    } else {
      setQueue((q) => [...q, ...lines]);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto px-3 py-3 font-mono text-sm">
        {transcript === "" && status === "idle" && (
          <p className="text-faint">Click Run to execute your program. Output will appear here.</p>
        )}
        <pre className="whitespace-pre-wrap break-words text-ink">
          {transcript}
          {waitingLive && <ChalkCursor />}
        </pre>
        {error && (
          <p className="mt-2 border-l-2 border-danger bg-danger-soft/40 py-1 pl-2 text-danger">
            {error.phase}: Line {error.line}: {error.message}
          </p>
        )}
        {status === "done" && <p className="mt-2 text-muted">Execution finished.</p>}
        {status === "cancelled" && <p className="mt-2 text-muted">Execution stopped.</p>}
      </div>

      <div className="shrink-0 border-t border-border-soft bg-inset px-3 py-2">
        {queue.length > 0 && (
          <p className="mb-1 text-xs text-muted">
            {queue.length} line{queue.length === 1 ? "" : "s"} queued
          </p>
        )}
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder={
              waitingLive
                ? "Type a value and press Enter\u2026"
                : "Type or paste input ahead of time (one value per line)\u2026"
            }
            className="min-h-9 flex-1 resize-none rounded-md border border-border bg-panel px-2.5 py-1.5 font-mono text-sm text-ink placeholder:text-faint focus-visible:outline-2 focus-visible:outline-accent"
          />
          <span className="flex h-9 items-center gap-1 pb-0.5 text-xs text-faint">
            <CornerDownLeft className="size-3.5" /> to submit
          </span>
        </div>
      </div>
    </div>
  );
}

function ChalkCursor() {
  return <span className="ml-0.5 inline-block h-[1em] w-[0.55em] translate-y-[0.15em] animate-pulse bg-accent" />;
}
