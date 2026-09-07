/**
 * Provider abstraction for Live Agent Mode (spec §11, AG-12).
 *
 * The policy/interception pipeline is provider-agnostic: any LLM that can
 * emit tool calls can drive it. Two adapters ship out of the box:
 *
 *   - OpenAI-compatible (raw fetch): OpenAI, OpenRouter, Groq, DeepSeek,
 *     Mistral, Ollama, LM Studio, vLLM, ... — configured via
 *     LLM_API_KEY / LLM_BASE_URL / LLM_MODEL
 *   - Anthropic (native SDK): configured via ANTHROPIC_API_KEY / ANTHROPIC_MODEL
 *
 * Selection: LLM_PROVIDER=openai|anthropic, defaulting to auto-detect by
 * whichever key is present. If neither is set, Live Agent Mode is disabled
 * and the dashboard shows the feature as unavailable (never required for the
 * base demo).
 */

import type { ToolDefinition } from "../mcp/tools.js";

export interface AgentToolCall {
  name: string;
  input: Record<string, unknown>;
}

/** A tool as handed to the LLM — name + schema (ToolDefinition has no name; it lives in the registry key). */
export interface ProviderTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface LLMCompletion {
  /** Free-text reply from the model (null if it only made tool calls). */
  message: string | null;
  /** Tool calls the model decided to make, in order. */
  toolCalls: AgentToolCall[];
  /** Model identifier actually used (for display). */
  model: string;
}

export interface LLMProvider {
  readonly id: string;
  readonly model: string;
  complete(instruction: string, tools: ProviderTool[]): Promise<LLMCompletion>;
}

/** Normalize the tool registry into the provider's named tool shape. */
export function toProviderTools(tools: Record<string, ToolDefinition>): ProviderTool[] {
  return Object.entries(tools).map(([name, def]) => ({
    name,
    description: def.description,
    inputSchema: def.inputSchema,
  }));
}

export function isLiveAgentEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.LLM_API_KEY);
}

export async function resolveProvider(): Promise<LLMProvider | null> {
  const explicit = (process.env.LLM_PROVIDER ?? "").trim().toLowerCase();

  if (explicit === "anthropic" || (!explicit && process.env.ANTHROPIC_API_KEY)) {
    // Lazy import keeps the Anthropic SDK out of the hot path when unused.
    const mod = await import("./anthropicProvider.js");
    return mod.createAnthropicProvider();
  }
  if (explicit === "openai" || (!explicit && process.env.LLM_API_KEY)) {
    const mod = await import("./openaiCompatibleProvider.js");
    return mod.createOpenAICompatibleProvider();
  }
  return null;
}

/** Human-readable provider/model summary for the dashboard status endpoint. */
export function providerSummary(): { available: boolean; provider: string | null; model: string | null } {
  const explicit = (process.env.LLM_PROVIDER ?? "").trim().toLowerCase();
  if (explicit === "anthropic" || (!explicit && process.env.ANTHROPIC_API_KEY)) {
    return {
      available: true,
      provider: "anthropic",
      model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5",
    };
  }
  if (explicit === "openai" || (!explicit && process.env.LLM_API_KEY)) {
    return {
      available: true,
      provider: "openai-compatible",
      model: process.env.LLM_MODEL ?? "gpt-4o-mini",
    };
  }
  return { available: false, provider: null, model: null };
}