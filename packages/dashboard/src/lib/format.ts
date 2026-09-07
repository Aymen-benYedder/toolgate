import type { RequestStatus } from "../types";

/** Relative time like "2s ago" / "3m ago" / "2h ago" / "Jan 3". */
export function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  if (diff < 0) return "now";
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function formatTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function formatCurrency(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(n);
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/** Pretty-print a JSON value for the payload panels (mono, 2-space indent). */
export function prettyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

/** Short id for display: "cmtqp1fii0004w16wue5es99p" → "cmtqp1fii…es99p". */
export function shortId(id: string): string {
  if (id.length <= 16) return id;
  return `${id.slice(0, 8)}…${id.slice(-4)}`;
}

/**
 * Status → presentation mapping (spec §10.4):
 * green = allowed, red = blocked, amber = pending, gray = rejected.
 * Icons accompany color so status is never conveyed by color alone (§12 a11y).
 */
export const STATUS_META: Record<
  RequestStatus,
  { label: string; badge: string; dot: string; icon: string }
> = {
  PENDING: {
    label: "Pending",
    badge: "bg-amber-500/10 text-amber-400 ring-amber-500/30",
    dot: "bg-amber-400",
    icon: "⏳",
  },
  APPROVED: {
    label: "Approved",
    badge: "bg-emerald-500/10 text-emerald-400 ring-emerald-500/30",
    dot: "bg-emerald-400",
    icon: "✓",
  },
  AUTO_ALLOWED: {
    label: "Auto-allowed",
    badge: "bg-emerald-500/10 text-emerald-400 ring-emerald-500/30",
    dot: "bg-emerald-400",
    icon: "✓",
  },
  REJECTED: {
    label: "Rejected",
    badge: "bg-zinc-500/10 text-zinc-400 ring-zinc-500/30",
    dot: "bg-zinc-400",
    icon: "✕",
  },
  AUTO_BLOCKED: {
    label: "Auto-blocked",
    badge: "bg-red-500/10 text-red-400 ring-red-500/30",
    dot: "bg-red-400",
    icon: "⛔",
  },
};

export function statusMeta(status: RequestStatus) {
  return STATUS_META[status] ?? STATUS_META.REJECTED;
}