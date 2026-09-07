import { NavLink, Outlet } from "react-router-dom";
import { useSocket } from "../hooks/useSocket";

const NAV = [
  { to: "/", label: "Live Feed", end: true },
  { to: "/audit", label: "Audit Log" },
  { to: "/policies", label: "Policy Editor" },
];

/**
 * Dashboard shell — sidebar on desktop, top bar on mobile.
 * Connection indicator (green/amber dot) reflects the Socket.IO state;
 * the polling fallback + "reconnecting…" label lands in AG-11.
 */
export function Layout() {
  const { connected } = useSocket();

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="flex items-center justify-between gap-4 border-b border-zinc-800 bg-zinc-950/80 px-4 py-3 md:w-56 md:flex-col md:items-stretch md:justify-start md:border-b-0 md:border-r md:px-4 md:py-6">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-500/15 font-mono text-sm font-bold text-emerald-400 ring-1 ring-inset ring-emerald-500/30">
            tg
          </div>
          <span className="font-mono text-sm font-bold tracking-tight text-zinc-100">
            toolgate
          </span>
        </div>

        <nav className="flex items-center gap-1 md:mt-8 md:flex-col md:items-stretch" aria-label="Main">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-zinc-800/80 text-zinc-100"
                    : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:mt-auto md:flex">
          <span
            className={`h-2 w-2 rounded-full ${connected ? "bg-emerald-400" : "bg-amber-400"}`}
            aria-hidden="true"
          />
          <span className="font-mono text-xs text-zinc-500">
            {connected ? "live" : "connecting…"}
          </span>
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        <Outlet />
      </main>
    </div>
  );
}