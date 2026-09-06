import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";

/**
 * Creates the Socket.IO realtime layer.
 * Event wiring (new_pending_request, request_decided, activity, stats) lands in AG-5.
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