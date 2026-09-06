/**
 * Policy engine types (spec §7).
 * Policies are structured JSON rows evaluated by a plain TS function — no DSL.
 * Engine implementation lands in AG-3 (policy/engine.ts).
 */

export type Condition =
  | { always: true }
  | {
      field: string;
      operator: ">" | "<" | ">=" | "<=" | "==" | "!=";
      value: number | string;
    }
  | { and: Condition[] }
  | { or: Condition[] };

export type PolicyAction = "ALLOW" | "BLOCK" | "REQUIRE_APPROVAL";

/** Shape of a Policy row as stored in the DB (matches Prisma model). */
export interface PolicyRule {
  id: string;
  name: string;
  description?: string | null;
  toolPattern: string;
  condition: Condition;
  action: PolicyAction;
  enabled: boolean;
  priority: number;
}

export interface Decision {
  action: PolicyAction;
  matchedPolicyId?: string | null;
  matchedPolicyName?: string | null;
}