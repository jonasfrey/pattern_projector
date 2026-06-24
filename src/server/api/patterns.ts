/** Pattern upload, retrieval, transform, calibrate, and lock endpoints. */

import { binary, error, json, ok, readJson } from "../http.ts";
import { logger } from "../../utils/logger.ts";
import { config } from "../config.ts";
import { broadcast } from "../websocket.ts";
import {
  deletePattern,
  getPattern,
  listPatterns,
  readPatternFile,
  savePattern,
  storeUpload,
} from "../../storage/files.ts";
import { CalibrationManager } from "../../calibration/manager.ts";

/** POST /api/pattern/upload  (multipart/form-data) */
export async function uploadPattern(req: Request): Promise<Response> {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return error("No file provided");
  if (file.size > config.maxUploadBytes) {
    return error("File exceeds maximum upload size", 413);
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const name = (form.get("name") as string) || file.name;
  try {
    const pattern = await storeUpload(name, bytes);
    broadcast({
      type: "pattern",
      payload: { event: "loaded", pattern },
      timestamp: Date.now(),
    });
    return json(pattern, 201);
  } catch (e) {
    logger.warn(`Upload rejected: ${(e as Error).message}`);
    return error((e as Error).message, 400);
  }
}

/** GET /api/pattern/list */
export function listPatternsHandler(): Response {
  return json(listPatterns());
}

/** GET /api/pattern/:id */
export function getPatternHandler(id: string): Response {
  const p = getPattern(id);
  return p ? json(p) : error("Pattern not found", 404);
}

/** GET /api/pattern/:id/file  — serves raw pattern bytes for rendering */
export async function getPatternFileHandler(id: string): Promise<Response> {
  const f = await readPatternFile(id);
  if (!f) return error("Pattern file not found", 404);
  return binary(f.bytes, { "content-type": f.mime });
}

/** PUT /api/pattern/:id — update transforms */
export async function updatePatternHandler(
  id: string,
  req: Request,
): Promise<Response> {
  const p = getPattern(id);
  if (!p) return error("Pattern not found", 404);
  const body = await readJson<Record<string, unknown>>(req);

  if (typeof body.scale === "number") p.scale = body.scale;
  if (typeof body.rotation === "number") p.rotation = body.rotation;
  if (body.position && typeof body.position === "object") {
    const pos = body.position as { x?: number; y?: number };
    if (typeof pos.x === "number") p.position.x = pos.x;
    if (typeof pos.y === "number") p.position.y = pos.y;
  }
  await savePattern(p);
  broadcast({
    type: "pattern",
    payload: { event: "transformed", pattern: p },
    timestamp: Date.now(),
  });
  return json(p);
}

/** POST /api/pattern/:id/calibrate */
export async function calibratePatternHandler(
  id: string,
  req: Request,
): Promise<Response> {
  const p = getPattern(id);
  if (!p) return error("Pattern not found", 404);
  const { projectedDistance, actualDistance } = await readJson<{
    projectedDistance: number;
    actualDistance: number;
  }>(req);

  const mgr = new CalibrationManager({
    scale: p.calibration.scaleFactor,
    referenceDistance: p.calibration.referenceDistance,
    locked: p.calibration.locked,
  });
  try {
    const newScale = mgr.calibrate(projectedDistance, actualDistance);
    const status = mgr.getStatus();
    p.scale = newScale;
    p.calibration.scaleFactor = newScale;
    p.calibration.accuracy = status.accuracy;
    await savePattern(p);
    logger.info(
      `Calibrated ${id}: ${projectedDistance}px = ${actualDistance}cm → ${
        newScale.toFixed(3)
      }x`,
    );
    broadcast({
      type: "calibration",
      payload: { event: "update", pattern: p, status },
      timestamp: Date.now(),
    });
    return json({ pattern: p, status });
  } catch (e) {
    return error((e as Error).message, 409);
  }
}

/** POST /api/pattern/:id/scale */
export async function scalePatternHandler(
  id: string,
  req: Request,
): Promise<Response> {
  const p = getPattern(id);
  if (!p) return error("Pattern not found", 404);
  if (p.calibration.locked) return error("Calibration is locked", 409);
  const { scale, referenceDistance } = await readJson<{
    scale: number;
    referenceDistance?: number;
  }>(req);
  if (typeof scale === "number") {
    p.scale = scale;
    p.calibration.scaleFactor = scale;
  }
  if (typeof referenceDistance === "number") {
    p.calibration.referenceDistance = referenceDistance;
  }
  await savePattern(p);
  broadcast({
    type: "calibration",
    payload: { event: "update", pattern: p },
    timestamp: Date.now(),
  });
  return json(p);
}

/** POST /api/pattern/:id/lock */
export async function lockPatternHandler(
  id: string,
  req: Request,
): Promise<Response> {
  const p = getPattern(id);
  if (!p) return error("Pattern not found", 404);
  const { locked } = await readJson<{
    locked: boolean;
    lockType?: string;
  }>(req);
  p.calibration.locked = !!locked;
  await savePattern(p);
  logger.info(`Calibration ${locked ? "locked" : "unlocked"}: ${id}`);
  broadcast({
    type: "status",
    payload: { event: "lock", id, locked: p.calibration.locked },
    timestamp: Date.now(),
  });
  return json(p);
}

/** DELETE /api/pattern/:id */
export async function deletePatternHandler(id: string): Promise<Response> {
  const removed = await deletePattern(id);
  return removed ? ok() : error("Pattern not found", 404);
}
