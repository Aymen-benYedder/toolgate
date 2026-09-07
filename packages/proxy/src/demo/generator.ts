import { faker } from "@faker-js/faker";
import { handleToolCall } from "../mcp/interceptor.js";
import { getMockDb, type MockUser } from "./mockDb.js";

/**
 * Simulated agent traffic generator (spec §9.2).
 *
 * When DEMO_MODE=true, fires a tool call through the interceptor every
 * 4-8 seconds (randomized) with a realistic mix:
 *   ~50% benign reads        → auto-allowed
 *   ~20% medium-risk         → transfer_funds (some ≤$100, some >$100)
 *   ~15% flagged PII access  → read_user_pii → pending
 *   ~15% destructive         → delete_user_record / drop_table → auto-blocked
 *
 * Every call carries a plausible reasoning string and agentName
 * "demo-agent-01" so the live feed reads like a real agent, not raw JSON.
 *
 * Calls go through handleToolCall in-process — the exact same pipeline the
 * POST /mcp endpoint uses (policy eval → DB row → audit → socket events).
 * Pending calls are fired without awaiting: handleToolCall holds until a
 * human decides or the 60s timeout fires, and the generator must not block.
 */

const AGENT_NAME = "demo-agent-01";

const READ_REASONS = [
  "Customer support ticket #4821 — fetching account details to verify identity",
  "Checking recent order history for the weekly returns report",
  "Verifying stock levels before confirming the restock order",
  "Looking up user profile to update the loyalty tier",
  "Pulling order status for the shipping queue",
];

const TRANSFER_REASONS = [
  "Processing refund for order #1042 — amount within approval threshold",
  "Executing vendor payment for Q3 invoice",
  "Moving funds between internal accounts for payroll run",
  "Settling a customer balance adjustment",
];

const PII_REASONS = [
  "Verifying customer identity for account recovery — requires full contact details",
  "Cross-checking email and phone against the fraud watchlist",
  "Updating the customer's contact preferences — needs current email and phone",
];

const DESTRUCTIVE_REASONS = [
  "User requested GDPR deletion — removing account record permanently",
  "Cleaning up test data — dropping the transactions table to reset the ledger",
  "Removing duplicate user records from the staging import",
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function randomUser(db: ReturnType<typeof getMockDb>): MockUser {
  return pick(db.users);
}

interface GeneratedCall {
  toolName: string;
  toolInput: Record<string, unknown>;
  reasoning: string;
}

/** Build one realistic tool call according to the §9.2 mix. */
export function buildDemoCall(): GeneratedCall {
  const db = getMockDb();
  const roll = Math.random();

  if (roll < 0.5) {
    // ~50% benign reads
    const tool = pick(["get_user", "list_orders", "read_inventory"] as const);
    if (tool === "get_user") {
      return { toolName: tool, toolInput: { id: randomUser(db).id }, reasoning: pick(READ_REASONS) };
    }
    if (tool === "list_orders") {
      return { toolName: tool, toolInput: { userId: randomUser(db).id }, reasoning: pick(READ_REASONS) };
    }
    return { toolName: tool, toolInput: {}, reasoning: pick(READ_REASONS) };
  }

  if (roll < 0.7) {
    // ~20% medium-risk transfers — mix of auto-allow (≤100) and pending (>100)
    const amount = Math.random() < 0.5
      ? faker.number.float({ min: 10, max: 100, fractionDigits: 2 })
      : faker.number.float({ min: 101, max: 5000, fractionDigits: 2 });
    return {
      toolName: "transfer_funds",
      toolInput: {
        from: faker.finance.accountNumber(8),
        to: faker.finance.accountNumber(8),
        amount,
      },
      reasoning: pick(TRANSFER_REASONS),
    };
  }

  if (roll < 0.85) {
    // ~15% flagged PII access → pending
    return {
      toolName: "read_user_pii",
      toolInput: { id: randomUser(db).id },
      reasoning: pick(PII_REASONS),
    };
  }

  // ~15% destructive attempts → auto-blocked
  const tool = Math.random() < 0.5 ? "delete_user_record" : "drop_table";
  if (tool === "delete_user_record") {
    return {
      toolName: tool,
      toolInput: { id: randomUser(db).id },
      reasoning: pick(DESTRUCTIVE_REASONS),
    };
  }
  return {
    toolName: tool,
    toolInput: { table: pick(["users", "orders", "transactions", "inventory"] as const) },
    reasoning: pick(DESTRUCTIVE_REASONS),
  };
}

/** Fire one generated call through the interceptor (fire-and-forget). */
export async function fireDemoCall(): Promise<void> {
  const call = buildDemoCall();
  try {
    void handleToolCall({
      agentName: AGENT_NAME,
      toolName: call.toolName,
      toolInput: call.toolInput,
      reasoning: call.reasoning,
    }).catch((err) => console.error("[generator] call failed:", err));
  } catch (err) {
    console.error("[generator] call failed:", err);
  }
}

function randomDelayMs(): number {
  return 4000 + Math.random() * 4000; // 4-8s
}

let timer: NodeJS.Timeout | null = null;

/** Start the background generator (no-op if already running). */
export function startDemoGenerator(): void {
  if (timer) return;
  const tick = (): void => {
    void fireDemoCall();
    timer = setTimeout(tick, randomDelayMs());
  };
  timer = setTimeout(tick, randomDelayMs());
  console.log("[toolgate] demo traffic generator started (4-8s interval)");
}

/** Stop the background generator. */
export function stopDemoGenerator(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
    console.log("[toolgate] demo traffic generator stopped");
  }
}