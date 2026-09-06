import { Router } from "express";

/**
 * Demo mode endpoints (spec §9): scenario replay, reset.
 * Implemented in AG-6 (scenarios) + AG-11 (reset cron, rate limiting).
 */
export const demoRouter = Router();

demoRouter.post("/scenario/:scenarioId", (_req, res) => {
  res.status(501).json({ error: "not_implemented", message: "Scenario replay lands in AG-6" });
});

demoRouter.post("/reset", (_req, res) => {
  res.status(501).json({ error: "not_implemented", message: "Demo reset lands in AG-11" });
});