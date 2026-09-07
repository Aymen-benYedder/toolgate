import { handleToolCall } from "../mcp/interceptor.js";
import { getMockDb } from "./mockDb.js";

/**
 * Scripted "Replay Attack Scenario" (spec §9.3) — triggered by the dashboard's
 * "▶ Simulate a risky agent action" button via POST /api/demo/scenario/:id.
 *
 * 1. "rogue_delete"  — drop_table on transactions → instantly BLOCKED
 * 2. "large_transfer" — transfer_funds $5,000 → pending card (visitor can decide)
 * 3. "pii_snoop"     — read_user_pii on a random user → pending + Sensitive badge
 *
 * Blocked scenarios resolve immediately (awaitable). Pending scenarios are
 * fired without awaiting — handleToolCall holds until a human decides or the
 * 60s timeout fires; the dashboard picks the card up via the socket event.
 */

export interface ScenarioResult {
  scenarioId: string;
  triggered: boolean;
  expected: "BLOCKED" | "PENDING";
  outcome?: string;
  requestId?: string;
  message: string;
}

const AGENT_NAME = "demo-agent-01";

export async function runScenario(scenarioId: string): Promise<ScenarioResult> {
  switch (scenarioId) {
    case "rogue_delete": {
      const outcome = await handleToolCall({
        agentName: AGENT_NAME,
        toolName: "drop_table",
        toolInput: { table: "transactions" },
        reasoning:
          "User requested a full cleanup of transaction history; dropping the transactions table to reset the ledger.",
      });
      return {
        scenarioId,
        triggered: true,
        expected: "BLOCKED",
        outcome: outcome.outcome,
        requestId: outcome.requestId,
        message: "drop_table blocked by policy",
      };
    }

    case "large_transfer": {
      void handleToolCall({
        agentName: AGENT_NAME,
        toolName: "transfer_funds",
        toolInput: {
          from: "ACC-10048213",
          to: "ACC-77319045",
          amount: 5000,
        },
        reasoning:
          "Executing the approved vendor payment for Q3 — $5,000 exceeds the auto-approval threshold, requesting sign-off.",
      }).catch((err) => console.error("[scenario] large_transfer failed:", err));
      return {
        scenarioId,
        triggered: true,
        expected: "PENDING",
        message: "transfer_funds $5,000 queued for approval",
      };
    }

    case "pii_snoop": {
      const user = getMockDb().users[0]!;
      void handleToolCall({
        agentName: AGENT_NAME,
        toolName: "read_user_pii",
        toolInput: { id: user.id },
        reasoning:
          "Verifying customer identity for account recovery — reading full contact details including email and phone.",
      }).catch((err) => console.error("[scenario] pii_snoop failed:", err));
      return {
        scenarioId,
        triggered: true,
        expected: "PENDING",
        message: "read_user_pii queued for approval (sensitive data)",
      };
    }

    default:
      return {
        scenarioId,
        triggered: false,
        expected: "PENDING",
        message: `Unknown scenario: ${scenarioId}`,
      };
  }
}