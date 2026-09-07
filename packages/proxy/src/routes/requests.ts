import type { Prisma } from "@prisma/client";
import { Router } from "express";
import { prisma } from "../db/client.js";
import { approvePendingRequest, rejectPendingRequest } from "../mcp/interceptor.js";
import { resolveDecidedBy } from "../middleware/auth.js";
import { publicMutationLimiter } from "../middleware/rateLimit.js";

/**
 * Tool-call request endpoints (spec §8):
 *   GET  /api/requests/pending      — pending approvals
 *   POST /api/requests/:id/approve  — approve (body: { decidedBy })
 *   POST /api/requests/:id/reject   — reject (body: { decidedBy, reason? })
 *   GET  /api/requests              — paginated history with filters
 */
export const requestsRouter = Router();

requestsRouter.get("/pending", async (_req, res, next) => {
  try {
    const requests = await prisma.toolCallRequest.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "desc" },
    });
    res.json({ requests });
  } catch (err) {
    next(err);
  }
});

requestsRouter.post("/:id/approve", publicMutationLimiter, async (req, res, next) => {
  try {
    const requestId = req.params.id;
    if (!requestId) {
      res.status(400).json({ error: "bad_request", message: "Missing request id" });
      return;
    }
    const decidedBy = resolveDecidedBy(req, res);
    if (decidedBy === null) return;
    const result = await approvePendingRequest(requestId, decidedBy);
    if (!result.ok) {
      res.status(404).json({ error: "not_found", message: "Request not found" });
      return;
    }
    res.json({ ok: true, status: result.status, late: result.late ?? false });
  } catch (err) {
    next(err);
  }
});

requestsRouter.post("/:id/reject", publicMutationLimiter, async (req, res, next) => {
  try {
    const requestId = req.params.id;
    if (!requestId) {
      res.status(400).json({ error: "bad_request", message: "Missing request id" });
      return;
    }
    const decidedBy = resolveDecidedBy(req, res);
    if (decidedBy === null) return;
    const reason = req.body?.reason as string | undefined;
    const result = await rejectPendingRequest(requestId, decidedBy, reason);
    if (!result.ok) {
      res.status(404).json({ error: "not_found", message: "Request not found" });
      return;
    }
    res.json({ ok: true, status: result.status, late: result.late ?? false });
  } catch (err) {
    next(err);
  }
});

requestsRouter.get("/", async (req, res, next) => {
  try {
    const { status, agentName, from, to } = req.query;
    const page = Math.max(Number(req.query.page) || 1, 1);
    const pageSize = Math.min(Math.max(Number(req.query.pageSize) || 50, 1), 200);

    const where: Prisma.ToolCallRequestWhereInput = {};
    if (status) where.status = String(status);
    if (agentName) where.agentName = String(agentName);
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(String(from));
      if (to) where.createdAt.lte = new Date(String(to));
    }

    const [requests, total, policies] = await Promise.all([
      prisma.toolCallRequest.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: pageSize,
        skip: (page - 1) * pageSize,
      }),
      prisma.toolCallRequest.count({ where }),
      prisma.policy.findMany({ select: { id: true, name: true } }),
    ]);

    const policyNames = new Map(policies.map((p) => [p.id, p.name]));
    const rows = requests.map((r) => ({
      ...r,
      matchedPolicyName: r.matchedPolicyId ? (policyNames.get(r.matchedPolicyId) ?? null) : null,
    }));

    res.json({ requests: rows, total, page, pageSize });
  } catch (err) {
    next(err);
  }
});