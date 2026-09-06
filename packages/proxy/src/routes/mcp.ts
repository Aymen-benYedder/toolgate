import { Router } from "express";
import { handleToolCall } from "../mcp/interceptor.js";
import { getTool, listTools } from "../mcp/tools.js";
import { MCP_ERROR_CODES, type McpRequest, type McpResponse } from "../mcp/types.js";

/**
 * Minimal MCP-compatible endpoint (spec §8): accepts JSON-RPC-shaped
 * `tools/list` and `tools/call` requests on POST /mcp.
 *
 * Agent identity + reasoning ride on custom headers so the MCP payload stays
 * spec-clean: `x-agent-name`, `x-agent-reasoning`.
 */
export const mcpRouter = Router();

function error(id: McpRequest["id"] | null, code: number, message: string, data?: unknown): McpResponse {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message, data } };
}

mcpRouter.post("/", async (req, res) => {
  const body = req.body as McpRequest | undefined;

  if (!body || body.jsonrpc !== "2.0" || typeof body.id === "undefined") {
    res.status(400).json(error(null, MCP_ERROR_CODES.INVALID_REQUEST, "Invalid JSON-RPC request"));
    return;
  }

  const { id, method, params } = body;

  try {
    if (method === "tools/list") {
      res.json({ jsonrpc: "2.0", id, result: { tools: listTools() } });
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
            ),
          );
          return;
        case "timeout":
          res.json(error(id, MCP_ERROR_CODES.APPROVAL_TIMEOUT, "Approval timed out after 60s"));
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