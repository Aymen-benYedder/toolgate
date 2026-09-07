import "dotenv/config";
import { runSeed } from "../src/demo/seed.js";

/**
 * CLI entrypoint for the demo seed — thin wrapper around the shared
 * runSeed() so `npm run seed` and POST /api/demo/reset behave identically.
 */
async function main(): Promise<void> {
  console.log("[seed] connecting to database...");
  const summary = await runSeed();
  console.log(`[seed] admin user ready: ${summary.adminEmail}`);
  console.log(`[seed] ${summary.policyCount} default policies ready`);
  console.log(
    `[seed] seeded ${summary.requestCount} historical requests + ${summary.auditEventCount} audit events`,
  );
  console.log(`[seed] status mix: ${JSON.stringify(summary.statusMix)}`);
}

main().catch(async (err) => {
  console.error("[seed] failed:", err);
  process.exit(1);
});