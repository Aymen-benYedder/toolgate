import { Router } from "express";
import { publicMutationLimiter } from "../middleware/rateLimit.js";

/**
 * Demo mode endpoints (spec §9): scenario replay, reset.
 * Implemented in AG-6 (scenarios) + AG-11 (reset cron, rate limiting).
 * Rate limiting is already in place (spec §12) so the public endpoints
 * can't be abused before the handlers land.
 */
export const demoRouter = Router();

demoRouter.post("/scenario/:scenarioId", publicMutationLimiter, (_req, res) => {
  res.status(501).json({ error: "not_implemented", message: "Scenario replay lands in AG-6" });
});

demoRouter.post("/reset", publicMutationLimiter, (_req, res) => {
  res.status(501).json({ error: "not_implemented", message: "Demo reset lands in AG-11" });
});