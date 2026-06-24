# UI/UX rehaul notes

## What changed
Restyled `public/css/style.css` using the Airbnb-derived tokens in `design.md` (colors, radii, spacing, the single shadow tier, type weights). No markup, Vue bindings, or app logic were touched — `public/js/app.js` and `public/index.html` are unchanged except where noted below.

**Design decision:** the workspace/stage (the area that drives the physical projector) was deliberately kept on a dark palette instead of going full white-canvas Airbnb. This app projects pattern outlines onto fabric — a bright white canvas there would wash out the projection and hurt real-world usability. The control chrome around it (topbar, floating panels, forms, buttons, toasts) got the full Airbnb treatment: white surfaces, Rausch (#ff385c) accent, 8–14px radii, the one-tier soft shadow, and lighter type weights. This mirrors how creative tools (Figma, Procreate) pair light/dark panels with a neutral canvas.

Also left untouched: on-canvas drawing affordances (region outline cyan, zoom-anchor crosshair, grid lines) — their color was chosen for contrast against projected fabric, which is a usability concern distinct from cosmetic styling.

## Functionality gaps spotted while reading the code (not fixed, since scope was styling-only)

> Note: the Person and Size Guide overlays were still being built out elsewhere in this codebase while this styling pass was in progress, so they're now wired up — the panels render and pick up the same tokens introduced in `style.css` (e.g. `.size-row.match` reuses `--c-success`/`--c-success-tint`).

1. **`applyReference()` is defined but never called from the template.** It posts a reference-distance/scale change to the server, but no UI element invokes it — the calibration overlay only exposes `runCalibration`/`resetCalibration`/`toggleLock`. Possibly dead code or a missing control.
2. **`calib.reference` is read into the form on pattern load** but there's no input bound to `calib.reference` in the Calibration overlay — only `calib.projected`, `calib.actual`, and `calib.tolerance` are. `calib.tolerance` itself also doesn't appear to feed into `runCalibration()`'s request body.
3. **Region drawing has no minimum-size guard** — a click-drag below 6px is treated as an accidental click and ignored, but a slightly larger drag (e.g. 7px) creates a sliver region with effectively no width/height.
4. **WebSocket reconnect has no backoff cap** — `setTimeout(connectWS, 2000)` retries every 2s indefinitely if the server is down, which is fine for a local tool but could spam reconnects if left open for a long session.

These are worth a follow-up pass if you want the dead calibration-reference code cleaned up or wired to the UI.
