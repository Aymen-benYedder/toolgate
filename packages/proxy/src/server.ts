import "dotenv/config";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { createServer } from "node:http";
import { getMockDb } from "./demo/mockDb.js";
import { startDemoGenerator } from "./demo/generator.js";
import { startDemoResetCron } from "./demo/resetCron.js";
import { setRealtime } from "./mcp/interceptor.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { createRealtime } from "./realtime/socket.js";
import { auditRouter } from "./routes/audit.js";
import { agentRouter } from "./routes/agent.js";
import { authRouter } from "./routes/auth.js";
import { demoRouter } from "./routes/demo.js";
import { mcpRouter } from "./routes/mcp.js";
import { policiesRouter } from "./routes/policies.js";
import { requestsRouter } from "./routes/requests.js";
import { statsRouter } from "./routes/stats.js";

// ── Boot-time security warnings ────────────────────────────────────────────
// The defaults exist so `npm run dev` works out of the box, but they must be
// overridden before any public deployment (forgeable JWTs / known admin login).
if ((process.env.JWT_SECRET ?? "replace-me") === "replace-me") {
  console.warn(
    "[toolgate] WARNING: JWT_SECRET is the default 'replace-me'. Set a strong secret before any public deployment.",
  );
}
if ((process.env.ADMIN_PASSWORD ?? "changeme123") === "changeme123") {
  console.warn(
    "[toolgate] WARNING: ADMIN_PASSWORD is the default 'changeme123'. Change it before any public deployment.",
  );
}

const app = express();
const httpServer = createServer(app);
const io = createRealtime(httpServer);
setRealtime(io);

// Warm up the in-memory mock company DB (Northwind Retail) at boot.
const mockDb = getMockDb();
console.log(
  `[toolgate] mock DB ready: ${mockDb.users.length} users, ${mockDb.orders.length} orders, ` +
    `${mockDb.transactions.length} transactions, ${mockDb.inventory.length} inventory items`,
);

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "toolgate-proxy",
    demoMode: process.env.DEMO_MODE === "true",
  });
});

app.use("/mcp", mcpRouter);
app.use("/api/requests", requestsRouter);
app.use("/api/policies", policiesRouter);
app.use("/api/audit", auditRouter);
app.use("/api/auth", authRouter);
app.use("/api/agent", agentRouter);
app.use("/api/demo", demoRouter);
app.use("/api/stats", statsRouter);

app.use(notFoundHandler);
app.use(errorHandler);

const port = Number(process.env.PORT ?? 4000);
httpServer.listen(port, () => {
  console.log(`[toolgate] proxy listening on http://localhost:${port}`);
  console.log(`[toolgate] demo mode: ${process.env.DEMO_MODE === "true" ? "ON" : "OFF"}`);
  console.log(`[toolgate] realtime: socket.io attached (new_pending_request / request_updated)`);
  if (process.env.DEMO_MODE === "true") {
    startDemoGenerator();
    startDemoResetCron();
  }
});

// Keep a reference so AG-5 can wire events without restructuring.
export { io };