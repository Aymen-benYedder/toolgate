import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { PendingRequestCard } from "../components/PendingRequestCard";
import { useSocket } from "../hooks/useSocket";
import { ApiError, endpoints } from "../lib/api";
import { prettyJson, shortId } from "../lib/format";
import type { AgentCallOutcome, AgentStatus, LiveAgentResult, ToolCallRequest } from "../types";

const PENDING_CAP = 20;
const RUN_TIMEOUT_MS = 75_000; // approval timeout is 60s; give the fetch headroom

/** Outcome → badge presentation (mirrors STATUS_META language). */
const OUTCOME_META: Record<AgentCallOutcome["status"], { label: string; badge: string; icon: string }> = {
  allowed: { label: "Allowed", badge: "bg-emerald-500/10 text-emerald-400 ring-emerald-500/30", icon: "✓" },
  approved: { label: "Approved", badge: "bg-emerald-500/10 text-emerald-400 ring-emerald-500/30", icon: "✓" },
  blocked: { label: "Blocked", badge: "bg-red-500/10 text-red-400 ring-red-500/30", icon: "⛔" },
  rejected: { label: "Rejected", badge: "bg-zinc-500/10 text-zinc-400 ring-zinc-500/30", icon: "✕" },
  timeout: { label: "Timed out", badge: "bg-amber-500/10 text-amber-400 ring-amber-500/30", icon: "⏳" },
  error: { label: "Error", badge: "bg-red-500/10 text-red-400 ring-red-500/30", icon: "!" },
};

function upsert<T extends { id: string }>(list: T[], item: T, cap: number): T[] {
  const next = [item, ...list.filter((x) => x.id !== item.id)];
  return next.slice(0, cap);
}

/**
 * Live Agent Mode (spec §11, AG-12) — the "genuinely real" proof point.
 * A real LLM (any provider) receives a natural-language instruction, decides
 * which tools to call, and those calls flow through the exact same policy
 * pipeline as the simulated agent. Pending calls wait here for approval.
 * The feature is optional: without a provider key it shows an info panel.
 */
