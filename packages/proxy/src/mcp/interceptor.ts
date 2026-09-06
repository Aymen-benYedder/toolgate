/**
 * Core tool-call interception logic (spec §8).
 *
 * Flow for every tool call:
 *   1. Create ToolCallRequest row (status PENDING) + audit REQUEST_RECEIVED
 *   2. Run the policy engine → decision + audit POLICY_EVALUATED
 *   3. ALLOW  → execute against the mock DB, status AUTO_ALLOWED, audit EXECUTED
 *   4. BLOCK  → status AUTO_BLOCKED, audit BLOCKED, MCP error to the agent
 *   5. REQUIRE_APPROVAL → keep PENDING, emit new_pending_request, hold the
 *      caller up to 60s for a human decision; auto-reject on timeout.
 *
 * Approve/Reject (from the dashboard REST endpoints) resolve the held call
 * through the in-memory pending registry. Late decisions (after timeout) are
 * recorded to the audit log but never executed.
 */

import type { Prisma } from "@prisma/client";
import type { Server as SocketServer } from "socket.io";
import { prisma } from "../db/client.js";
import { evaluatePolicy } from "../policy/engine.js";
import type { Condition, PolicyAction, PolicyRule } from "../policy/types.js";
import { emitNewPendingRequest, emitRequestUpdated } from "../realtime/socket.js";
import { getTool } from "./tools.js";
import { MCP_ERROR_CODES } from "./types.js";

export const APPROVAL_TIMEOUT_MS = 60_000;

export interface ToolCallContext {
  agentName: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  reasoning?: string;
}

export type ToolCallOutcome =
  | { outcome: "allowed"; requestId: string; result: unknown }
  | {
      outcome: "blocked";
      requestId: string;
      error: { code: number; message: string; data?: unknown };
    }
  | { outcome: "approved"; requestId: string; result: unknown }
  | { outcome: "rejected"; requestId: string; reason?: string }
  | { outcome: "timeout"; requestId: string };

interface PendingEntry {
  resolve: (outcome: ToolCallOutcome) => void;
  timer: NodeJS.Timeout;
}

/** Requests currently held open waiting for a human decision. */
const pending = new Map<string, PendingEntry>();

let io: SocketServer | null = null;

/** Wire the Socket.IO server so the interceptor can push events. */
export function setRealtime(server: SocketServer): void {
  io = server;
}

async function logAudit(requestId: string, event: string, detail: Record<string, unknown>): Promise<void> {
  await prisma.auditLog.create({
    data: { requestId, event, detail: detail as Prisma.InputJsonValue },
  });
}

async function loadPolicies(): Promise<PolicyRule[]> {
  const rows = await prisma.policy.findMany();
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    toolPattern: r.toolPattern,
    condition: r.condition as Condition,
    action: r.action as PolicyAction,
    enabled: r.enabled,
    priority: r.priority,
  }));
}

function executeTool(toolName: string, toolInput: Record<string, unknown>): unknown {
  const tool = getTool(toolName);
  if (!tool) throw new Error(`Unknown tool: ${toolName}`);
  return tool.execute(toolInput);
}

/**
 * Intercept a tool call: evaluate, execute/block/queue, and return the outcome.
 * For REQUIRE_APPROVAL this resolves only when a human decides or the 60s
 * timeout fires — the caller (POST /mcp) holds the response open meanwhile.
 */
