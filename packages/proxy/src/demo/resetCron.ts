import { runSeed } from "./seed.js";

/**
 * Demo reset cron (spec §9.5, AG-11): while DEMO_MODE=true, re-seed the
 * demo data every ~30 minutes so a public demo never accumulates junk or
 * gets "broken" by visitors. Mirrors POST /api/demo/reset exactly.
 */

const RESET_INTERVAL_MS = 30 * 60 * 1000; // 30 min

let timer: NodeJS.Timeout | null = null;

async function resetOnce(): Promise<void> {
  try {
    const summary = await runSeed();
    console.log(
      `[toolgate] demo reset cron: re-seeded ${summary.requestCount} requests + ` +
        `${summary.auditEventCount} audit events (${JSON.stringify(summary.statusMix)})`,
    );
  } catch (err) {
    console.error("[toolgate] demo reset cron failed:", err);
  }
}

/** Start the periodic reset (no-op if already running). */
export function startDemoResetCron(): void {
  if (timer) return;
  timer = setInterval(() => void resetOnce(), RESET_INTERVAL_MS);
  console.log("[toolgate] demo reset cron started (every 30 min)");
}

/** Stop the periodic reset. */
export function stopDemoResetCron(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
    console.log("[toolgate] demo reset cron stopped");
  }
}