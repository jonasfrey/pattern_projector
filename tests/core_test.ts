import {
  assertAlmostEquals,
  assertEquals,
  assertThrows,
} from "std/assert/mod.ts";
import { CalibrationManager } from "../src/calibration/manager.ts";
import { detectFormat, parseSvgDimensions } from "../src/pattern/parser.ts";

Deno.test("calibrate scales projected px to actual cm", () => {
  const m = new CalibrationManager();
  // 100px should represent 10cm → scale 0.1 (× initial 1.0)
  const scale = m.calibrate(100, 10);
  assertAlmostEquals(scale, 0.1, 1e-9);
  assertAlmostEquals(m.getStatus().scale, 0.1, 1e-9);
});

Deno.test("calibration is compounding from current scale", () => {
  const m = new CalibrationManager({ scale: 2 });
  assertAlmostEquals(m.calibrate(200, 10), 0.1, 1e-9); // (10/200)*2
});

Deno.test("locked calibration rejects changes", () => {
  const m = new CalibrationManager();
  m.lock();
  assertThrows(() => m.calibrate(100, 10), Error, "locked");
  m.unlock();
  m.calibrate(100, 10); // no throw
});

Deno.test("invalid distances are rejected", () => {
  const m = new CalibrationManager();
  assertThrows(() => m.calibrate(0, 10));
  assertThrows(() => m.calibrate(100, 0));
});

Deno.test("detectFormat recognizes supported extensions", () => {
  assertEquals(detectFormat("a.svg"), "svg");
  assertEquals(detectFormat("a.PDF"), "pdf");
  assertEquals(detectFormat("a.dxf"), "dxf");
  assertEquals(detectFormat("a.txt"), null);
});

Deno.test("parseSvgDimensions reads width/height", () => {
  const d = parseSvgDimensions('<svg width="1200" height="800"></svg>');
  assertEquals(d, { width: 1200, height: 800 });
});

Deno.test("parseSvgDimensions falls back to viewBox", () => {
  const d = parseSvgDimensions('<svg viewBox="0 0 640 480"></svg>');
  assertEquals(d, { width: 640, height: 480 });
});

Deno.test("parseSvgDimensions converts cm units to px", () => {
  const d = parseSvgDimensions('<svg width="2.54cm" height="2.54cm"></svg>');
  assertEquals(d, { width: 96, height: 96 });
});
