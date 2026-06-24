/** Project management endpoints: save, list, get, delete, export. */

import { binary, error, json, ok, readJson } from "../http.ts";
import {
  deleteProject,
  getProject,
  listProjects,
  saveProject,
} from "../../storage/projects.ts";
import { getPattern, readPatternFile } from "../../storage/files.ts";
import { logger } from "../../utils/logger.ts";

/** POST /api/project/save */
export async function saveProjectHandler(req: Request): Promise<Response> {
  const body = await readJson<{
    id?: string;
    name: string;
    description?: string;
    tags?: string[];
    patternId: string;
    pattern?: unknown;
    settings?: unknown;
  }>(req);
  if (!body.name) return error("Project name is required");

  const project = await saveProject({
    id: body.id,
    name: body.name,
    description: body.description ?? "",
    tags: body.tags ?? [],
    patternId: body.patternId,
    pattern: body.pattern ?? getPattern(body.patternId) ?? null,
    settings: body.settings ?? {},
  });
  return json(project, 201);
}

/** GET /api/project/list */
export async function listProjectsHandler(): Promise<Response> {
  return json(await listProjects());
}

/** GET /api/project/:id */
export async function getProjectHandler(id: string): Promise<Response> {
  const p = await getProject(id);
  return p ? json(p) : error("Project not found", 404);
}

/** DELETE /api/project/:id */
export async function deleteProjectHandler(id: string): Promise<Response> {
  const removed = await deleteProject(id);
  return removed ? ok() : error("Project not found", 404);
}

/**
 * POST /api/project/export
 * Exports the project's pattern. SVG/PNG are produced via rsvg-convert when
 * the source is SVG; otherwise the original file is streamed back.
 */
export async function exportProjectHandler(req: Request): Promise<Response> {
  const { projectId, patternId, format } = await readJson<{
    projectId?: string;
    patternId?: string;
    format: "pdf" | "svg" | "png" | "jpg";
  }>(req);

  let pid = patternId;
  if (!pid && projectId) {
    const proj = await getProject(projectId);
    pid = proj?.patternId;
  }
  if (!pid) return error("No pattern to export");

  const pattern = getPattern(pid);
  const source = await readPatternFile(pid);
  if (!pattern || !source) return error("Pattern not found", 404);

  logger.info(`Project export started: ${pid} → ${format}`);

  // Only attempt conversion from SVG sources (rsvg-convert).
  if (pattern.format === "svg" && format !== "svg") {
    try {
      const out = await convertSvg(source.bytes, format);
      return binary(out.bytes, {
        "content-type": out.mime,
        "content-disposition":
          `attachment; filename="${pattern.name}.${format}"`,
      });
    } catch (e) {
      logger.warn(`Export conversion failed: ${(e as Error).message}`);
      // fall through to raw download
    }
  }

  return binary(source.bytes, {
    "content-type": source.mime,
    "content-disposition": `attachment; filename="${pattern.name}"`,
  });
}

async function convertSvg(
  svg: Uint8Array,
  format: "pdf" | "png" | "jpg" | "svg",
): Promise<{ bytes: Uint8Array; mime: string }> {
  const fmt = format === "jpg" ? "png" : format; // rsvg has no jpg; use png
  const cmd = new Deno.Command("rsvg-convert", {
    args: ["-f", fmt, "-"],
    stdin: "piped",
    stdout: "piped",
    stderr: "piped",
  });
  const child = cmd.spawn();
  const writer = child.stdin.getWriter();
  await writer.write(svg);
  await writer.close();
  const { code, stdout, stderr } = await child.output();
  if (code !== 0) {
    throw new Error(new TextDecoder().decode(stderr) || "rsvg-convert failed");
  }
  const mime = fmt === "pdf"
    ? "application/pdf"
    : fmt === "png"
    ? "image/png"
    : "image/svg+xml";
  return { bytes: stdout, mime };
}
