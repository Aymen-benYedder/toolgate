import { Router } from "express";

/**
 * Dashboard summary stats (spec §8): total requests, % auto-allowed, % blocked,
 * % pending, avg approval time.
 * Implemented in AG-4 (REST) + AG-8 (StatsBar UI).
 */
export const statsRouter = Router();

statsRouter.get("/", (_req, res) => {
  res.status(501).json({ error: "not_implemented", message: "Stats endpoint lands in AG-4" });
});