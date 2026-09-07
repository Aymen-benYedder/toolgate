/**
 * Live Agent Mode orchestrator (spec §11, AG-12).
 *
 * A real LLM (any provider) receives a natural-language instruction plus the
 * mock DB's tool schemas, decides which tools to call, and those calls flow
 * through the EXACT same interceptor pipeline as the simulated agent —
 * policy evaluation, audit trail, socket events, and human approval for
 * REQUIRE_APPROVAL calls. This is the "genuinely real" proof point.
 *
 * Pending calls hold the run open until a human approves/rejects (or the
 * 60s approval timeout fires) — the dashboard shows the agent waiting.
 */

import { handleToolCall } from "../mcp/interceptor.js";
import { TOOLS } from "../mcp/tools.js";
import { resolveProvider, toProviderTools } from "./provider.js";
import type { AgentToolCall } from "./provider.js";

export const LIVE_AGENT_NAME = "live-agent";

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

/**
 * Run tool calls through the interceptor pipeline. Exported separately so
 * tests can exercise the pipeline without an LLM round-trip.
 */
export async function runToolCallsThroughPipeline(calls: AgentToolCall[]): Promise<AgentCallOutcome[]> {
  const settled = await Promise.allSettled(
    calls.map((call) =>
      handleToolCall({
        agentName: LIVE_AGENT_NAME,
        toolName: call.name,
        toolInput: call.input,
        reasoning: "Live agent tool call",
      }),
    ),
  );

  return settled.map((s, i): AgentCallOutcome => {
    const call = calls[i]!;
    if (s.status === "rejected") {
      return {
        toolName: call.name,
        toolInput: call.input,
        status: "error",
        requestId: "",
        error: { code: -32603, message: String(s.reason) },
      };
    }
    const o = s.value;
    switch (o.outcome) {
      case "allowed":
        return { toolName: call.name, toolInput: call.input, status: "allowed", requestId: o.requestId, result: o.result };
      case "blocked":
        return { toolName: call.name, toolInput: call.input, status: "blocked", requestId: o.requestId, error: o.error };
      case "approved":
        return { toolName: call.name, toolInput: call.input, status: "approved", requestId: o.requestId, result: o.result };
      case "rejected":
        return { toolName: call.name, toolInput: call.input, status: "rejected", requestId: o.requestId, reason: o.reason };
      case "timeout":
        return { toolName: call.name, toolInput: call.input, status: "timeout", requestId: o.requestId };
    }
  });
}

export interface LiveAgentResult {
  instruction: string;
  message: string | null;
  calls: AgentCallOutcome[];
  provider: string;
  model: string;
}

export async function runLiveAgent(instruction: string): Promise<LiveAgentResult> {
  const provider = await resolveProvider();
  if (!provider) {
    throw new Error("Live Agent Mode is not enabled (set LLM_API_KEY or ANTHROPIC_API_KEY)");
  }

  const completion = await provider.complete(instruction, toProviderTools(TOOLS));
  const calls = completion.toolCalls.length > 0 ? await runToolCallsThroughPipeline(completion.toolCalls) : [];

  return {
    instruction,
    message: completion.message,
    calls,
    provider: provider.id,
    model: completion.model,
  };
}