import "dotenv/config";
import cors from "cors";
import express from "express";
import { createServer } from "node:http";
import { getMockDb } from "./demo/mockDb.js";
import { setRealtime } from "./mcp/interceptor.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { createRealtime } from "./realtime/socket.js";
import { auditRouter } from "./routes/audit.js";
import { authRouter } from "./routes/auth.js";
import { demoRouter } from "./routes/demo.js";
import { mcpRouter } from "./routes/mcp.js";
import { policiesRouter } from "./routes/policies.js";
import { requestsRouter } from "./routes/requests.js";
import { statsRouter } from "./routes/stats.js";

const app = express();
const httpServer = createServer(app);
const io = createRealtime(httpServer);
setRealtime(io);

// Warm up the in-memory mock company DB (Northwind Retail) at boot.
const mockDb = getMockDb();
console.log(
  `[agentgate] mock DB ready: ${mockDb.users.length} users, ${mockDb.orders.length} orders, ` +
    `${mockDb.transactions.length} transactions, ${mockDb.inventory.length} inventory items`,
);

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "agentgate-proxy",
    demoMode: process.env.DEMO_MODE === "true",
  });
});

app.use("/mcp", mcpRouter);
app.use("/api/requests", requestsRouter);
app.use("/api/policies", policiesRouter);
app.use("/api/audit", auditRouter);
app.use("/api/auth", authRouter);
app.use("/api/demo", demoRouter);
app.use("/api/stats", statsRouter);

app.use(notFoundHandler);
app.use(errorHandler);

const port = Number(process.env.PORT ?? 4000);
httpServer.listen(port, () => {
  console.log(`[agentgate] proxy listening on http://localhost:${port}`);
  console.log(`[agentgate] demo mode: ${process.env.DEMO_MODE === "true" ? "ON" : "OFF"}`);
  console.log(`[agentgate] realtime: socket.io attached (new_pending_request / request_updated)`);
});

// Keep a reference so AG-5 can wire events without restructuring.
export { io };