export function LiveAgent() {
  const { onEvent } = useSocket();
  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [instruction, setInstruction] = useState("");
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<LiveAgentResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<ToolCallRequest[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Provider availability.
  useEffect(() => {
    let alive = true;
    endpoints
      .agentStatus()
      .then((s) => alive && setStatus(s))
      .catch(() => alive && setStatus({ available: false, provider: null, model: null }));
    return () => {
      alive = false;
    };
  }, []);

  // Pending approvals (same socket contract as LiveFeed) so the user can
  // approve/reject right here while the agent waits.
  useEffect(() => {
    let alive = true;
    endpoints
      .pending()
      .then((p) => alive && setPending(p.requests))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  useEffect(
    () =>
      onEvent("new_pending_request", (row) => {
        setPending((prev) => upsert(prev, row, PENDING_CAP));
      }),
    [onEvent],
  );

  useEffect(
    () =>
      onEvent("request_updated", (row) => {
        if (row.status === "PENDING") {
          setPending((prev) => upsert(prev, row, PENDING_CAP));
          return;
        }
        setPending((prev) => prev.filter((x) => x.id !== row.id));
      }),
    [onEvent],
  );

  const handleDecided = useCallback((id: string) => {
    setPending((prev) => prev.filter((x) => x.id !== id));
  }, []);

  // Cleanup on unmount.
  useEffect(
    () => () => {
      abortRef.current?.abort();
      if (timerRef.current) clearInterval(timerRef.current);
    },
    [],
  );

  const run = async () => {
    const text = instruction.trim();
    if (!text || running) return;

    setRunning(true);
    setResult(null);
    setError(null);
    setElapsed(0);
    timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);

    const controller = new AbortController();
    abortRef.current = controller;
    const timeout = setTimeout(() => controller.abort(), RUN_TIMEOUT_MS);

    try {
      const res = await endpoints.runAgent(text, controller.signal);
      setResult(res);
      if (res.calls.some((c) => c.status === "blocked")) {
        toast.error("Some tool calls were blocked by policy", { duration: 5000 });
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else if (err instanceof DOMException && err.name === "AbortError") {
        setError("The run timed out after 75s — pending approvals may still be waiting in the feed.");
      } else {
        setError(String(err));
      }
    } finally {
      clearTimeout(timeout);
      if (timerRef.current) clearInterval(timerRef.current);
      abortRef.current = null;
      setRunning(false);
    }
  };

  if (!status) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-6">
        <div className="animate-pulse rounded-lg border border-zinc-800 p-8 text-sm text-zinc-500">
          Checking Live Agent Mode…
        </div>
      </div>
    );
  }

  if (!status.available) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-6">
        <h1 className="font-mono text-2xl font-bold">Live Agent</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Drive the policy pipeline with a real LLM — optional, secondary feature.
        </p>
        <div className="mt-6 rounded-lg border border-zinc-800 bg-zinc-900/40 p-6">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 text-lg" aria-hidden="true">
              🔌
            </span>
            <div>
              <h2 className="font-mono text-sm font-semibold text-zinc-200">
                Live Agent Mode is not enabled
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                This is an optional proof point — the base demo never needs it. To enable, set a
                provider key on the server:
              </p>
              <pre className="mt-3 overflow-x-auto rounded-md bg-zinc-950/80 p-3 font-mono text-xs leading-relaxed text-zinc-300">
{`# OpenAI-compatible (OpenAI, OpenRouter, Groq, DeepSeek, Ollama, ...)
LLM_API_KEY=sk-...
LLM_BASE_URL=https://api.openai.com/v1   # optional
LLM_MODEL=gpt-4o-mini                    # optional

# or native Anthropic
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-sonnet-4-5        # optional`}
              </pre>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-mono text-2xl font-bold">Live Agent</h1>
          <p className="mt-1 text-sm text-zinc-500">
            A real LLM decides which tools to call — every call flows through the same policy
            pipeline as the simulated agent.
          </p>
        </div>
        <span className="rounded-full bg-emerald-500/10 px-3 py-1 font-mono text-xs text-emerald-400 ring-1 ring-inset ring-emerald-500/30">
          {status.provider} · {status.model}
        </span>
      </div>

      <div className="mt-6 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
        <label htmlFor="agent-instruction" className="font-mono text-sm font-semibold text-zinc-200">
          Instruction
        </label>
        <textarea
          id="agent-instruction"
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void run();
          }}
          rows={3}
          maxLength={2000}
          placeholder='e.g. "Clean up inactive test accounts" or "Transfer $5,000 to the marketing account"'
          className="mt-2 w-full resize-y rounded-md border border-zinc-700 bg-zinc-950/80 px-3 py-2 font-mono text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
        />
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-xs text-zinc-500">
            {running ? (
              <span className="text-amber-400">
                Agent is working… pending calls wait for your approval below ({elapsed}s)
              </span>
            ) : (
              <>
                Pending calls wait for your approval — approve or reject them below.{" "}
                <kbd className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
                  Ctrl/⌘ + Enter
                </kbd>
              </>
            )}
          </p>
          <button
            type="button"
            onClick={() => void run()}
            disabled={running || !instruction.trim()}
            className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 transition-colors hover:bg-emerald-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {running ? "Running…" : "Run agent"}
          </button>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="mt-4 rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300"
        >
          {error}
        </div>
      )}

      {result && (
        <div className="mt-6 space-y-4">
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-mono text-sm font-semibold uppercase tracking-wider text-zinc-500">
                Run result
              </h2>
              <span className="font-mono text-xs text-zinc-500">
                {result.calls.length} tool call{result.calls.length === 1 ? "" : "s"} · {result.model}
              </span>
            </div>
            {result.message && (
              <p className="mt-3 text-sm leading-relaxed text-zinc-300">{result.message}</p>
            )}
            {result.calls.length === 0 && (
              <p className="mt-3 text-sm text-zinc-500">
                The model answered without calling any tools.
              </p>
            )}
          </div>

          {result.calls.map((call, i) => (
            <CallCard key={`${call.requestId}-${i}`} call={call} />
          ))}
        </div>
      )}

      <section aria-label="Pending approvals" className="mt-8">
        <h2 className="mb-3 font-mono text-sm font-semibold uppercase tracking-wider text-zinc-500">
          Pending approvals{" "}
          <span className="ml-1 rounded-full bg-amber-500/15 px-2 py-0.5 font-mono text-xs text-amber-400">
            {pending.length}
          </span>
        </h2>
        {pending.length === 0 ? (
          <div className="rounded-lg border border-dashed border-zinc-800 p-8 text-center text-sm text-zinc-500">
            No pending approvals — the agent is behaving.
          </div>
        ) : (
          <div className="space-y-3">
            {pending.map((r) => (
              <PendingRequestCard key={r.id} request={r} onDecided={handleDecided} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function CallCard({ call }: { call: AgentCallOutcome }) {
  const meta = OUTCOME_META[call.status];
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-semibold text-zinc-100">{call.toolName}</span>
          <span className="font-mono text-xs text-zinc-500">{shortId(call.requestId)}</span>
        </div>
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-mono text-xs ring-1 ring-inset ${meta.badge}`}
        >
          <span aria-hidden="true">{meta.icon}</span>
          {meta.label}
        </span>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div>
          <h3 className="font-mono text-[11px] uppercase tracking-wider text-zinc-500">Input</h3>
          <pre className="mt-1 max-h-40 overflow-auto rounded-md bg-zinc-950/80 p-3 font-mono text-xs leading-relaxed text-zinc-300">
            {prettyJson(call.toolInput)}
          </pre>
        </div>
        <div>
          <h3 className="font-mono text-[11px] uppercase tracking-wider text-zinc-500">
            {call.status === "blocked" || call.status === "error" ? "Error" : "Result"}
          </h3>
          <pre className="mt-1 max-h-40 overflow-auto rounded-md bg-zinc-950/80 p-3 font-mono text-xs leading-relaxed text-zinc-300">
            {call.status === "blocked" || call.status === "error"
              ? prettyJson(call.error ?? {})
              : prettyJson(call.result ?? call.reason ?? null)}
          </pre>
        </div>
      </div>
    </div>
  );
}