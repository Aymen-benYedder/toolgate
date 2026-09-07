import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { ActivityFeed } from "../components/ActivityFeed";
import { DemoModeBanner } from "../components/DemoModeBanner";
import { PendingRequestCard } from "../components/PendingRequestCard";
import { ScenarioReplayButton } from "../components/ScenarioReplayButton";
import { StatsBar } from "../components/StatsBar";
import { useSocket } from "../hooks/useSocket";
import { endpoints } from "../lib/api";
import type { ToolCallRequest } from "../types";

const ACTIVITY_CAP = 50;
const PENDING_CAP = 20;

function upsert<T extends { id: string }>(list: T[], item: T, cap: number): T[] {
  const next = [item, ...list.filter((x) => x.id !== item.id)];
  return next.slice(0, cap);
}

/**
 * LiveFeed — the money shot (spec §10.1).
 * Left: pending approvals (approve/reject). Right: live activity feed.
 * Both update via Socket.IO; stats poll every 5s; toasts on major events.
 */
export function LiveFeed() {
  const { onEvent } = useSocket();
  const [pending, setPending] = useState<ToolCallRequest[]>([]);
  const [activity, setActivity] = useState<ToolCallRequest[]>([]);
  const [loaded, setLoaded] = useState(false);
  const toastShown = useRef<Set<string>>(new Set());

  // Initial load: pending list + recent history (decisions only).
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [p, h] = await Promise.all([
          endpoints.pending(),
          endpoints.requests({ pageSize: ACTIVITY_CAP }),
        ]);
        if (!alive) return;
        setPending(p.requests);
        setActivity(h.requests.filter((r) => r.status !== "PENDING"));
      } catch {
        // socket will still populate the feed
      } finally {
        if (alive) setLoaded(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Socket: new pending request → prepend card + toast (once per id).
  useEffect(
    () =>
      onEvent("new_pending_request", (row) => {
        setPending((prev) => upsert(prev, row, PENDING_CAP));
        if (!toastShown.current.has(row.id)) {
          toastShown.current.add(row.id);
          toast(`New approval needed: ${row.toolName}`, {
            icon: "⏳",
            duration: 4000,
          });
        }
      }),
    [onEvent],
  );

  // Socket: decision made → remove from pending, prepend to activity, toast blocks.
  useEffect(
    () =>
      onEvent("request_updated", (row) => {
        if (row.status === "PENDING") {
          setPending((prev) => upsert(prev, row, PENDING_CAP));
          return;
        }
        setPending((prev) => prev.filter((x) => x.id !== row.id));
        setActivity((prev) => upsert(prev, row, ACTIVITY_CAP));
        if (row.status === "AUTO_BLOCKED" && !toastShown.current.has(row.id)) {
          toastShown.current.add(row.id);
          toast.error(`Blocked: ${row.toolName}`, { duration: 4000 });
        }
      }),
    [onEvent],
  );

  const handleDecided = useCallback((id: string) => {
    setPending((prev) => prev.filter((x) => x.id !== id));
  }, []);

  return (
    <div className="min-h-full">
      <DemoModeBanner />

      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-mono text-2xl font-bold">Live Feed</h1>
            <p className="mt-1 text-sm text-zinc-500">
              Every tool call an agent makes — watched, gated, and audited.
            </p>
          </div>
          <ScenarioReplayButton />
        </div>

        <div className="mt-6">
          <StatsBar />
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <section aria-label="Pending approvals">
            <h2 className="mb-3 font-mono text-sm font-semibold uppercase tracking-wider text-zinc-500">
              Pending approvals{" "}
              <span className="ml-1 rounded-full bg-amber-500/15 px-2 py-0.5 font-mono text-xs text-amber-400">
                {pending.length}
              </span>
            </h2>
            {loaded && pending.length === 0 ? (
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

          <section aria-label="Live activity">
            <h2 className="mb-3 font-mono text-sm font-semibold uppercase tracking-wider text-zinc-500">
              Live activity
            </h2>
            <ActivityFeed items={activity} />
          </section>
        </div>
      </div>
    </div>
  );
}