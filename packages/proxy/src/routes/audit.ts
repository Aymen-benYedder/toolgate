import type { Prisma } from "@prisma/client";
import { Router } from "express";
import { prisma } from "../db/client.js";

/**
 * Audit log query endpoint (spec §8): paginated, filterable by requestId/event.
 */
export const auditRouter = Router();

auditRouter.get("/", async (req, res, next) => {
  try {
    const { requestId, event } = req.query;
    const page = Math.max(Number(req.query.page) || 1, 1);
    const pageSize = Math.min(Math.max(Number(req.query.pageSize) || 100, 1), 500);

    const where: Prisma.AuditLogWhereInput = {};
    if (requestId) where.requestId = String(requestId);
    if (event) where.event = String(event);

    const [events, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: pageSize,
        skip: (page - 1) * pageSize,
      }),
      prisma.auditLog.count({ where }),
    ]);

    res.json({ events, total, page, pageSize });
  } catch (err) {
    next(err);
  }
});