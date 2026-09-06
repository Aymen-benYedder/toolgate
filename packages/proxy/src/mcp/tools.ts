/**
 * Tool registry — the mock company DB's tools, exposed to agents via MCP
 * (tools/list + tools/call) and executed by the interceptor.
 *
 * Spec §9.1: the sandboxed fake DB is the only thing demo-mode tool calls
 * ever touch. Real downstream tools are out of scope for the demo.
 */

import { getMockDb } from "../demo/mockDb.js";
import type { McpTool } from "./types.js";

export interface ToolDefinition {
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => unknown;
}

const db = getMockDb();

export const TOOLS: Record<string, ToolDefinition> = {
  get_user: {
    description: "Look up a user by id (non-sensitive fields).",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
    execute: (args) => db.getUser(String(args.id)),
  },
  list_orders: {
    description: "List orders, optionally filtered by userId.",
    inputSchema: {
      type: "object",
      properties: { userId: { type: "string" } },
    },
    execute: (args) => db.listOrders(args.userId ? String(args.userId) : undefined),
  },
  read_inventory: {
    description: "Read inventory items, optionally filtered by sku.",
    inputSchema: {
      type: "object",
      properties: { sku: { type: "string" } },
    },
    execute: (args) => db.readInventory(args.sku ? String(args.sku) : undefined),
  },
  read_user_pii: {
    description: "Read a user's full record including PII (email, phone).",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
    execute: (args) => db.readUserPii(String(args.id)),
  },
  transfer_funds: {
    description: "Transfer funds between accounts.",
    inputSchema: {
      type: "object",
      properties: {
        from: { type: "string" },
        to: { type: "string" },
        amount: { type: "number" },
      },
      required: ["from", "to", "amount"],
    },
    execute: (args) => db.transferFunds(String(args.from), String(args.to), Number(args.amount)),
  },
  delete_user_record: {
    description: "Delete a user record permanently.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
    execute: (args) => db.deleteUserRecord(String(args.id)),
  },
  drop_table: {
    description: "Drop (empty) a database table.",
    inputSchema: {
      type: "object",
      properties: { table: { type: "string" } },
      required: ["table"],
    },
    execute: (args) => db.dropTable(String(args.table)),
  },
};

export function listTools(): McpTool[] {
  return Object.entries(TOOLS).map(([name, def]) => ({
    name,
    description: def.description,
    inputSchema: def.inputSchema,
  }));
}

export function getTool(name: string): ToolDefinition | undefined {
  return TOOLS[name];
}