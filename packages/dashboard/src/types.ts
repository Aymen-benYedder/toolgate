/**
 * Shared domain types for the dashboard — mirror the Prisma schema
 * (packages/proxy/prisma/sqlite/schema.prisma) and the REST response shapes.
 */

export type RequestStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "AUTO_ALLOWED"
  | "AUTO_BLOCKED";

export type PolicyAction = "ALLOW" | "BLOCK" | "REQUIRE_APPROVAL";

export interface Condition {
  always?: true;
  field?: string;
  operator?: ">" | "<" | ">=" | "<=" | "==" | "!=";
  value?: number | string;
  and?: Condition[];
  or?: Condition[];
}

export interface ToolCallRequest {
  id: string;
  agentName: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  status: RequestStatus;
  matchedPolicyId: string | null;
  matchedPolicyName?: string | null;
  decidedBy: string | null;
  reasoning: string | null;
  result: Record<string, unknown> | null;
  createdAt: string;
  decidedAt: string | null;
}

export interface AuditEvent {
  id: string;
  requestId: string;
  event: string;
  detail: Record<string, unknown>;
  createdAt: string;
}

export interface Policy {
  id: string;
  name: string;
  description: string | null;
  toolPattern: string;
  condition: Condition;
  action: PolicyAction;
  enabled: boolean;
  priority: number;
  createdAt: string;
  updatedAt: string;
}

export interface Stats {
  total: number;
  autoAllowed: number;
  autoBlocked: number;
  pending: number;
  approved: number;
  rejected: number;
  autoAllowedPct: number;
  autoBlockedPct: number;
  pendingPct: number;
  avgApprovalMs: number;
}

export interface ScenarioResult {
  scenarioId: string;
  triggered: boolean;
  expected: "BLOCKED" | "PENDING";
  outcome?: string;
  requestId?: string;
  message: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface RequestsResponse {
  requests: ToolCallRequest[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AuditResponse {
  events: AuditEvent[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PoliciesResponse {
  policies: Policy[];
}

export interface DecisionResponse {
  ok: boolean;
  status: RequestStatus;
  late: boolean;
}

/** Live Agent Mode (AG-12) — outcomes of a real LLM run through the pipeline. */
export type AgentCallStatus = "allowed" | "blocked" | "approved" | "rejected" | "timeout" | "error";

export interface AgentCallOutcome {
  toolName: string;
  toolInput: Record<string, unknown>;
  status: AgentCallStatus;
  requestId: string;
  result?: unknown;
  error?: { code: number; message: string };
  reason?: string;
}

export interface LiveAgentResult {
  instruction: string;
  message: string | null;
  calls: AgentCallOutcome[];
  provider: string;
  model: string;
}

export interface AgentStatus {
  available: boolean;
  provider: string | null;
  model: string | null;
}