import rateLimit from "express-rate-limit";

/**
 * Rate limiting for public mutation endpoints (spec §12):
 * "Rate-limit the public /api/demo/scenario/:id and approve/reject endpoints
 * (e.g. 20 requests/min per IP) to prevent abuse via express-rate-limit."
 *
 * /mcp gets a slightly higher budget so the demo generator (fires every
 * 4-8s ≈ 8-15/min from localhost) never trips it.
 */

const jsonMessage = { error: "rate_limited", message: "Too many requests — please slow down" };

export const publicMutationLimiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: jsonMessage,
});

export const mcpLimiter = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: jsonMessage,
});

/**
 * Live Agent runs cost real API money per call, so the public endpoint gets
 * a much tighter budget than the free demo endpoints (AG-12).
 */
export const liveAgentLimiter = rateLimit({
  windowMs: 60_000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: jsonMessage,
});