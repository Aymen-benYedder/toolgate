import { Router } from "express";
import { runLiveAgent } from "../agent/liveAgent.js";
import { providerSummary } from "../agent/provider.js";
import { liveAgentLimiter } from "../middleware/rateLimit.js";

/**
 * Live Agent Mode endpoints (spec §11, AG-12):
 *   GET  /api/agent/status — is a provider configured? which one?
 *   POST /api/agent/run    — instruction → LLM tool calls → policy pipeline
 * The run endpoint is rate-limited harder than the demo endpoints because
 * every call costs real API money.
 */
export const agentRouter = Router();

agentRouter.get("/status", (_req, res) => {
  res.json(providerSummary());
});

agentRouter.post("/run", liveAgentLimiter, async (req, res, next) => {
  try {
    const summary = providerSummary();
    if (!summary.available) {
      res.status(503).json({
        error: "live_agent_disabled",
        message: "Live Agent Mode is not enabled — set LLM_API_KEY (OpenAI-compatible) or ANTHROPIC_API_KEY on the server.",
      });
      return;
    }

    const instruction = typeof req.body?.instruction === "string" ? req.body.instruction.trim() : "";
    if (!instruction) {
      res.status(400).json({ error: "bad_request", message: "Missing instruction" });
      return;
    }
    if (instruction.length > 2000) {
      res.status(400).json({ error: "bad_request", message: "Instruction too long (max 2000 chars)" });
      return;
    }

    const result = await runLiveAgent(instruction);
    res.json(result);
  } catch (err) {
    next(err);
  }
});