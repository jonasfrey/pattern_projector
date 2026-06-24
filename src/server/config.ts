/** Configuration management for the Template Projector server. */

const env = (key: string, fallback: string): string =>
  Deno.env.get(key) ?? fallback;

export const config = {
  host: env("HOST", "0.0.0.0"),
  port: Number(env("PORT", "8082")),
  storagePath: env("STORAGE_PATH", "./storage"),
  patternPath: env("PATTERN_PATH", "./storage/patterns"),
  projectPath: env("PROJECT_PATH", "./storage/projects"),
  thumbnailPath: env("THUMBNAIL_PATH", "./storage/thumbnails"),
  publicPath: env("PUBLIC_PATH", "./public"),
  maxUploadBytes: Number(env("MAX_UPLOAD_BYTES", String(50 * 1024 * 1024))),
  supportedFormats: ["svg", "pdf", "dxf", "ai"] as const,
  env: env("DENO_ENV", "development"),
} as const;

export type SupportedFormat = (typeof config.supportedFormats)[number];
