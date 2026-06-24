/** WebSocket hub for real-time updates (calibration, pattern, status, logs). */

import { logger } from "../utils/logger.ts";

export interface WSMessage {
  type: "calibration" | "pattern" | "status" | "error" | "log";
  payload: unknown;
  timestamp: number;
}

const sockets = new Set<WebSocket>();

// Forward every log entry to connected clients.
logger.subscribe((entry) => {
  broadcast({ type: "log", payload: entry, timestamp: Date.now() });
});

export function broadcast(msg: WSMessage) {
  const data = JSON.stringify(msg);
  for (const ws of sockets) {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(data);
      } catch {
        // drop on send failure
      }
    }
  }
}

export function handleWebSocket(req: Request): Response {
  const { socket, response } = Deno.upgradeWebSocket(req);

  socket.onopen = () => {
    sockets.add(socket);
    logger.debug(`WebSocket connected (${sockets.size} clients)`);
    socket.send(
      JSON.stringify({
        type: "status",
        payload: { connected: true },
        timestamp: Date.now(),
      }),
    );
  };

  socket.onclose = () => {
    sockets.delete(socket);
    logger.debug(`WebSocket disconnected (${sockets.size} clients)`);
  };

  socket.onerror = () => {
    sockets.delete(socket);
  };

  socket.onmessage = (ev) => {
    // Echo client-originated transform/status events to other clients.
    try {
      const msg = JSON.parse(ev.data) as WSMessage;
      broadcast({ ...msg, timestamp: Date.now() });
    } catch {
      // ignore malformed messages
    }
  };

  return response;
}
