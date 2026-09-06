import type { RequestHandler } from "express";
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