import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";

/**
 * Creates the Socket.IO realtime layer.
 * Event contract (consumed by the dashboard's useSocket hook):
 *   - "new_pending_request" — full ToolCallRequest row, status PENDING
 *   - "request_updated"     — full ToolCallRequest row after any status change
 *     (AUTO_ALLOWED / AUTO_BLOCKED / APPROVED / REJECTED)
 */
export function createRealtime(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  io.on("connection", (socket) => {
    console.log(`[socket] client connected: ${socket.id}`);
    socket.on("disconnect", () => {
      console.log(`[socket] client disconnected: ${socket.id}`);
    });
  });

  return io;
}

export function emitNewPendingRequest(io: Server, request: unknown): void {
  io.emit("new_pending_request", request);
}

export function emitRequestUpdated(io: Server, request: unknown): void {
  io.emit("request_updated", request);
}