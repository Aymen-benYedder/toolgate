import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { endpoints } from "../lib/api";

/**
 * Amber banner shown when the proxy runs in DEMO_MODE (spec §9.4).
 * Reads /health — the same flag that gates the backend's demo behavior.
 * The "Reset demo data" button re-seeds history via POST /api/demo/reset (AG-11).
 */
export function DemoModeBanner() {
  const [demoMode, setDemoMode] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    let alive = true;
    endpoints
      .health()
      .then((h) => {
        if (alive) setDemoMode(h.demoMode);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (!demoMode) return null;

  const handleReset = async () => {
    if (resetting) return;
    setResetting(true);
    try {
      const r = await endpoints.resetDemo();
      toast.success(
        `Demo reset — ${r.requestCount} requests, ${r.auditEventCount} audit events re-seeded`,
        { duration: 4000 },
      );
    } catch {
      toast.error("Reset failed — is the proxy running?");
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 border-b border-amber-500/20 bg-amber-500/10 px-4 py-2 text-center text-xs text-amber-300 sm:text-sm">
      <span className="font-mono font-bold">DEMO MODE</span>
      <span className="text-amber-500/50">|</span>
      <span>simulated agent traffic — approve/reject actions are sandboxed to the mock database</span>
      <button
        type="button"
        onClick={handleReset}
        disabled={resetting}
        className="ml-2 rounded border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 font-mono text-xs text-amber-300 transition-colors hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {resetting ? "resetting…" : "reset demo data"}
      </button>
    </div>
  );
}