# 📐 Template Projector

Project sewing patterns onto a table from a ceiling-mounted projector, calibrate
the projection to real-world measurements with a tape measure, lock the
calibration, and trace.

Deno backend + Vue 3 single-page frontend (no build step, Vue is vendored
locally). Runs **without Docker**.

## Requirements

- [Deno](https://deno.com) ≥ 2.x
- `rsvg-convert` (librsvg) — for SVG → PNG/PDF export
- (optional) ImageMagick `convert` — extra raster handling

All three are already present on this machine. On Debian/Ubuntu:

```bash
sudo apt install -y librsvg2-bin imagemagick
```

## Run

```bash
deno task start          # http://localhost:8080
PORT=8137 deno task start # custom port
deno task dev            # watch mode
deno task test           # tests
deno task fmt && deno task lint
```

Then open the URL in a browser. Drag the window onto the projector display and
go full-screen.

> Note: the spec's `tasks/install.ts` auto-installer needs `sudo apt` and is
> intentionally **not** wired into `deno task start` here — the native deps are
> already installed. Install them manually (above) if missing.

## Workflow

1. **📁 Load Pattern** — drag & drop or pick an SVG / PDF / DXF / AI file (≤50MB).
2. The pattern renders on the dark projection workspace.
3. **⚙️ Calibrate** — lay a tape measure on the table, drag the two cyan markers
   to span a known distance, enter that distance in cm, and click **Calibrate**.
   The pattern scale is adjusted so the projection matches reality.
4. **🔒 Lock** — freeze the calibration so stray clicks can't change it
   (unlock requires confirmation).
5. **✏️ Controls** — zoom, rotate, reposition, toggle the grid.
6. **💾 Project** — save/load named projects (JSON + file) and export to
   PDF / SVG / PNG.
7. **📊 Logs** — live server log feed over WebSocket.

All overlay windows are draggable (title bar), resizable (corner handle),
toggleable, z-index managed, and remember their position/size in `localStorage`.

## Architecture

```
main.ts                     # HTTP server, routing, static files, WS upgrade
src/
  server/
    config.ts               # env-driven configuration
    http.ts                 # JSON / binary response helpers
    websocket.ts            # WS hub, broadcasts log + state events
    api/
      patterns.ts           # upload, get, transform, calibrate, scale, lock
      projects.ts           # save, list, get, delete, export
      logs.ts               # history, export, clear
  pattern/parser.ts         # format detection + SVG dimension parsing
  calibration/manager.ts    # scale math, lock state, accuracy
  storage/
    files.ts                # pattern files + index (storage/patterns.json)
    projects.ts             # project JSON files
  utils/logger.ts           # in-memory ring buffer + live subscribers
public/                     # Vue SPA (index.html, css, js, vendored Vue)
storage/                    # runtime data (patterns, projects, thumbnails)
```

## API

| Method | Path | Purpose |
| ------ | ---- | ------- |
| POST | `/api/pattern/upload` | multipart upload |
| GET  | `/api/pattern/list` | list patterns |
| GET  | `/api/pattern/:id` | pattern metadata |
| GET  | `/api/pattern/:id/file` | raw pattern bytes |
| PUT  | `/api/pattern/:id` | update scale/rotation/position |
| POST | `/api/pattern/:id/calibrate` | `{projectedDistance, actualDistance}` |
| POST | `/api/pattern/:id/scale` | set scale / reference distance |
| POST | `/api/pattern/:id/lock` | `{locked}` |
| DELETE | `/api/pattern/:id` | delete |
| POST | `/api/project/save` | save project |
| GET  | `/api/project/list` | list projects |
| GET  | `/api/project/:id` | full project |
| DELETE | `/api/project/:id` | delete |
| POST | `/api/project/export` | `{patternId, format}` → file download |
| GET  | `/api/logs?limit=` | log history |
| GET  | `/api/logs/export` | log download |
| POST | `/api/logs/clear` | clear logs |
| WS   | `/` | live `log` / `calibration` / `pattern` / `status` events |

## Config (env vars)

`PORT`, `HOST`, `STORAGE_PATH`, `PATTERN_PATH`, `PROJECT_PATH`,
`THUMBNAIL_PATH`, `PUBLIC_PATH`, `MAX_UPLOAD_BYTES`, `DENO_ENV`.
# pattern_projector
