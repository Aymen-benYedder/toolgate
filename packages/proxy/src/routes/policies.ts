import { Router } from "express";

/**
 * Policy CRUD endpoints (spec §8).
 * Implemented in AG-4 (REST) + AG-10 (PolicyEditor UI).
 */
export const policiesRouter = Router();

policiesRouter.get("/", (_req, res) => {
  res.status(501).json({ error: "not_implemented", message: "Policy list endpoint lands in AG-4" });
});

policiesRouter.post("/", (_req, res) => {
  res.status(501).json({ error: "not_implemented", message: "Policy create endpoint lands in AG-4" });
});

policiesRouter.patch("/:id", (_req, res) => {
  res.status(501).json({ error: "not_implemented", message: "Policy update endpoint lands in AG-4" });
});

policiesRouter.delete("/:id", (_req, res) => {
  res.status(501).json({ error: "not_implemented", message: "Policy delete endpoint lands in AG-4" });
});