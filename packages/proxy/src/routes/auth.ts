import { Router } from "express";

/**
 * Admin auth endpoints (spec §8).
 * Implemented in AG-4 (login) + AG-10 (PolicyEditor auth gate).
 */
export const authRouter = Router();

authRouter.post("/login", (_req, res) => {
  res.status(501).json({ error: "not_implemented", message: "Login endpoint lands in AG-4" });
});