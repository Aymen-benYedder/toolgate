import { Router } from "express";

/**
 * Tool-call request endpoints (spec §8).
 * Implemented in AG-4: pending list, approve, reject, paginated history.
 */
export const requestsRouter = Router();

requestsRouter.get("/pending", (_req, res) => {
  res.status(501).json({ error: "not_implemented", message: "Pending requests endpoint lands in AG-4" });
});

requestsRouter.post("/:id/approve", (_req, res) => {
  res.status(501).json({ error: "not_implemented", message: "Approve endpoint lands in AG-4" });
});

requestsRouter.post("/:id/reject", (_req, res) => {
  res.status(501).json({ error: "not_implemented", message: "Reject endpoint lands in AG-4" });
});

requestsRouter.get("/", (_req, res) => {
  res.status(501).json({ error: "not_implemented", message: "Request history endpoint lands in AG-4" });
});