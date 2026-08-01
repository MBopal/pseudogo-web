import { Check, Play, Share2, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Console } from "@/components/Console";
import { Editor } from "@/components/Editor";
import { useInterpreter } from "@/hooks/useInterpreter";
import { buildShareUrl, loadInitialSource, saveAutosave, syncUrlToSource } from "@/lib/persistence";

const AUTOSAVE_DEBOUNCE_MS = 500;

function Wordmark() {
  return (
    <span className="font-display text-lg font-semibold tracking-tight">
      <span className="text-ink">Pseudo</span>
      <span className="text-accent">Go</span>
    </span>
  );
}

export default function App() {
  const [source, setSource] = useState<string>(() => loadInitialSource());
  const [copied, setCopied] = useState(false);
  const { state, run, submitInput, cancel } = useInterpreter();
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (autosaveTimer.current !== null) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => saveAutosave(source), AUTOSAVE_DEBOUNCE_MS);
    return () => {
      if (autosaveTimer.current !== null) clearTimeout(autosaveTimer.current);
    };
  }, [source]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        if (state.status !== "running") run(source);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [source, state.status, run]);

  function handleShare() {
    syncUrlToSource(source);
    const url = buildShareUrl(source);
    navigator.clipboard?.writeText(url).catch(() => {
      // Clipboard access can be denied; the URL is already in the address
      // bar via syncUrlToSource, so the share link is still obtainable.
    });
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  const isRunning = state.status === "running";

  return (
    <div className="flex h-full flex-col bg-app text-ink">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-panel-raised px-4">
        <Wordmark />
        <div className="flex items-center gap-2">
          <Button variant="primary" size="sm" onClick={() => run(source)} disabled={isRunning}>
            <Play /> Run
          </Button>
          <Button variant="secondary" size="sm" onClick={cancel} disabled={!isRunning}>
            <Square /> Stop
          </Button>
          <Button variant="ghost" size="sm" onClick={handleShare}>
            {copied ? <Check /> : <Share2 />}
            {copied ? "Copied" : "Share"}
          </Button>
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <section className="flex min-h-0 flex-1 flex-col border-b border-border bg-panel lg:w-[58%] lg:border-r lg:border-b-0">
          <div className="flex h-9 shrink-0 items-center border-b border-border-soft px-3 font-mono text-xs text-muted">
            main.pseudo
          </div>
          <div className="min-h-0 flex-1">
            <Editor value={source} onChange={setSource} />
          </div>
        </section>

        <section className="flex min-h-[40vh] flex-1 flex-col bg-panel lg:h-full lg:w-[42%]">
          <div className="flex h-9 shrink-0 items-center border-b border-border-soft px-3 font-mono text-xs text-muted">
            Console
          </div>
          <div className="min-h-0 flex-1">
            <Console
              status={state.status}
              output={state.output}
              pendingInputLine={state.pendingInputLine}
              error={state.error}
              onSubmitInput={submitInput}
            />
          </div>
        </section>
      </main>
    </div>
  );
}
