import { describe, expect, it } from "vitest";
import {
  bladePitch,
  bladeRollForHand,
  BLADE_PITCH_DEGREES,
  createRallyShot,
  decaySpinVelocity,
  flickVelocity,
  forwardSwingOffset,
  handForLane,
  keepsTableTopVisible,
  projectArcballPoint,
  sampleRallyPoint,
  swingRollOffset,
  verticalSwingOffset,
  SPIN_MAX_VELOCITY,
  SPIN_MIN_VELOCITY,
} from "./heroRally";

describe("hero rally model", () => {
  it("mirrors forehand and backhand lanes for opposing players", () => {
    expect(handForLane(0.7, "left")).toBe("forehand");
    expect(handForLane(-0.7, "left")).toBe("backhand");
    expect(handForLane(-0.7, "right")).toBe("forehand");
    expect(handForLane(0.7, "right")).toBe("backhand");
  });

  it("keeps drive and cut spin in opposite directions", () => {
    const driveValues = [0.2, 0.4, 0.2, 0.5, 0.5];
    const cutValues = [0.8, 0.4, 0.9, 0.5, 0.5];
    const drive = createRallyShot(
      -0.7,
      "left",
      () => driveValues.shift() ?? 0.5,
    );
    const cut = createRallyShot(0.7, "right", () => cutValues.shift() ?? 0.5);

    expect(drive.kind).toBe("drive");
    expect(drive.spinRate).toBeLessThan(0);
    expect(cut.kind).toBe("cut");
    expect(cut.spinRate).toBeGreaterThan(0);
  });

  it("bounces once before reaching the opposite contact point", () => {
    const shot = createRallyShot(-0.7, "left", () => 0.4);
    const bounce = sampleRallyPoint(shot, shot.bounceAt, true);
    const contact = sampleRallyPoint(shot, 1, true);

    expect(bounce.y).toBeCloseTo(1.58);
    expect(contact.y).toBeCloseTo(2.58);
    expect(contact.z).toBeCloseTo(shot.targetZ);
  });

  it.each([
    ["drive", 0.64],
    ["drive", 0.68],
    ["cut", 0.73],
    ["cut", 0.77],
  ] as const)(
    "clears the net for a %s shot bouncing at %s",
    (kind, bounceAt) => {
      const shot = {
        hand: "forehand" as const,
        kind,
        startZ: -0.7,
        targetZ: 0.7,
        bounceAt,
        spinRate: kind === "drive" ? -18 : 12,
      };

      // The 2.12-high tape plus the 0.13 ball radius sets this clearance.
      expect(sampleRallyPoint(shot, 0.5, true).y).toBeGreaterThan(2.25);
      expect(sampleRallyPoint(shot, 0.5, false).y).toBeGreaterThan(2.25);
    },
  );

  it("carries a drive in from above and lifts it through contact", () => {
    // High on the backswing, lowest at contact, highest on the follow-through.
    expect(verticalSwingOffset("drive", -1)).toBeGreaterThan(0);
    expect(verticalSwingOffset("drive", 0)).toBe(0);
    expect(verticalSwingOffset("drive", 1)).toBeGreaterThan(
      verticalSwingOffset("drive", -1),
    );
  });

  it("drops a cut from high to low through contact", () => {
    expect(verticalSwingOffset("cut", -1)).toBeGreaterThan(0);
    expect(verticalSwingOffset("cut", 1)).toBeLessThan(0);
  });

  it("draws the blade back then drives it forward through the ball", () => {
    expect(forwardSwingOffset("drive", -1)).toBeLessThan(0);
    expect(forwardSwingOffset("drive", 0)).toBe(0);
    expect(forwardSwingOffset("drive", 1)).toBeGreaterThan(0);
    // A cut is a shorter, more passive stroke than a drive.
    expect(forwardSwingOffset("cut", 1)).toBeLessThan(
      forwardSwingOffset("drive", 1),
    );
  });

  it("rolls the blade by hand only, so both players hold the handle alike", () => {
    // The rigs are already mirrored by their face rotation. A side-dependent
    // roll would cancel that mirror and flip one player's handle.
    expect(bladeRollForHand("forehand")).toBeCloseTo(Math.PI / 2);
    expect(bladeRollForHand("backhand")).toBeCloseTo(-Math.PI / 2);
    expect(bladeRollForHand("forehand")).toBe(-bladeRollForHand("backhand"));
  });

  it("brushes the blade tip up on drives and down on cuts", () => {
    // Roll decreasing from the forehand base lifts the tip.
    expect(swingRollOffset("drive", 1)).toBeLessThan(0);
    expect(swingRollOffset("cut", 1)).toBeGreaterThan(0);
    // Contact adds no roll. `-swingPhase * 0.42` yields -0 here, which is the
    // same rotation as 0, so compare numerically rather than by Object.is.
    expect(swingRollOffset("drive", 0)).toBeCloseTo(0);
    expect(swingRollOffset("cut", 0)).toBeCloseTo(0);
  });

  it("closes the blade on a drive and opens it on a cut", () => {
    const toDegrees = (radians: number) => (radians * 180) / Math.PI;

    // Positive pitch leans the top edge forward over the ball.
    expect(toDegrees(bladePitch("drive", 0))).toBeCloseTo(BLADE_PITCH_DEGREES);
    expect(toDegrees(bladePitch("cut", 0))).toBeCloseTo(-BLADE_PITCH_DEGREES);
    expect(toDegrees(bladePitch("drive", 1))).toBeCloseTo(BLADE_PITCH_DEGREES);
    expect(toDegrees(bladePitch("cut", 1))).toBeCloseTo(-BLADE_PITCH_DEGREES);
  });

  it("keeps the blade squarer on the backswing than at contact", () => {
    expect(Math.abs(bladePitch("drive", -1))).toBeLessThan(
      Math.abs(bladePitch("drive", 0)),
    );
    expect(Math.abs(bladePitch("cut", -1))).toBeLessThan(
      Math.abs(bladePitch("cut", 0)),
    );
    // The face never flips to the wrong side while rolling in.
    expect(bladePitch("drive", -1)).toBeGreaterThan(0);
    expect(bladePitch("cut", -1)).toBeLessThan(0);
  });

  it("carries a fast flick further than a slow one, up to a ceiling", () => {
    const slow = flickVelocity(0.05, 0.016);
    const fast = flickVelocity(0.3, 0.016);

    expect(slow).toBeGreaterThan(0);
    expect(fast).toBeGreaterThan(slow);
    expect(flickVelocity(9, 0.016)).toBe(SPIN_MAX_VELOCITY);
    expect(flickVelocity(0.3, 0)).toBe(0);
  });

  it("eases a flick to a stop at a rate independent of frame time", () => {
    const oneStep = decaySpinVelocity(6, 0.1);
    const sixSmallSteps = Array.from({ length: 6 }).reduce<number>(
      (velocity) => decaySpinVelocity(velocity, 0.1 / 6),
      6,
    );

    expect(oneStep).toBeLessThan(6);
    expect(oneStep).toBeCloseTo(sixSmallSteps, 6);
    // Even the hardest flick settles within a couple of seconds rather than
    // drifting on: at the ceiling it drops under the stop threshold by ~1.66s.
    expect(decaySpinVelocity(SPIN_MAX_VELOCITY, 2)).toBeLessThan(
      SPIN_MIN_VELOCITY,
    );
    expect(decaySpinVelocity(SPIN_MAX_VELOCITY, 1)).toBeGreaterThan(
      SPIN_MIN_VELOCITY,
    );
  });

  it("projects pointer positions onto a full 3D arcball", () => {
    expect(projectArcballPoint(0, 0)).toEqual({ x: 0, y: 0, z: 1 });

    const edge = projectArcballPoint(2, 0);
    expect(edge.x).toBeCloseTo(1);
    expect(edge.y).toBeCloseTo(0);
    expect(edge.z).toBeCloseTo(0);
  });

  it("rejects rotations that expose the underside of the table", () => {
    const viewerDirection = { x: 0, y: 0.5, z: 0.86 };

    expect(keepsTableTopVisible({ x: 0, y: 1, z: 0 }, viewerDirection)).toBe(
      true,
    );
    expect(keepsTableTopVisible({ x: 0, y: -1, z: 0 }, viewerDirection)).toBe(
      false,
    );
  });
});
