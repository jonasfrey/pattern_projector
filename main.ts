/** Template Projector — Deno server entry point. */

import { contentType } from "std/media_types/mod.ts";
import { extname, normalize } from "std/path/mod.ts";
import { config } from "./src/server/config.ts";
import { logger } from "./src/utils/logger.ts";
import { initStorage } from "./src/storage/files.ts";
import { handleWebSocket } from "./src/server/websocket.ts";
import { error } from "./src/server/http.ts";
import * as patterns from "./src/server/api/patterns.ts";
import * as projects from "./src/server/api/projects.ts";
import * as logs from "./src/server/api/logs.ts";

await initStorage();

/** Serve a static asset from the public directory (path-traversal safe). */
async function serveStatic(pathname: string): Promise<Response> {
  let rel = decodeURIComponent(pathname);
  if (rel === "/" || rel === "") rel = "/index.html";
  // Block traversal: normalize and ensure it stays within public.
  const safe = normalize(rel).replace(/^(\.\.(\/|\\|$))+/, "");
  const filePath = `${config.publicPath}${
    safe.startsWith("/") ? "" : "/"
  }${safe}`;
  try {
    const data = await Deno.readFile(filePath);
    const ct = contentType(extname(filePath)) ?? "application/octet-stream";
    return new Response(data, { headers: { "content-type": ct } });
  } catch {
    return error("Not found", 404);
  }
}

async function handleApi(
  req: Request,
  url: URL,
): Promise<Response> {
  const parts = url.pathname.split("/").filter(Boolean); // ["api", ...]
  const method = req.method;

  // /api/health
  if (parts[1] === "health") {
    return new Response(JSON.stringify({ status: "ok", env: config.env }), {
      headers: { "content-type": "application/json" },
    });
  }

  // ---- Pattern routes ----
  if (parts[1] === "pattern") {
    // /api/pattern/upload
    if (parts[2] === "upload" && method === "POST") {
      return await patterns.uploadPattern(req);
    }
    // /api/pattern/list
    if (parts[2] === "list" && method === "GET") {
      return patterns.listPatternsHandler();
    }
    const id = parts[2];
    const sub = parts[3];
    if (id) {
      if (!sub) {
        if (method === "GET") return patterns.getPatternHandler(id);
        if (method === "PUT") {
          return await patterns.updatePatternHandler(id, req);
        }
        if (method === "DELETE") {
          return await patterns.deletePatternHandler(id);
        }
      }
      if (sub === "file" && method === "GET") {
        return await patterns.getPatternFileHandler(id);
      }
      if (sub === "calibrate" && method === "POST") {
        return await patterns.calibratePatternHandler(id, req);
      }
      if (sub === "scale" && method === "POST") {
        return await patterns.scalePatternHandler(id, req);
      }
      if (sub === "lock" && method === "POST") {
        return await patterns.lockPatternHandler(id, req);
      }
    }
  }

  // ---- Project routes ----
  if (parts[1] === "project") {
    if (parts[2] === "save" && method === "POST") {
      return await projects.saveProjectHandler(req);
    }
    if (parts[2] === "list" && method === "GET") {
      return await projects.listProjectsHandler();
    }
    if (parts[2] === "export" && method === "POST") {
      return await projects.exportProjectHandler(req);
    }
    const id = parts[2];
    if (id) {
      if (method === "GET") return await projects.getProjectHandler(id);
      if (method === "DELETE") return await projects.deleteProjectHandler(id);
    }
  }

  // ---- Log routes ----
  if (parts[1] === "logs") {
    if (!parts[2] && method === "GET") return logs.getLogsHandler(url);
    if (parts[2] === "export" && method === "GET") {
      return logs.exportLogsHandler();
    }
    if (parts[2] === "clear" && method === "POST") {
      return logs.clearLogsHandler();
    }
  }

  return error("Unknown API route", 404);
}

async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);

  // WebSocket upgrade
  if (req.headers.get("upgrade")?.toLowerCase() === "websocket") {
    return handleWebSocket(req);
  }

  try {
    if (url.pathname.startsWith("/api/")) {
      return await handleApi(req, url);
    }
    return await serveStatic(url.pathname);
  } catch (e) {
    logger.error(`Request failed: ${(e as Error).message}`);
    return error("Internal server error", 500);
  }
}

logger.info(
  `Template Projector starting on http://${config.host}:${config.port}`,
);

Deno.serve({
  hostname: config.host,
  port: config.port,
  onListen: ({ hostname, port }) => {
    logger.info(`Server listening on http://${hostname}:${port}`);
  },
}, handler);
