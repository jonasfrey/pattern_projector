/** Log endpoints. Live streaming is handled over WebSocket; these serve
 * history and export. */

import { json, ok } from "../http.ts";
import { logger } from "../../utils/logger.ts";

/** GET /api/logs */
export function getLogsHandler(url: URL): Response {
  const limit = Number(url.searchParams.get("limit") ?? "200");
  return json(logger.history(limit));
}

/** GET /api/logs/export — plain-text download */
export function exportLogsHandler(): Response {
  const text = logger
    .history(1000)
    .map(
      (e) =>
        `[${
          e.timestamp.replace("T", " ").slice(0, 19)
        }] ${e.level}: ${e.message}`,
    )
    .join("\n");
  return new Response(text, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "content-disposition": 'attachment; filename="server-logs.txt"',
    },
  });
}

/** POST /api/logs/clear */
export function clearLogsHandler(): Response {
  logger.clear();
  logger.info("Logs cleared");
  return ok();
}
