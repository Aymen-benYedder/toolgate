import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import type { Condition } from "../policy/types.js";

/**
 * Policy CRUD endpoints (spec §8). Reads are public; mutations require a
 * valid admin JWT (PolicyEditor is the only screen behind auth, §10.3).
 */

const conditionSchema: z.ZodType<Condition> = z.lazy(() =>
  z.union([
    z.object({ always: z.literal(true) }),
    z.object({
      field: z.string(),
      operator: z.enum([">", "<", ">=", "<=", "==", "!="]),
      value: z.union([z.number(), z.string()]),
    }),
    z.object({ and: z.array(conditionSchema) }),
    z.object({ or: z.array(conditionSchema) }),
  ]),
);

const policyInputSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(500).optional().nullable(),
  toolPattern: z.string().min(1).max(200),
  condition: conditionSchema,
  action: z.enum(["ALLOW", "BLOCK", "REQUIRE_APPROVAL"]),
  enabled: z.boolean().optional(),
  priority: z.number().int().min(0).max(999).optional(),
});

export const policiesRouter = Router();

policiesRouter.get("/", async (_req, res, next) => {
  try {
    const policies = await prisma.policy.findMany({
      orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
    });
    res.json({ policies });
  } catch (err) {
    next(err);
  }
});

policiesRouter.post("/", requireAuth, async (req, res, next) => {
  try {
    const parsed = policyInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_policy", message: parsed.error.issues[0]?.message ?? "Invalid policy" });
      return;
    }
    const policy = await prisma.policy.create({ data: parsed.data });
    res.status(201).json({ policy });
  } catch (err) {
    next(err);
  }
});

policiesRouter.patch("/:id", requireAuth, async (req, res, next) => {
  try {
    const parsed = policyInputSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_policy", message: parsed.error.issues[0]?.message ?? "Invalid policy" });
      return;
    }
    const existing = await prisma.policy.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ error: "not_found", message: "Policy not found" });
      return;
    }
    const policy = await prisma.policy.update({ where: { id: req.params.id }, data: parsed.data });
    res.json({ policy });
  } catch (err) {
    next(err);
  }
});

policiesRouter.delete("/:id", requireAuth, async (req, res, next) => {
  try {
    const existing = await prisma.policy.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ error: "not_found", message: "Policy not found" });
      return;
    }
    await prisma.policy.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});