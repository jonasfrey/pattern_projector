/** File management: persist uploaded patterns and the pattern index. */

import { config } from "../server/config.ts";
import { logger } from "../utils/logger.ts";
import {
  detectFormat,
  parseSvgDimensions,
  type PatternData,
} from "../pattern/parser.ts";

const INDEX_FILE = `${config.storagePath}/patterns.json`;

async function ensureDirs() {
  await Deno.mkdir(config.patternPath, { recursive: true });
  await Deno.mkdir(config.projectPath, { recursive: true });
  await Deno.mkdir(config.thumbnailPath, { recursive: true });
}

let patterns: Record<string, PatternData> = {};

async function persistIndex() {
  await Deno.writeTextFile(INDEX_FILE, JSON.stringify(patterns, null, 2));
}

export async function initStorage() {
  await ensureDirs();
  try {
    const raw = await Deno.readTextFile(INDEX_FILE);
    patterns = JSON.parse(raw);
    logger.debug(
      `Loaded pattern index (${Object.keys(patterns).length} patterns)`,
    );
  } catch {
    patterns = {};
    await persistIndex();
  }
}

function makeId(): string {
  return `pattern_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function listPatterns(): PatternData[] {
  return Object.values(patterns).sort((a, b) =>
    b.created.localeCompare(a.created)
  );
}

export function getPattern(id: string): PatternData | undefined {
  return patterns[id];
}

export async function savePattern(p: PatternData) {
  patterns[p.id] = p;
  await persistIndex();
}

export async function deletePattern(id: string): Promise<boolean> {
  const p = patterns[id];
  if (!p) return false;
  try {
    await Deno.remove(p.file);
  } catch {
    // file may already be gone
  }
  delete patterns[id];
  await persistIndex();
  logger.info(`Pattern deleted: ${id}`);
  return true;
}

/** Store an uploaded file and create its PatternData record. */
export async function storeUpload(
  filename: string,
  bytes: Uint8Array,
): Promise<PatternData> {
  const format = detectFormat(filename);
  if (!format) {
    throw new Error(
      `Unsupported format. Supported: ${config.supportedFormats.join(", ")}`,
    );
  }
  if (bytes.byteLength > config.maxUploadBytes) {
    throw new Error("File exceeds maximum upload size");
  }

  const id = makeId();
  const safeName = filename.replace(/[^\w.\-]/g, "_");
  const storedPath = `${config.patternPath}/${id}_${safeName}`;
  await Deno.writeFile(storedPath, bytes);

  let width = 800;
  let height = 600;
  if (format === "svg") {
    const text = new TextDecoder().decode(bytes);
    const dims = parseSvgDimensions(text);
    width = dims.width;
    height = dims.height;
    logger.debug(`SVG parsed: ${width}x${height}px`);
  }

  const pattern: PatternData = {
    id,
    name: filename,
    format,
    size: bytes.byteLength,
    width,
    height,
    scale: 1,
    rotation: 0,
    position: { x: 0, y: 0 },
    calibration: {
      referenceDistance: 10,
      scaleFactor: 1,
      locked: false,
      accuracy: 0.5,
    },
    metadata: {
      originalWidth: width,
      originalHeight: height,
      physicalWidth: 0,
      physicalHeight: 0,
    },
    file: storedPath,
    created: new Date().toISOString(),
  };

  await savePattern(pattern);
  logger.info(`Pattern loaded: ${filename} (${id})`);
  return pattern;
}

/** Raw bytes + mime for serving a stored pattern to the client. */
export async function readPatternFile(
  id: string,
): Promise<{ bytes: Uint8Array; mime: string } | null> {
  const p = patterns[id];
  if (!p) return null;
  try {
    const bytes = await Deno.readFile(p.file);
    return { bytes, mime: mimeFor(p.format) };
  } catch {
    return null;
  }
}

export function mimeFor(format: string): string {
  switch (format) {
    case "svg":
      return "image/svg+xml";
    case "pdf":
      return "application/pdf";
    case "dxf":
      return "application/dxf";
    case "ai":
      return "application/postscript";
    default:
      return "application/octet-stream";
  }
}
