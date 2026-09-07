import type { Request, RequestHandler, Response } from "express";
import jwt from "jsonwebtoken";

/**
 * JWT auth guard for admin-only endpoints (policy mutations).
 * The dashboard is publicly viewable in demo mode; only policy editing
 * requires a login (spec §4 auth row, §10.3).
 */
export const requireAuth: RequestHandler = (req, res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "unauthorized", message: "Missing bearer token" });
    return;
  }
  try {
    const payload = jwt.verify(header.slice(7), process.env.JWT_SECRET ?? "replace-me");
    (req as { admin?: unknown }).admin = payload;
    next();
  } catch {
    res.status(401).json({ error: "unauthorized", message: "Invalid or expired token" });
  }
};

/**
 * Resolve who decided a request (spec §8 decidedBy: "system" | "admin" | id).
 * - Valid Bearer token → the admin's email (audit can't be spoofed)
 * - DEMO_MODE=true (no-login interactivity, spec §9.4) → body.decidedBy or
 *   "guest-visitor"
 * - Otherwise → 401 (approve/reject require auth outside demo mode)
 */
export function resolveDecidedBy(req: Request, res: Response): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    try {
      const payload = jwt.verify(header.slice(7), process.env.JWT_SECRET ?? "replace-me") as {
        email?: string;
      };
      return payload.email ?? "admin";
    } catch {
      res.status(401).json({ error: "unauthorized", message: "Invalid or expired token" });
      return null;
    }
  }
  if (process.env.DEMO_MODE === "true") {
    return (req.body?.decidedBy as string | undefined) ?? "guest-visitor";
  }
  res.status(401).json({ error: "unauthorized", message: "Authentication required (demo mode is off)" });
  return null;
}