import { Router } from "express";
import { runScenario } from "../demo/scenarios.js";
import { publicMutationLimiter } from "../middleware/rateLimit.js";

/**
 * Demo mode endpoints (spec §9):
 *   POST /api/demo/scenario/:scenarioId — replay a scripted attack scenario
 *   POST /api/demo/reset               — clear + re-seed (lands in AG-11)
 * Rate limiting is in place (spec §12) so the public endpoints can't be abused.
 */
export const demoRouter = Router();

demoRouter.post("/scenario/:scenarioId", publicMutationLimiter, async (req, res, next) => {
  try {
    const scenarioId = req.params.scenarioId;
    if (!scenarioId) {
      res.status(400).json({ error: "bad_request", message: "Missing scenario id" });
      return;
    }
    const result = await runScenario(scenarioId);
    if (!result.triggered) {
      res.status(404).json({ error: "unknown_scenario", message: result.message });
      return;
    }
    res.json(result);
  } catch (err) {
    next(err);
  }
});

demoRouter.post("/reset", publicMutationLimiter, (_req, res) => {
  res.status(501).json({ error: "not_implemented", message: "Demo reset lands in AG-11" });
});