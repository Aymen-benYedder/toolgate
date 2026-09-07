import { useCallback, useEffect, useMemo, useState } from "react";
import { endpoints } from "../lib/api";
import { formatDateTime, prettyJson } from "../lib/format";
import type { AuditEvent, RequestStatus, ToolCallRequest } from "../types";
import { StatusBadge } from "../components/StatusBadge";

const PAGE_SIZE = 50;

type SortKey = "createdAt" | "agentName" | "toolName" | "status";
type SortDir = "asc" | "desc";

const STATUS_FILTERS: Array<RequestStatus | "ALL"> = [
  "ALL",
  "PENDING",
  "APPROVED",
  "REJECTED",
  "AUTO_ALLOWED",
  "AUTO_BLOCKED",
];

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = typeof value === "string" ? value : JSON.stringify(value);
  return `"${s.replace(/"/g, '""')}"`;
}

function toCsv(rows: ToolCallRequest[]): string {
  const header = [
    "id",
    "createdAt",
    "agentName",
    "toolName",
    "status",
    "matchedPolicy",
    "decidedBy",
    "reasoning",
    "result",
  ];
  const lines = rows.map((r) =>
    [
      csvCell(r.id),
      csvCell(r.createdAt),
      csvCell(r.agentName),
      csvCell(r.toolName),
      csvCell(r.status),
      csvCell(r.matchedPolicyName ?? r.matchedPolicyId),
      csvCell(r.decidedBy),
      csvCell(r.reasoning),
      csvCell(r.result ? JSON.stringify(r.result) : ""),
    ].join(","),
  );
  return [header.join(","), ...lines].join("\n");
}

