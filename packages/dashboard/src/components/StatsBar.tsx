import { useEffect, useState } from "react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { endpoints } from "../lib/api";
import { formatDuration } from "../lib/format";
import type { Stats } from "../types";

interface SparkPoint {
  t: number;
  total: number;
}

/**
 * Live-updating summary counters (spec §10.1). Polls /api/stats every 5s and
 * accumulates a small history so the "Total requests" card gets a sparkline —
 * the slope shows the demo generator's activity rate at a glance.
 */
export function StatsBar() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [spark, setSpark] = useState<SparkPoint[]>([]);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const s = await endpoints.stats();
        if (!alive) return;
        setStats(s);
        setSpark((prev) => [...prev.slice(-29), { t: Date.now(), total: s.total }]);
      } catch {
        // keep last known values; next poll retries
      }
    };
    void tick();
    const id = setInterval(tick, 5000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  if (!stats) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-lg border border-zinc-800 bg-zinc-900/60" />
        ))}
      </div>
    );
  }

  const cards = [
    {
      label: "Total requests",
      value: stats.total.toLocaleString(),
      sub: "all time",
      valueClass: "text-zinc-100",
      spark: true,
    },
    {
      label: "Auto-allowed",
      value: stats.autoAllowed.toLocaleString(),
      sub: `${stats.autoAllowedPct}% of traffic`,
      valueClass: "text-emerald-400",
    },
    {
      label: "Blocked",
      value: stats.autoBlocked.toLocaleString(),
      sub: `${stats.autoBlockedPct}% of traffic`,
      valueClass: "text-red-400",
    },
    {
      label: "Pending",
      value: stats.pending.toLocaleString(),
      sub: `${stats.pendingPct}% of traffic`,
      valueClass: "text-amber-400",
    },
    {
      label: "Avg approval",
      value: formatDuration(stats.avgApprovalMs),
      sub: "human decisions",
      valueClass: "text-zinc-100",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {cards.map((card) => (
        <div
          key={card.label}
          className="relative overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/60 p-3"
        >
          <div className="font-mono text-[11px] uppercase tracking-wider text-zinc-500">
            {card.label}
            {card.spark && (
              <span className="ml-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400 align-middle" aria-hidden="true" />
            )}
          </div>
          <div className={`mt-1 font-mono text-2xl font-bold tabular-nums ${card.valueClass}`}>
            {card.value}
          </div>
          <div className="mt-0.5 text-xs text-zinc-500">{card.sub}</div>
          {card.spark && spark.length > 1 && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 opacity-60">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={spark} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#34d399" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area
                    type="monotone"
                    dataKey="total"
                    stroke="#34d399"
                    strokeWidth={1.5}
                    fill="url(#sparkFill)"
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}