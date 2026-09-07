import { useEffect, useState } from "react";
import { endpoints } from "../lib/api";

/**
 * Amber banner shown when the proxy runs in DEMO_MODE (spec §9.4).
 * Reads /health — the same flag that gates the backend's demo behavior.
 */
export function DemoModeBanner() {
  const [demoMode, setDemoMode] = useState(false);

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

  return (
    <div className="border-b border-amber-500/20 bg-amber-500/10 px-4 py-2 text-center text-xs text-amber-300 sm:text-sm">
      <span className="font-mono font-bold">DEMO MODE</span>
      <span className="mx-2 text-amber-500/50">|</span>
      simulated agent traffic — approve/reject actions are sandboxed to the mock database
    </div>
  );
}