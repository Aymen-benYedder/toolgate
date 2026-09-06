import bcrypt from "bcryptjs";
import { Router } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../db/client.js";

/**
 * Admin auth (spec §8): POST /api/auth/login → JWT.
 * Minimal single-admin setup — no OAuth, no multi-tenant (spec §4).
 */
export const authRouter = Router();

authRouter.post("/login", async (req, res, next) => {
  try {
    const { email, password } = (req.body ?? {}) as { email?: unknown; password?: unknown };
    if (typeof email !== "string" || typeof password !== "string") {
      res.status(400).json({ error: "invalid_request", message: "email and password are required" });
      return;
    }

    const admin = await prisma.adminUser.findUnique({ where: { email } });
    if (!admin || !(await bcrypt.compare(password, admin.passwordHash))) {
      res.status(401).json({ error: "invalid_credentials", message: "Invalid email or password" });
      return;
    }

    const token = jwt.sign(
      { sub: admin.id, email: admin.email },
      process.env.JWT_SECRET ?? "replace-me",
      { expiresIn: "12h" },
    );
    res.json({ token, email: admin.email });
  } catch (err) {
    next(err);
  }
});