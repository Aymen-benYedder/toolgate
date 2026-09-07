/**
 * OpenAI-compatible chat completions provider (raw fetch — no SDK needed).
 *
 * Works with any endpoint that speaks the OpenAI wire format:
 * OpenAI, OpenRouter, Groq, DeepSeek, Mistral, Together, Ollama,
 * LM Studio, vLLM, ... Set LLM_BASE_URL to the provider's /v1 root.
 */

import type { LLMCompletion, LLMProvider, ProviderTool } from "./provider.js";

interface ChatTool {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

interface ChatResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
      tool_calls?: Array<{
        id?: string;
        type?: string;
        function?: { name?: string; arguments?: string };
      }>;
    };
  }>;
  model?: string;
  error?: { message?: string };
}

export function createOpenAICompatibleProvider(): LLMProvider {
  const apiKey = process.env.LLM_API_KEY ?? "";
  const baseUrl = (process.env.LLM_BASE_URL ?? "https://api.openai.com/v1").replace(/\/+$/, "");
  const model = process.env.LLM_MODEL ?? "gpt-4o-mini";

  return {
    id: "openai-compatible",
    model,
    async complete(instruction: string, tools: ProviderTool[]): Promise<LLMCompletion> {
      const chatTools: ChatTool[] = tools.map((t) => ({
        type: "function",
        function: { name: t.name, description: t.description, parameters: t.inputSchema },
      }));

      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: instruction }],
          tools: chatTools,
          tool_choice: "auto",
          max_tokens: 1024,
        }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`LLM request failed (${res.status}): ${text.slice(0, 300)}`);
      }

      const data = (await res.json()) as ChatResponse;
      if (data.error?.message) throw new Error(`LLM error: ${data.error.message}`);

      const message = data.choices?.[0]?.message;
      const toolCalls = (message?.tool_calls ?? [])
        .filter((tc) => tc.function?.name)
        .map((tc) => {
          let input: Record<string, unknown> = {};
          try {
            input = tc.function?.arguments ? (JSON.parse(tc.function.arguments) as Record<string, unknown>) : {};
          } catch {
            input = {};
          }
          return { name: tc.function!.name!, input };
        });

      return {
        message: message?.content ?? null,
        toolCalls,
        model: data.model ?? model,
      };
    },
  };
}