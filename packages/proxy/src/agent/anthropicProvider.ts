/**
 * Anthropic provider (native SDK) — the original spec §11 integration,
 * kept as one adapter among several. Configured via ANTHROPIC_API_KEY
 * and ANTHROPIC_MODEL (default claude-sonnet-4-5).
 */

import Anthropic from "@anthropic-ai/sdk";
import type { LLMCompletion, LLMProvider, ProviderTool } from "./provider.js";

export function createAnthropicProvider(): LLMProvider {
  const apiKey = process.env.ANTHROPIC_API_KEY ?? "";
  const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5";

  const client = new Anthropic({ apiKey });

  return {
    id: "anthropic",
    model,
    async complete(instruction: string, tools: ProviderTool[]): Promise<LLMCompletion> {
      const response = await client.messages.create({
        model: model as Anthropic.Model,
        max_tokens: 1024,
        system:
          "You are a data operations agent for a retail company. You have access to internal tools. " +
          "Use them to fulfill the user's request. Be concise.",
        messages: [{ role: "user", content: instruction }],
        tools: tools.map((t) => ({
          name: t.name,
          description: t.description,
          input_schema: t.inputSchema as Anthropic.Tool.InputSchema,
        })),
      });

      let message: string | null = null;
      const toolCalls: Array<{ name: string; input: Record<string, unknown> }> = [];
      for (const block of response.content) {
        if (block.type === "tool_use") {
          toolCalls.push({ name: block.name, input: block.input as Record<string, unknown> });
        } else if (block.type === "text") {
          message = block.text;
        }
      }

      return { message, toolCalls, model: response.model };
    },
  };
}