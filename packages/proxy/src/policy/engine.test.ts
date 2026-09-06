/**
 * Policy engine unit tests (spec §7: "unit tests for the 5 seed policies
 * against sample inputs").
 */
import { describe, expect, it } from "vitest";
import defaultPolicies from "./defaultPolicies.json" with { type: "json" };
import { evaluateCondition, evaluatePolicy, matchesToolPattern } from "./engine.js";
import type { PolicyRule } from "./types.js";

/** Default policies as engine-ready rules (ids assigned by the DB in prod). */
const policies: PolicyRule[] = (defaultPolicies as unknown as PolicyRule[]).map((p, i) => ({
  ...p,
  id: `seed-${i}`,
}));

function rule(overrides: Partial<PolicyRule> & Pick<PolicyRule, "name" | "toolPattern" | "action">): PolicyRule {
  return {
    id: `${overrides.name}:${overrides.toolPattern}`,
    description: null,
    condition: { always: true },
    enabled: true,
    priority: 0,
    ...overrides,
  };
}

describe("matchesToolPattern", () => {
  it("matches exact names without wildcards", () => {
    expect(matchesToolPattern("get_user", "get_user")).toBe(true);
    expect(matchesToolPattern("get_user", "get_orders")).toBe(false);
  });

  it("supports * prefix/suffix/infix wildcards", () => {
    expect(matchesToolPattern("delete_*", "delete_user_record")).toBe(true);
    expect(matchesToolPattern("delete_*", "drop_table")).toBe(false);
    expect(matchesToolPattern("*_funds", "transfer_funds")).toBe(true);
    expect(matchesToolPattern("get_*", "get_user")).toBe(true);
    expect(matchesToolPattern("get_*", "read_user")).toBe(false);
  });

  it("treats bare * as match-all", () => {
    expect(matchesToolPattern("*", "anything_at_all")).toBe(true);
    expect(matchesToolPattern("*", "")).toBe(true);
  });

  it("handles multiple wildcards", () => {
    expect(matchesToolPattern("a*b*c", "aXbYc")).toBe(true);
    expect(matchesToolPattern("a*b*c", "aXbYcZ")).toBe(false);
  });
});

describe("seed policies (spec §7)", () => {
  it("BLOCKs destructive delete_* calls", () => {
    const d = evaluatePolicy(policies, "delete_user_record", { id: "usr_123" });
    expect(d.action).toBe("BLOCK");
    expect(d.matchedPolicyName).toBe("Block destructive DB operations");
  });

  it("BLOCKs destructive drop_* calls", () => {
    const d = evaluatePolicy(policies, "drop_table", { table: "users" });
    expect(d.action).toBe("BLOCK");
    expect(d.matchedPolicyName).toBe("Block destructive DB operations");
  });

  it("REQUIRE_APPROVAL for large transfers (> $100)", () => {
    const d = evaluatePolicy(policies, "transfer_funds", { from: "A", to: "B", amount: 5000 });
    expect(d.action).toBe("REQUIRE_APPROVAL");
    expect(d.matchedPolicyName).toBe("Approve large transfers");
  });

  it("AUTO-ALLOWs small transfers (<= $100)", () => {
    const d = evaluatePolicy(policies, "transfer_funds", { from: "A", to: "B", amount: 50 });
    expect(d.action).toBe("ALLOW");
    expect(d.matchedPolicyName).toBe("Auto-allow small transfers");
  });

  it("AUTO-ALLOWs benign reads (get_*/read_*/list_*)", () => {
    for (const [tool, input] of [
      ["get_user", { id: "usr_1" }],
      ["list_orders", { userId: "usr_1" }],
      ["read_inventory", { sku: "SKU-1" }],
    ] as const) {
      const d = evaluatePolicy(policies, tool, input);
      expect(d.action).toBe("ALLOW");
      expect(d.matchedPolicyName).toBe("Auto-allow read operations");
    }
  });

  it("REQUIRE_APPROVAL for PII reads — beats read_* ALLOW via priority 1", () => {
    const d = evaluatePolicy(policies, "read_user_pii", { id: "usr_1" });
    expect(d.action).toBe("REQUIRE_APPROVAL");
    expect(d.matchedPolicyName).toBe("Flag sensitive data access");
  });

  it("falls through to the catch-all for unknown tools (fail-safe)", () => {
    const d = evaluatePolicy(policies, "send_email", { to: "x@y.z" });
    expect(d.action).toBe("REQUIRE_APPROVAL");
    expect(d.matchedPolicyName).toBe("Default catch-all");
  });
});

describe("condition evaluation", () => {
  it("supports numeric comparisons", () => {
    const c = { field: "amount", operator: ">", value: 100 } as const;
    expect(evaluateCondition(c, { amount: 101 })).toBe(true);
    expect(evaluateCondition(c, { amount: 100 })).toBe(false);
    expect(evaluateCondition(c, { amount: "101" })).toBe(false); // non-numeric
  });

  it("supports all operators", () => {
    const input = { amount: 100, name: "alice" };
    expect(evaluateCondition({ field: "amount", operator: "<", value: 101 }, input)).toBe(true);
    expect(evaluateCondition({ field: "amount", operator: ">=", value: 100 }, input)).toBe(true);
    expect(evaluateCondition({ field: "amount", operator: "<=", value: 100 }, input)).toBe(true);
    expect(evaluateCondition({ field: "amount", operator: "==", value: 100 }, input)).toBe(true);
    expect(evaluateCondition({ field: "amount", operator: "!=", value: 99 }, input)).toBe(true);
    expect(evaluateCondition({ field: "name", operator: "==", value: "alice" }, input)).toBe(true);
    expect(evaluateCondition({ field: "name", operator: "==", value: "bob" }, input)).toBe(false);
  });

  it("supports and/or composition", () => {
    const input = { amount: 500, vip: "true" };
    expect(
      evaluateCondition(
        { and: [{ field: "amount", operator: ">", value: 100 }, { field: "vip", operator: "==", value: "true" }] },
        input,
      ),
    ).toBe(true);
    expect(
      evaluateCondition(
        { or: [{ field: "amount", operator: ">", value: 1000 }, { field: "vip", operator: "==", value: "false" }] },
        input,
      ),
    ).toBe(false);
  });

  it("resolves dot-paths into nested input", () => {
    const c = { field: "target.table", operator: "==", value: "users" } as const;
    expect(evaluateCondition(c, { target: { table: "users" } })).toBe(true);
    expect(evaluateCondition(c, { target: { table: "orders" } })).toBe(false);
    expect(evaluateCondition(c, {})).toBe(false); // missing path
  });
});

describe("evaluation order", () => {
  it("first matching policy by priority wins", () => {
    const set = [
      rule({ name: "low", toolPattern: "*", action: "ALLOW", priority: 1 }),
      rule({ name: "high", toolPattern: "*", action: "BLOCK", priority: 5 }),
    ];
    expect(evaluatePolicy(set, "anything", {}).action).toBe("ALLOW");
  });

  it("skips disabled policies", () => {
    const set = [
      rule({ name: "disabled", toolPattern: "*", action: "BLOCK", priority: 1, enabled: false }),
      rule({ name: "catch", toolPattern: "*", action: "ALLOW", priority: 2 }),
    ];
    expect(evaluatePolicy(set, "anything", {}).action).toBe("ALLOW");
  });

  it("REQUIRE_APPROVAL with no policies at all (never fail-open)", () => {
    expect(evaluatePolicy([], "anything", {}).action).toBe("REQUIRE_APPROVAL");
  });
});