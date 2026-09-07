import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type { ToolCallRequest } from "../types";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL ?? "";

/** Socket event payloads emitted by the proxy (verified in AG-5). */
export interface SocketEvents {
  new_pending_request: ToolCallRequest;
  request_updated: ToolCallRequest;
}

/**
 * Socket.IO connection for the live feed.
 * - `connected` drives the connection indicator in the Layout shell.
 * - `onEvent` subscribes to a typed event (new_pending_request / request_updated)
 *   and returns an unsubscribe function — pages use it in useEffect.
 * Polling fallback (every 5s + "reconnecting…" indicator) lands in AG-11 (§12).
 */
export function useSocket(): {
  socket: Socket | null;
  connected: boolean;
  onEvent: <K extends keyof SocketEvents>(
    event: K,
    handler: (payload: SocketEvents[K]) => void,
  ) => () => void;
} {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const s = io(SOCKET_URL, { transports: ["websocket", "polling"] });
    socketRef.current = s;
    s.on("connect", () => setConnected(true));
    s.on("disconnect", () => setConnected(false));
    setSocket(s);
    return () => {
      s.disconnect();
      socketRef.current = null;
    };
  }, []);

  const onEvent = <K extends keyof SocketEvents>(
    event: K,
    handler: (payload: SocketEvents[K]) => void,
  ): (() => void) => {
    const s = socketRef.current;
    if (!s) return () => {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    s.on(event, handler as any);
    return () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      s.off(event, handler as any);
    };
  };

  return { socket, connected, onEvent };
}