export async function handleToolCall(ctx: ToolCallContext): Promise<ToolCallOutcome> {
  const { agentName, toolName, toolInput, reasoning } = ctx;

  // 1. Record the request (PENDING initially) + REQUEST_RECEIVED audit event.
  const request = await prisma.toolCallRequest.create({
    data: {
      agentName,
      toolName,
      toolInput: toolInput as Prisma.InputJsonValue,
      status: "PENDING",
      reasoning: reasoning ?? null,
    },
  });
  await logAudit(request.id, "REQUEST_RECEIVED", {
    agentName,
    toolName,
    toolInput,
    reasoning: reasoning ?? null,
  });

  // 2. Evaluate against the policy set.
  const policies = await loadPolicies();
  const decision = evaluatePolicy(policies, toolName, toolInput);
  await logAudit(request.id, "POLICY_EVALUATED", {
    matchedPolicy: decision.matchedPolicyName ?? null,
    matchedPolicyId: decision.matchedPolicyId ?? null,
    action: decision.action,
  });

  // 3. ALLOW — execute immediately.
  if (decision.action === "ALLOW") {
    const result = executeTool(toolName, toolInput);
    const updated = await prisma.toolCallRequest.update({
      where: { id: request.id },
      data: {
        status: "AUTO_ALLOWED",
        matchedPolicyId: decision.matchedPolicyId ?? null,
        decidedBy: "system",
        decidedAt: new Date(),
        result: result as Prisma.InputJsonValue,
      },
    });
    await logAudit(request.id, "EXECUTED", { result });
    emitRequestUpdated(io!, updated);
    return { outcome: "allowed", requestId: request.id, result };
  }

  // 4. BLOCK — refuse and explain which policy caused it.
  if (decision.action === "BLOCK") {
    const updated = await prisma.toolCallRequest.update({
      where: { id: request.id },
      data: {
        status: "AUTO_BLOCKED",
        matchedPolicyId: decision.matchedPolicyId ?? null,
        decidedBy: "system",
        decidedAt: new Date(),
      },
    });
    await logAudit(request.id, "BLOCKED", {
      policy: decision.matchedPolicyName ?? null,
      reason: "Blocked by policy",
    });
    emitRequestUpdated(io!, updated);
    return {
      outcome: "blocked",
      requestId: request.id,
      error: {
        code: MCP_ERROR_CODES.TOOL_BLOCKED,
        message: `Tool call '${toolName}' was blocked by policy '${decision.matchedPolicyName ?? "Default catch-all"}'`,
        data: {
          matchedPolicyId: decision.matchedPolicyId,
          matchedPolicyName: decision.matchedPolicyName,
        },
      },
    };
  }

  // 5. REQUIRE_APPROVAL — queue for a human, hold the caller up to 60s.
  await prisma.toolCallRequest.update({
    where: { id: request.id },
    data: { matchedPolicyId: decision.matchedPolicyId ?? null },
  });
  const pendingRow = await prisma.toolCallRequest.findUniqueOrThrow({ where: { id: request.id } });
  emitNewPendingRequest(io!, pendingRow);

  return new Promise<ToolCallOutcome>((resolve) => {
    const timer = setTimeout(async () => {
      pending.delete(request.id);
      const updated = await prisma.toolCallRequest.update({
        where: { id: request.id },
        data: { status: "REJECTED", decidedBy: "system", decidedAt: new Date() },
      });
      await logAudit(request.id, "REJECTED", {
        decidedBy: "system",
        reason: "Approval timeout (60s)",
      });
      emitRequestUpdated(io!, updated);
      resolve({ outcome: "timeout", requestId: request.id });
    }, APPROVAL_TIMEOUT_MS);

    pending.set(request.id, { resolve, timer });
  });
}

/**
 * Approve a pending request: execute the tool, record APPROVED + EXECUTED,
 * and resolve the held caller. Late decisions (request already resolved by
 * timeout) are recorded for audit only — never executed.
 */
export async function approvePendingRequest(
  requestId: string,
  decidedBy: string,
): Promise<{ ok: boolean; status?: string; late?: boolean }> {
  const request = await prisma.toolCallRequest.findUnique({ where: { id: requestId } });
  if (!request) return { ok: false };

  const entry = pending.get(requestId);

  if (request.status !== "PENDING") {
    await logAudit(requestId, "APPROVED", {
      decidedBy,
      late: true,
      note: "Request already resolved (timeout); late decision recorded for audit only",
    });
    return { ok: true, status: request.status, late: true };
  }

  const result = executeTool(request.toolName, request.toolInput as Record<string, unknown>);
  const updated = await prisma.toolCallRequest.update({
    where: { id: requestId },
    data: {
      status: "APPROVED",
      decidedBy,
      decidedAt: new Date(),
      result: result as Prisma.InputJsonValue,
    },
  });
  await logAudit(requestId, "APPROVED", { decidedBy });
  await logAudit(requestId, "EXECUTED", { result });

  if (entry) {
    clearTimeout(entry.timer);
    pending.delete(requestId);
    entry.resolve({ outcome: "approved", requestId, result });
  }
  emitRequestUpdated(io!, updated);
  return { ok: true, status: "APPROVED" };
}

/**
 * Reject a pending request: record REJECTED and resolve the held caller.
 * Late decisions are recorded for audit only.
 */
export async function rejectPendingRequest(
  requestId: string,
  decidedBy: string,
  reason?: string,
): Promise<{ ok: boolean; status?: string; late?: boolean }> {
  const request = await prisma.toolCallRequest.findUnique({ where: { id: requestId } });
  if (!request) return { ok: false };

  const entry = pending.get(requestId);

  if (request.status !== "PENDING") {
    await logAudit(requestId, "REJECTED", {
      decidedBy,
      late: true,
      reason: reason ?? null,
      note: "Request already resolved (timeout); late decision recorded for audit only",
    });
    return { ok: true, status: request.status, late: true };
  }

  const updated = await prisma.toolCallRequest.update({
    where: { id: requestId },
    data: { status: "REJECTED", decidedBy, decidedAt: new Date() },
  });
  await logAudit(requestId, "REJECTED", { decidedBy, reason: reason ?? null });

  if (entry) {
    clearTimeout(entry.timer);
    pending.delete(requestId);
    entry.resolve({ outcome: "rejected", requestId, reason });
  }
  emitRequestUpdated(io!, updated);
  return { ok: true, status: "REJECTED" };
}