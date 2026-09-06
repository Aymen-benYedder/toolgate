import { Router } from "express";

/**
 * Audit log query endpoints (spec §8).
 * Implemented in AG-4 (REST) + AG-9 (AuditLog UI).
 */
export const auditRouter = Router();

auditRouter.get("/", (_req, res) => {
  res.status(501).json({ error: "not_implemented", message: "Audit log endpoint lands in AG-4" });
});