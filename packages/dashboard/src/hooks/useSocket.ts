import { useEffect, useState } from "react";
import { io, type Socket } from "socket.io-client";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL ?? "";

/**
 * Socket.IO connection for the live feed.
 * Event subscriptions (new_pending_request, request_decided, activity, stats)
 * land in AG-8. Polling fallback (every 5s + "reconnecting..." indicator) per
 * spec §12 lands in AG-11.
 */
export function useSocket(): { socket: Socket | null; connected: boolean } {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const s = io(SOCKET_URL, { transports: ["websocket", "polling"] });
    s.on("connect", () => setConnected(true));
    s.on("disconnect", () => setConnected(false));
    setSocket(s);
    return () => {
      s.disconnect();
    };
  }, []);

  return { socket, connected };
}