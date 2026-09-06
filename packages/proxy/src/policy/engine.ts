/**
 * Policy engine (spec §7).
 *
 * Policies are structured JSON rows evaluated by a plain TypeScript function —
 * no DSL, no parser, no regex exposed to users. First matching enabled policy
 * by priority (ascending) wins. If nothing matches, the default action is
 * REQUIRE_APPROVAL (fail-safe — never fail-open).
 */

import type { ComparisonOperator, Condition, Decision, PolicyRule } from "./types.js";

/**
 * Simple glob matcher — supports the `*` wildcard only (case-sensitive).
 * Iterative two-pointer match, no regex involved.
 */
export function matchesToolPattern(pattern: string, toolName: string): boolean {
  let p = 0;
  let s = 0;
  let starIdx = -1;
  let matchIdx = 0;

  while (s < toolName.length) {
    if (p < pattern.length && pattern[p] === toolName[s]) {
      p++;
      s++;
    } else if (p < pattern.length && pattern[p] === "*") {
      starIdx = p++;
      matchIdx = s;
    } else if (starIdx !== -1) {
      p = starIdx + 1;
      s = ++matchIdx;
    } else {
      return false;
    }
  }

  while (p < pattern.length && pattern[p] === "*") p++;
  return p === pattern.length;
}

/** Resolve a dot-path into a nested object (e.g. "target.table"). */
function getField(obj: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc === null || acc === undefined) return undefined;
    if (typeof acc !== "object") return undefined;
    return (acc as Record<string, unknown>)[key];
  }, obj);
}

function compareValues(
  actual: unknown,
  operator: ComparisonOperator,
  expected: number | string,
): boolean {
  switch (operator) {
    case ">":
      return typeof actual === "number" && typeof expected === "number" && actual > expected;
    case "<":
      return typeof actual === "number" && typeof expected === "number" && actual < expected;
    case ">=":
      return typeof actual === "number" && typeof expected === "number" && actual >= expected;
    case "<=":
      return typeof actual === "number" && typeof expected === "number" && actual <= expected;
    case "==":
      return typeof expected === "number" ? actual === expected : String(actual) === expected;
    case "!=":
      return typeof expected === "number" ? actual !== expected : String(actual) !== expected;
    default:
      return false;
  }
}

/** Evaluate a condition against a tool input object. */
export function evaluateCondition(condition: Condition, toolInput: Record<string, unknown>): boolean {
  if ("always" in condition) return condition.always === true;
  if ("and" in condition) return condition.and.every((c) => evaluateCondition(c, toolInput));
  if ("or" in condition) return condition.or.some((c) => evaluateCondition(c, toolInput));
  const actual = getField(toolInput, condition.field);
  return compareValues(actual, condition.operator, condition.value);
}

/**
 * Evaluate a tool call against the policy set.
 * Returns the first matching enabled policy's decision, or REQUIRE_APPROVAL
 * when nothing matches (fail-safe).
 */
export function evaluatePolicy(
  policies: PolicyRule[],
  toolName: string,
  toolInput: Record<string, unknown>,
): Decision {
  const sorted = [...policies]
    .filter((p) => p.enabled)
    .sort((a, b) => a.priority - b.priority);

  for (const policy of sorted) {
    if (
      matchesToolPattern(policy.toolPattern, toolName) &&
      evaluateCondition(policy.condition, toolInput)
    ) {
      return {
        action: policy.action,
        matchedPolicyId: policy.id,
        matchedPolicyName: policy.name,
      };
    }
  }

  return { action: "REQUIRE_APPROVAL" };
}