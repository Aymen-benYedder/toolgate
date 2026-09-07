import { useEffect, useRef } from "react";
import { timeAgo } from "../lib/format";
import type { ToolCallRequest } from "../types";
import { StatusBadge } from "./StatusBadge";

/**
 * Live activity feed (spec §10.1): compact rows of recent decisions
 * (allowed / blocked / approved / rejected) with status badges and relative
 * timestamps. Newest at top; auto-scrolls to the newest row on arrival.
 */
export function ActivityFeed({ items }: { items: ToolCallRequest[] }) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [items.length]);

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-zinc-800 p-8 text-center text-sm text-zinc-500">
        No activity yet — decisions will appear here in real time.
      </div>
    );
  }

  return (
    <div
      ref={listRef}
      className="max-h-[560px] space-y-2 overflow-y-auto pr-1"
      aria-label="Live activity feed"
    >
      {items.map((r) => (
        <div
          key={r.id}
          className="flex items-center gap-3 rounded-md border border-zinc-800/60 bg-zinc-900/40 px-3 py-2.5"
        >
          <StatusBadge status={r.status} />
          <div className="min-w-0 flex-1">
            <span className="truncate font-mono text-sm font-semibold text-zinc-200">
              {r.toolName}
            </span>
            <span className="ml-2 truncate font-mono text-xs text-zinc-500">
              {r.agentName}
            </span>
          </div>
          <span className="shrink-0 font-mono text-xs tabular-nums text-zinc-500">
            {timeAgo(r.createdAt)}
          </span>
        </div>
      ))}
    </div>
  );
}