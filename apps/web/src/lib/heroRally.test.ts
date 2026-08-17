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
  blockedCourseSide,
  blockedStroke,
  clampZoom,
  pinchZoomFactor,
  touchSpan,
  wheelReleasesToPage,
  wheelZoomFactor,
  MAX_REPEATED_SHOTS,
  SPIN_MAX_VELOCITY,
  SPIN_MIN_VELOCITY,
  ZOOM_DEFAULT,
  ZOOM_MAX,
  ZOOM_MIN,
  type RallyShot,
  type RallyStroke,
} from "./heroRally";

const shotFixture = (
  targetZ: number,
  kind: RallyStroke = "drive",
): RallyShot => ({
  hand: "forehand",
  kind,
  startZ: -targetZ,
  targetZ,
  bounceAt: kind === "drive" ? 0.66 : 0.75,
  spinRate: kind === "drive" ? -18 : 12,
});

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

  it("holds zoom inside its limits", () => {
    expect(clampZoom(ZOOM_DEFAULT)).toBe(ZOOM_DEFAULT);
    expect(clampZoom(99)).toBe(ZOOM_MAX);
    expect(clampZoom(0)).toBe(ZOOM_MIN);
    expect(clampZoom(-4)).toBe(ZOOM_MIN);
    // A NaN from a degenerate gesture must not poison the camera distance.
    expect(clampZoom(Number.NaN)).toBe(ZOOM_DEFAULT);
    expect(ZOOM_MIN).toBeLessThan(ZOOM_DEFAULT);
    expect(ZOOM_MAX).toBeGreaterThan(ZOOM_DEFAULT);
  });

  it("zooms in on scroll up and out on scroll down", () => {
    expect(wheelZoomFactor(-100)).toBeGreaterThan(1);
    expect(wheelZoomFactor(100)).toBeLessThan(1);
    expect(wheelZoomFactor(0)).toBe(1);
  });

  it("returns to the same zoom after scrolling in and back out", () => {
    // Exponential steps compose, so the split across events cannot matter.
    const oneStep = wheelZoomFactor(-120) * wheelZoomFactor(120);
    const split =
      wheelZoomFactor(-40) * wheelZoomFactor(-80) * wheelZoomFactor(120);

    expect(oneStep).toBeCloseTo(1, 10);
    expect(split).toBeCloseTo(1, 10);
  });

  it("treats line and page wheel modes as larger travel than pixels", () => {
    // A line-mode notch of 3 moves far more than 3 pixels would.
    expect(wheelZoomFactor(3, 1)).toBeLessThan(wheelZoomFactor(3, 0));
    expect(wheelZoomFactor(1, 2)).toBeLessThan(wheelZoomFactor(1, 1));
  });

  it("caps a single wheel event so a trackpad fling stays gentle", () => {
    // Beyond the cap every event lands on the same step.
    expect(wheelZoomFactor(4000)).toBe(wheelZoomFactor(240));
    expect(wheelZoomFactor(-4000)).toBe(wheelZoomFactor(-240));
    expect(wheelZoomFactor(4000)).toBeGreaterThan(0);
  });

  it("hands the wheel back to the page at either zoom limit", () => {
    // Pinned at the ceiling and still zooming in: the page must scroll on.
    expect(wheelReleasesToPage(ZOOM_MAX, wheelZoomFactor(-100))).toBe(true);
    expect(wheelReleasesToPage(ZOOM_MIN, wheelZoomFactor(100))).toBe(true);
    // Room left in that direction, so the scene consumes the event.
    expect(wheelReleasesToPage(ZOOM_MAX, wheelZoomFactor(100))).toBe(false);
    expect(wheelReleasesToPage(ZOOM_DEFAULT, wheelZoomFactor(-100))).toBe(
      false,
    );
  });

  it("zooms by the ratio the pinch span changed", () => {
    expect(pinchZoomFactor(100, 200)).toBeCloseTo(2);
    expect(pinchZoomFactor(200, 100)).toBeCloseTo(0.5);
    expect(pinchZoomFactor(150, 150)).toBeCloseTo(1);
    // A missing or degenerate span holds still instead of snapping.
    expect(pinchZoomFactor(0, 120)).toBe(1);
    expect(pinchZoomFactor(120, 0)).toBe(1);
  });

  it("only blocks a course once the run reaches the limit", () => {
    expect(blockedCourseSide([])).toBeUndefined();
    expect(blockedCourseSide([shotFixture(0.8)])).toBeUndefined();
    // Two to the same side blocks that side for the next shot.
    expect(blockedCourseSide([shotFixture(0.8), shotFixture(0.6)])).toBe(1);
    expect(blockedCourseSide([shotFixture(-0.8), shotFixture(-0.6)])).toBe(-1);
    // A run that already alternates leaves the next shot free.
    expect(
      blockedCourseSide([shotFixture(0.8), shotFixture(-0.6)]),
    ).toBeUndefined();
    // Only the tail counts, not older shots.
    expect(
      blockedCourseSide([
        shotFixture(0.8),
        shotFixture(0.8),
        shotFixture(-0.6),
      ]),
    ).toBeUndefined();
  });

  it("only blocks a stroke once the run reaches the limit", () => {
    expect(blockedStroke([])).toBeUndefined();
    expect(blockedStroke([shotFixture(0.8, "cut")])).toBeUndefined();
    expect(
      blockedStroke([shotFixture(0.8, "drive"), shotFixture(-0.6, "drive")]),
    ).toBe("drive");
    expect(
      blockedStroke([shotFixture(0.8, "cut"), shotFixture(-0.6, "cut")]),
    ).toBe("cut");
    expect(
      blockedStroke([shotFixture(0.8, "drive"), shotFixture(-0.6, "cut")]),
    ).toBeUndefined();
  });

  it("turns the third shot away from a repeated course and stroke", () => {
    // This random would otherwise ask for a positive course and a cut again.
    const recent = [shotFixture(0.9, "cut"), shotFixture(0.7, "cut")];
    const shot = createRallyShot(-0.5, "left", () => 0.9, recent);

    expect(shot.targetZ).toBeLessThan(0);
    expect(shot.kind).toBe("drive");
  });

  it("leaves the third shot alone when the run already varies", () => {
    const recent = [shotFixture(0.9, "cut"), shotFixture(-0.7, "drive")];
    const shot = createRallyShot(-0.5, "left", () => 0.9, recent);

    // Nothing is blocked, so the random choice stands.
    expect(shot.targetZ).toBeGreaterThan(0);
    expect(shot.kind).toBe("cut");
  });

  it("never repeats a course or a stroke three times across a long rally", () => {
    // A deterministic sequence so a failure is reproducible.
    let seed = 20260817;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };

    const plan: RallyShot[] = [];
    let startZ = 0.72;
    for (let index = 0; index < 200; index += 1) {
      const shot = createRallyShot(
        startZ,
        index % 2 === 0 ? "left" : "right",
        random,
        plan.slice(-MAX_REPEATED_SHOTS),
      );
      plan.push(shot);
      startZ = shot.targetZ;
    }

    const courses = plan.map((shot) => (shot.targetZ >= 0 ? "right" : "left"));
    const kinds = plan.map((shot) => shot.kind);
    for (let index = 2; index < plan.length; index += 1) {
      expect(new Set(courses.slice(index - 2, index + 1)).size).toBeGreaterThan(
        1,
      );
      expect(new Set(kinds.slice(index - 2, index + 1)).size).toBeGreaterThan(
        1,
      );
    }
    // The rally still uses both strokes rather than locking into an alternation.
    expect(new Set(kinds).size).toBe(2);
  });

  it("measures the span between two touches", () => {
    expect(touchSpan({ x: 0, y: 0 }, { x: 3, y: 4 })).toBeCloseTo(5);
    expect(touchSpan({ x: 3, y: 4 }, { x: 0, y: 0 })).toBeCloseTo(5);
    expect(touchSpan({ x: 2, y: 2 }, { x: 2, y: 2 })).toBe(0);
  });
});
