import { describe, expect, it } from "vitest";
import { getMockDb } from "../demo/mockDb.js";
import { runToolCallsThroughPipeline } from "./liveAgent.js";

/** A real user id from the deterministic mock DB (faker.seed(42)). */
const realUserId = getMockDb().users[0]!.id;

/**
 * AG-12 — the critical guarantee: tool calls from a real LLM flow through the
 * exact same interceptor pipeline as the simulated agent. These tests use the
 * real policy engine + DB (same as the 18 interceptor tests) with calls that
 * resolve immediately (ALLOW / BLOCK) so no human approval is needed.
 */
describe("runToolCallsThroughPipeline", () => {
  it("executes allowed calls and returns their results", async () => {
    const outcomes = await runToolCallsThroughPipeline([
      { name: "get_user", input: { id: realUserId } },
    ]);

    expect(outcomes).toHaveLength(1);
    const o = outcomes[0]!;
    expect(o.status).toBe("allowed");
    expect(o.requestId).toBeTruthy();
    expect(o.result).toBeTruthy();
  });

  it("blocks calls matched by a BLOCK policy with the policy error", async () => {
    const outcomes = await runToolCallsThroughPipeline([
      { name: "drop_table", input: { table: "users" } },
    ]);

    expect(outcomes).toHaveLength(1);
    const o = outcomes[0]!;
    expect(o.status).toBe("blocked");
    expect(o.error?.code).toBe(-32001);
    expect(o.error?.message).toContain("blocked by policy");
  });

  it("handles a mix of allowed and blocked calls in one run", async () => {
    const outcomes = await runToolCallsThroughPipeline([
      { name: "get_user", input: { id: realUserId } },
      { name: "drop_table", input: { table: "orders" } },
      { name: "read_inventory", input: {} },
    ]);

    expect(outcomes.map((o) => o.status)).toEqual(["allowed", "blocked", "allowed"]);
  });

  it("records every call under the live-agent name for auditability", async () => {
    const outcomes = await runToolCallsThroughPipeline([
      { name: "get_user", input: { id: realUserId } },
    ]);

    expect(outcomes).toHaveLength(1);
    const o = outcomes[0]!;
    expect(o.requestId).toBeTruthy();
    // The request row must be visible to the dashboard as agent "live-agent".
    const { prisma } = await import("../db/client.js");
    const row = await prisma.toolCallRequest.findUnique({ where: { id: o.requestId } });
    expect(row?.agentName).toBe("live-agent");
  });
});
