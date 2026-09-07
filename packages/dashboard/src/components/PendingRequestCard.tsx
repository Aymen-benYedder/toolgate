import { useState } from "react";
import toast from "react-hot-toast";
import { endpoints } from "../lib/api";
import { prettyJson, shortId, timeAgo } from "../lib/format";
import type { ToolCallRequest } from "../types";
import { StatusBadge } from "./StatusBadge";

/**
 * One pending approval (spec §10.1): tool name, agent, pretty-printed input,
 * the agent's stated reasoning, a red pulsing left border, and Approve/Reject.
 * Calls the REST endpoints; the parent removes the card on success.
 */
export function PendingRequestCard({
  request,
  onDecided,
}: {
  request: ToolCallRequest;
  onDecided: (id: string) => void;
}) {
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);

  const decide = async (action: "approve" | "reject") => {
    setBusy(action);
    try {
      if (action === "approve") {
        await endpoints.approve(request.id);
        toast.success(`Approved ${request.toolName}`);
      } else {
        await endpoints.reject(request.id);
        toast.success(`Rejected ${request.toolName}`);
      }
      onDecided(request.id);
    } catch {
      toast.error(`Failed to ${action} ${request.toolName}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="relative overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
      <div className="absolute inset-y-0 left-0 w-0.5 animate-pulse bg-red-500" aria-hidden="true" />

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-mono text-sm font-bold text-zinc-100">
            {request.toolName}
          </div>
          <div className="mt-0.5 truncate font-mono text-xs text-zinc-500">
            {request.agentName} · {shortId(request.id)} · {timeAgo(request.createdAt)}
          </div>
        </div>
        <StatusBadge status="PENDING" />
      </div>

      <pre className="mt-3 max-h-40 overflow-auto rounded-md bg-zinc-950/80 p-3 font-mono text-sm leading-relaxed text-zinc-300">
        {prettyJson(request.toolInput)}
      </pre>

      {request.reasoning && (
        <blockquote className="mt-3 border-l-2 border-zinc-700 pl-3 text-sm italic text-zinc-400">
          “{request.reasoning}”
        </blockquote>
      )}

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void decide("approve")}
          className="inline-flex flex-1 items-center justify-center rounded-md bg-emerald-500 px-3 py-2 text-sm font-semibold text-zinc-950 transition-colors hover:bg-emerald-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 disabled:opacity-50"
        >
          {busy === "approve" ? "…" : "Approve"}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void decide("reject")}
          className="inline-flex flex-1 items-center justify-center rounded-md bg-red-500/90 px-3 py-2 text-sm font-semibold text-zinc-950 transition-colors hover:bg-red-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300 disabled:opacity-50"
        >
          {busy === "reject" ? "…" : "Reject"}
        </button>
      </div>
    </div>
  );
}