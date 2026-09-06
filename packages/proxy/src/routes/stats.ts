import { Router } from "express";
import { prisma } from "../db/client.js";

/**
 * Dashboard summary stats (spec §8): total requests, % auto-allowed,
 * % blocked, % pending, avg approval time.
 */
export const statsRouter = Router();

statsRouter.get("/", async (_req, res, next) => {
  try {
    const [total, autoAllowed, autoBlocked, pending, approved, rejected, humanDecided] = await Promise.all([
      prisma.toolCallRequest.count(),
      prisma.toolCallRequest.count({ where: { status: "AUTO_ALLOWED" } }),
      prisma.toolCallRequest.count({ where: { status: "AUTO_BLOCKED" } }),
      prisma.toolCallRequest.count({ where: { status: "PENDING" } }),
      prisma.toolCallRequest.count({ where: { status: "APPROVED" } }),
      prisma.toolCallRequest.count({ where: { status: "REJECTED" } }),
      prisma.toolCallRequest.findMany({
        where: { decidedAt: { not: null }, status: { in: ["APPROVED", "REJECTED"] } },
        select: { createdAt: true, decidedAt: true },
      }),
    ]);

    const avgApprovalMs = humanDecided.length
      ? humanDecided.reduce((sum, r) => sum + (r.decidedAt!.getTime() - r.createdAt.getTime()), 0) /
        humanDecided.length
      : 0;

    res.json({
      total,
      autoAllowed,
      autoBlocked,
      pending,
      approved,
      rejected,
      autoAllowedPct: total ? Math.round((autoAllowed / total) * 100) : 0,
      autoBlockedPct: total ? Math.round((autoBlocked / total) * 100) : 0,
      pendingPct: total ? Math.round((pending / total) * 100) : 0,
      avgApprovalMs: Math.round(avgApprovalMs),
    });
  } catch (err) {
    next(err);
  }
});