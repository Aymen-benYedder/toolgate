import type { Prisma } from "@prisma/client";
import { Router } from "express";
import { prisma } from "../db/client.js";
import { approvePendingRequest, rejectPendingRequest } from "../mcp/interceptor.js";

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

requestsRouter.post("/:id/approve", async (req, res, next) => {
  try {
    const decidedBy = (req.body?.decidedBy as string | undefined) ?? "guest-visitor";
    const result = await approvePendingRequest(req.params.id, decidedBy);
    if (!result.ok) {
      res.status(404).json({ error: "not_found", message: "Request not found" });
      return;
    }
    res.json({ ok: true, status: result.status, late: result.late ?? false });
  } catch (err) {
    next(err);
  }
});

requestsRouter.post("/:id/reject", async (req, res, next) => {
  try {
    const decidedBy = (req.body?.decidedBy as string | undefined) ?? "guest-visitor";
    const reason = req.body?.reason as string | undefined;
    const result = await rejectPendingRequest(req.params.id, decidedBy, reason);
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

    const [requests, total] = await Promise.all([
      prisma.toolCallRequest.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: pageSize,
        skip: (page - 1) * pageSize,
      }),
      prisma.toolCallRequest.count({ where }),
    ]);

    res.json({ requests, total, page, pageSize });
  } catch (err) {
    next(err);
  }
});