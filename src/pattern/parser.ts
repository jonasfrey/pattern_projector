/** Pattern file types and lightweight SVG dimension parsing. */

import { config, type SupportedFormat } from "../server/config.ts";

/** A user-defined rectangular area of interest within a pattern's own
 * (unscaled, unrotated) coordinate space, e.g. a calibration square or a
 * caption the user wants to keep visible regardless of the main view. */
export interface PatternRegion {
  id: string;
  name: string;
  x: number; // px, in pattern-local space (top-left origin)
  y: number; // px
  width: number; // px
  height: number; // px
  zoom: number; // extra magnification applied inside the region's own overlay
}

export interface PatternData {
  id: string;
  name: string;
  format: SupportedFormat;
  size: number; // bytes
  width: number; // px
  height: number; // px
  scale: number;
  rotation: number;
  position: { x: number; y: number };
  calibration: {
    referenceDistance: number; // cm
    scaleFactor: number;
    locked: boolean;
    accuracy: number; // mm
  };
  metadata: {
    originalWidth: number;
    originalHeight: number;
    physicalWidth: number; // cm
    physicalHeight: number; // cm
  };
  regions?: PatternRegion[];
  /** Relative path to the stored file (server-side). */
  file: string;
  created: string;
}

export function detectFormat(filename: string): SupportedFormat | null {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return (config.supportedFormats as readonly string[]).includes(ext)
    ? (ext as SupportedFormat)
    : null;
}

/** Parse a numeric length from an SVG attribute (e.g. "1200", "1200px", "30cm"). */
function parseLength(value: string | null): number {
  if (!value) return 0;
  const m = value.match(/([\d.]+)\s*([a-z%]*)/i);
  if (!m) return 0;
  const num = parseFloat(m[1]);
  const unit = (m[2] || "px").toLowerCase();
  const dpi = 96;
  switch (unit) {
    case "px":
    case "":
      return num;
    case "pt":
      return num * (dpi / 72);
    case "pc":
      return num * (dpi / 6);
    case "in":
      return num * dpi;
    case "cm":
      return num * (dpi / 2.54);
    case "mm":
      return num * (dpi / 25.4);
    default:
      return num;
  }
}

/**
 * Extract width/height from raw SVG markup without a full DOM parser.
 * Falls back to the viewBox when width/height are absent.
 */
export function parseSvgDimensions(
  svg: string,
): { width: number; height: number } {
  const tagMatch = svg.match(/<svg\b[^>]*>/i);
  const tag = tagMatch ? tagMatch[0] : "";

  const widthAttr = tag.match(/\bwidth\s*=\s*["']([^"']+)["']/i)?.[1] ?? null;
  const heightAttr = tag.match(/\bheight\s*=\s*["']([^"']+)["']/i)?.[1] ?? null;

  let width = parseLength(widthAttr);
  let height = parseLength(heightAttr);

  const viewBox = tag.match(/\bviewBox\s*=\s*["']([^"']+)["']/i)?.[1];
  if ((!width || !height) && viewBox) {
    const parts = viewBox.trim().split(/[\s,]+/).map(Number);
    if (parts.length === 4) {
      if (!width) width = parts[2];
      if (!height) height = parts[3];
    }
  }

  return {
    width: Math.round(width) || 800,
    height: Math.round(height) || 600,
  };
}
