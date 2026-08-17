import { describe, expect, it } from "vitest";
import {
  crossedBounce,
  impactStrength,
  IMPACT_VOICES,
  MASTER_GAIN,
} from "./heroRallyAudio";

describe("hero rally audio model", () => {
  it("fires the bounce exactly once as the ball passes it", () => {
    expect(crossedBounce(0.6, 0.7, 0.66)).toBe(true);
    // Already past it on the previous sample, so it must not fire again.
    expect(crossedBounce(0.7, 0.8, 0.66)).toBe(false);
    expect(crossedBounce(0.5, 0.6, 0.66)).toBe(false);
    // Landing exactly on the bounce still counts.
    expect(crossedBounce(0.6, 0.66, 0.66)).toBe(true);
  });

  it("does not read a wrapped leg as a bounce", () => {
    // The leg restarted, which the caller reports as a contact instead.
    expect(crossedBounce(0.98, 0.02, 0.66)).toBe(false);
  });

  it("hits harder for a faster ball but keeps the range narrow", () => {
    const drive = impactStrength(-19);
    const cut = impactStrength(12);

    expect(drive).toBeGreaterThan(cut);
    // Direction of spin must not change how hard the impact reads.
    expect(impactStrength(-19)).toBeCloseTo(impactStrength(19));
    for (const rate of [0, 5, 12, 19, 40]) {
      expect(impactStrength(rate)).toBeGreaterThan(0.7);
      expect(impactStrength(rate)).toBeLessThanOrEqual(1);
    }
  });

  it("keeps the blade brighter and shorter than the table", () => {
    expect(IMPACT_VOICES.paddle.frequency).toBeGreaterThan(
      IMPACT_VOICES.table.frequency,
    );
    expect(IMPACT_VOICES.paddle.decaySeconds).toBeLessThan(
      IMPACT_VOICES.table.decaySeconds,
    );
    // Nothing may clip: every voice peak stays inside the master ceiling.
    for (const voice of Object.values(IMPACT_VOICES)) {
      expect(voice.peak).toBeGreaterThan(0);
      expect(voice.peak).toBeLessThanOrEqual(1);
      expect(voice.decaySeconds).toBeLessThan(0.25);
    }
    expect(MASTER_GAIN).toBeGreaterThan(0);
    expect(MASTER_GAIN).toBeLessThan(0.5);
  });
});
