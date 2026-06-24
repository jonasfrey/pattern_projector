/** Calibration logic and scale calculations. */

export interface CalibrationStatus {
  scale: number;
  referenceDistance: number;
  tolerance: number;
  locked: boolean;
  accuracy: number; // mm
}

/**
 * Computes the scale factor that makes a projected distance (px) match an
 * actual measured distance (cm) on the table.
 */
export class CalibrationManager {
  private patternScale: number;
  private referenceDistance: number; // cm
  private tolerance: number; // mm
  private locked: boolean;

  constructor(opts: Partial<CalibrationStatus> = {}) {
    this.patternScale = opts.scale ?? 1.0;
    this.referenceDistance = opts.referenceDistance ?? 10;
    this.tolerance = opts.tolerance ?? 0.5;
    this.locked = opts.locked ?? false;
  }

  /**
   * @param projectedDistance distance on the projected pattern, in pixels
   * @param actualDistance distance measured on the table, in cm
   * @returns the new scale factor
   */
  calibrate(projectedDistance: number, actualDistance: number): number {
    if (this.locked) throw new Error("Calibration is locked");
    if (projectedDistance <= 0) {
      throw new Error("projectedDistance must be greater than 0");
    }
    if (actualDistance <= 0) {
      throw new Error("actualDistance must be greater than 0");
    }
    const newScale = (actualDistance / projectedDistance) * this.patternScale;
    this.patternScale = newScale;
    return newScale;
  }

  setReferenceDistance(cm: number) {
    if (this.locked) throw new Error("Calibration is locked");
    this.referenceDistance = cm;
  }

  setTolerance(mm: number) {
    this.tolerance = mm;
  }

  setScale(scale: number) {
    if (this.locked) throw new Error("Calibration is locked");
    this.patternScale = scale;
  }

  lock() {
    this.locked = true;
  }

  unlock() {
    this.locked = false;
  }

  /** Accuracy estimate (mm) derived from tolerance and scale. */
  private calculateAccuracy(): number {
    const acc = this.tolerance * Math.min(1, this.patternScale);
    return Math.round(acc * 100) / 100;
  }

  getStatus(): CalibrationStatus {
    return {
      scale: this.patternScale,
      referenceDistance: this.referenceDistance,
      tolerance: this.tolerance,
      locked: this.locked,
      accuracy: this.calculateAccuracy(),
    };
  }
}