function downloadCsv(rows: ToolCallRequest[]) {
  const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `toolgate-audit-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Expanded row: full JSON detail + the request's audit trail (spec §10.2). */
function ExpandedDetail({ request }: { request: ToolCallRequest }) {
  const [events, setEvents] = useState<AuditEvent[] | null>(null);

  useEffect(() => {
    let alive = true;
    endpoints
      .audit({ requestId: request.id, pageSize: 100 })
      .then((res) => {
        if (alive) setEvents(res.events);
      })
      .catch(() => setEvents([]));
    return () => {
      alive = false;
    };
  }, [request.id]);

  return (
    <div className="grid gap-4 p-4 lg:grid-cols-2">
      <div className="space-y-4">
        <div>
          <h4 className="mb-1 font-mono text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Input
          </h4>
          <pre className="overflow-auto rounded-md bg-zinc-950/80 p-3 font-mono text-xs leading-relaxed text-zinc-300">
            {prettyJson(request.toolInput)}
          </pre>
        </div>
        {request.reasoning && (
          <div>
            <h4 className="mb-1 font-mono text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Reasoning
            </h4>
            <blockquote className="border-l-2 border-zinc-700 pl-3 text-sm italic text-zinc-400">
              “{request.reasoning}”
            </blockquote>
          </div>
        )}
        {request.result && (
          <div>
            <h4 className="mb-1 font-mono text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Result
            </h4>
            <pre className="overflow-auto rounded-md bg-zinc-950/80 p-3 font-mono text-xs leading-relaxed text-zinc-300">
              {prettyJson(request.result)}
            </pre>
          </div>
        )}
      </div>

      <div>
        <h4 className="mb-1 font-mono text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Audit trail
        </h4>
        {events === null ? (
          <div className="animate-pulse rounded-md bg-zinc-900/60 p-4 text-sm text-zinc-500">
            Loading…
          </div>
        ) : events.length === 0 ? (
          <div className="rounded-md border border-dashed border-zinc-800 p-4 text-sm text-zinc-500">
            No audit events for this request.
          </div>
        ) : (
          <ol className="space-y-2">
            {events.map((e) => (
              <li key={e.id} className="rounded-md border border-zinc-800/60 bg-zinc-900/40 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-semibold text-zinc-200">{e.event}</span>
                  <span className="shrink-0 font-mono text-xs tabular-nums text-zinc-500">
                    {formatDateTime(e.createdAt)}
                  </span>
                </div>
                {Object.keys(e.detail).length > 0 && (
                  <pre className="mt-2 overflow-auto rounded bg-zinc-950/60 p-2 font-mono text-[11px] leading-relaxed text-zinc-400">
                    {prettyJson(e.detail)}
                  </pre>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

export function AuditLog() {
  const [rows, setRows] = useState<ToolCallRequest[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<RequestStatus | "ALL">("ALL");
  const [agent, setAgent] = useState("");
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await endpoints.requests({
        page,
        pageSize: PAGE_SIZE,
        status: status === "ALL" ? undefined : status,
        agentName: agent.trim() || undefined,
      });
      setRows(res.requests);
      setTotal(res.total);
    } catch {
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, status, agent]);

  useEffect(() => {
    void load();
  }, [load]);

  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = a[sortKey] ?? "";
      const bv = b[sortKey] ?? "";
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [rows, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-mono text-2xl font-bold">Audit Log</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Every tool call, decision, and policy match — {total.toLocaleString()} records.
          </p>
        </div>
        <button
          type="button"
          onClick={() => downloadCsv(sorted)}
          disabled={sorted.length === 0}
          className="inline-flex items-center gap-2 rounded-md border border-zinc-700 px-3 py-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:opacity-50"
        >
          ⬇ Export CSV
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-zinc-400">
          Status
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as RequestStatus | "ALL");
              setPage(1);
            }}
            className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 font-mono text-sm text-zinc-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
          >
            {STATUS_FILTERS.map((s) => (
              <option key={s} value={s}>
                {s === "ALL" ? "All statuses" : s}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-zinc-400">
          Agent
          <input
            type="text"
            value={agent}
            onChange={(e) => {
              setAgent(e.target.value);
              setPage(1);
            }}
            placeholder="demo-agent-01"
            className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 font-mono text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
          />
        </label>
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border border-zinc-800">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-900/60 font-mono text-xs uppercase tracking-wider text-zinc-500">
                <th className="px-3 py-2.5">
                  <button type="button" onClick={() => toggleSort("createdAt")} className="hover:text-zinc-300">
                    Time {sortKey === "createdAt" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                  </button>
                </th>
                <th className="px-3 py-2.5">
                  <button type="button" onClick={() => toggleSort("agentName")} className="hover:text-zinc-300">
                    Agent {sortKey === "agentName" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                  </button>
                </th>
                <th className="px-3 py-2.5">
                  <button type="button" onClick={() => toggleSort("toolName")} className="hover:text-zinc-300">
                    Tool {sortKey === "toolName" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                  </button>
                </th>
                <th className="px-3 py-2.5">
                  <button type="button" onClick={() => toggleSort("status")} className="hover:text-zinc-300">
                    Status {sortKey === "status" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                  </button>
                </th>
                <th className="px-3 py-2.5">Policy</th>
                <th className="px-3 py-2.5">Decided by</th>
                <th className="px-3 py-2.5" aria-label="Expand" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-zinc-500">
                    Loading…
                  </td>
                </tr>
              ) : sorted.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-zinc-500">
                    No records match the current filters.
                  </td>
                </tr>
              ) : (
                sorted.map((r) => (
                  <ExpandedRow
                    key={r.id}
                    request={r}
                    expanded={expandedId === r.id}
                    onToggle={() => setExpandedId((cur) => (cur === r.id ? null : r.id))}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <span className="font-mono text-xs text-zinc-500">
          Page {page} of {totalPages} · {total.toLocaleString()} records
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 transition-colors hover:bg-zinc-800 disabled:opacity-40"
          >
            ← Prev
          </button>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 transition-colors hover:bg-zinc-800 disabled:opacity-40"
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}

function ExpandedRow({
  request,
  expanded,
  onToggle,
}: {
  request: ToolCallRequest;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr
        onClick={onToggle}
        className="cursor-pointer border-b border-zinc-800/60 transition-colors hover:bg-zinc-900/40"
      >
        <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs tabular-nums text-zinc-400">
          {formatDateTime(request.createdAt)}
        </td>
        <td className="px-3 py-2.5 font-mono text-xs text-zinc-300">{request.agentName}</td>
        <td className="px-3 py-2.5 font-mono text-sm font-semibold text-zinc-100">
          {request.toolName}
        </td>
        <td className="px-3 py-2.5">
          <StatusBadge status={request.status} />
        </td>
        <td className="px-3 py-2.5 font-mono text-xs text-zinc-400">
          {request.matchedPolicyName ?? request.matchedPolicyId ?? "—"}
        </td>
        <td className="px-3 py-2.5 font-mono text-xs text-zinc-400">
          {request.decidedBy ?? "—"}
        </td>
        <td className="px-3 py-2.5 text-right font-mono text-xs text-zinc-500">
          <span aria-hidden="true">{expanded ? "▾" : "▸"}</span>
          <span className="sr-only">{expanded ? "Collapse" : "Expand"} details</span>
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-zinc-800/60 bg-zinc-950/40">
          <td colSpan={7}>
            <ExpandedDetail request={request} />
          </td>
        </tr>
      )}
    </>
  );
}