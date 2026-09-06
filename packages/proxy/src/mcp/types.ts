/**
 * Minimal MCP-shaped JSON-RPC types (per MCP spec) used by the proxy's /mcp endpoint.
 * Full interception logic lands in AG-4 (mcp/interceptor.ts).
 */

export interface McpRequest {
  jsonrpc: "2.0";
  id: number | string;
  method: string;
  params?: unknown;
}

export interface McpToolCallParams {
  name: string;
  arguments?: Record<string, unknown>;
}

export interface McpTool {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

export interface McpResponse {
  jsonrpc: "2.0";
  id: number | string | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export const MCP_ERROR_CODES = {
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  /** Tool call blocked by policy — AgentGate-specific extension. */
  TOOL_BLOCKED: -32001,
  /** Tool call pending human approval and timed out. */
  APPROVAL_TIMEOUT: -32002,
} as const;