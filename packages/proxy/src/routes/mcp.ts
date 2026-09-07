import { Router } from "express";
import { handleToolCall, loadPolicies } from "../mcp/interceptor.js";
import { getTool, listTools } from "../mcp/tools.js";
import { MCP_ERROR_CODES, type McpRequest, type McpResponse } from "../mcp/types.js";
import { matchesToolPattern } from "../policy/engine.js";
import { mcpLimiter } from "../middleware/rateLimit.js";

/**
 * Minimal MCP-compatible endpoint (spec §8): accepts JSON-RPC-shaped
 * `tools/list` and `tools/call` requests on POST /mcp.
 *
 * Agent identity + reasoning ride on custom headers so the MCP payload stays
 * spec-clean: `x-agent-name`, `x-agent-reasoning`.
 *
 * Hardening (friend review): tools/list is policy-aware — tools matched by an
 * enabled BLOCK policy with an `always` condition are removed from the agent's
 * surface so it stops attempting them. Refusals carry actionable codes.
 */
export const mcpRouter = Router();

function error(id: McpRequest["id"] | null, code: number, message: string, data?: unknown): McpResponse {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message, data } };
}

/** Tools an enabled BLOCK policy with an `always` condition removes from the surface. */
async function blockedToolPatterns(): Promise<string[]> {
  const policies = await loadPolicies();
  return policies
    .filter(
      (p) =>
        p.enabled &&
        p.action === "BLOCK" &&
        "always" in p.condition &&
        p.condition.always === true,
    )
    .map((p) => p.toolPattern);
}

mcpRouter.post("/", mcpLimiter, async (req, res) => {
  const body = req.body as McpRequest | undefined;

  if (!body || body.jsonrpc !== "2.0" || typeof body.id === "undefined") {
    res.status(400).json(error(null, MCP_ERROR_CODES.INVALID_REQUEST, "Invalid JSON-RPC request"));
    return;
  }

  const { id, method, params } = body;

  try {
    if (method === "tools/list") {
      const blocked = await blockedToolPatterns();
      const tools = listTools().filter(
        (t) => !blocked.some((pattern) => matchesToolPattern(pattern, t.name)),
      );
      res.json({ jsonrpc: "2.0", id, result: { tools } });
      return;
    }

    if (method === "tools/call") {
      const p = (params ?? {}) as { name?: string; arguments?: Record<string, unknown> };
      if (!p.name) {
        res.json(error(id, MCP_ERROR_CODES.INVALID_PARAMS, "Missing tool name"));
        return;
      }
      if (!getTool(p.name)) {
        res.json(error(id, MCP_ERROR_CODES.METHOD_NOT_FOUND, `Unknown tool: ${p.name}`));
        return;
      }

      const outcome = await handleToolCall({
        agentName: (req.headers["x-agent-name"] as string) ?? "unknown-agent",
        toolName: p.name,
        toolInput: p.arguments ?? {},
        reasoning: (req.headers["x-agent-reasoning"] as string) ?? undefined,
      });

      switch (outcome.outcome) {
        case "allowed":
        case "approved":
          res.json({
            jsonrpc: "2.0",
            id,
            result: { content: [{ type: "text", text: JSON.stringify(outcome.result) }], isError: false },
          });
          return;
        case "blocked":
          res.json(error(id, outcome.error.code, outcome.error.message, outcome.error.data));
          return;
        case "rejected":
          res.json(
            error(
              id,
              MCP_ERROR_CODES.INVALID_REQUEST,
              `Tool call rejected${outcome.reason ? `: ${outcome.reason}` : ""}`,
              {
                code: "rejected_by_human",
                retryable: false,
                actionable: "A human rejected this call. Do not retry without new information.",
                reason: outcome.reason ?? null,
              },
            ),
          );
          return;
        case "timeout":
          res.json(
            error(id, MCP_ERROR_CODES.APPROVAL_TIMEOUT, "Approval timed out after 60s", {
              code: "approval_timeout",
              retryable: false,
              actionable: "Approval timed out. Re-submit only if the user explicitly asks.",
              expectedWaitMs: outcome.expectedWaitMs,
            }),
          );
          return;
      }
      return;
    }

    res.json(error(id, MCP_ERROR_CODES.METHOD_NOT_FOUND, `Method not found: ${method}`));
  } catch (err) {
    console.error("[mcp] internal error:", err);
    res.json(error(id, MCP_ERROR_CODES.INTERNAL_ERROR, "Internal error"));
  }
});