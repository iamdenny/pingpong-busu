export type RallyHand = "forehand" | "backhand";
export type RallySide = "left" | "right";
export type RallyStroke = "drive" | "cut";

export interface RallyShot {
  hand: RallyHand;
  kind: RallyStroke;
  startZ: number;
  targetZ: number;
  bounceAt: number;
  spinRate: number;
}

export interface RallyPoint {
  x: number;
  y: number;
  z: number;
}

export interface RallyVector3 {
  x: number;
  y: number;
  z: number;
}

export const handForLane = (laneZ: number, side: RallySide): RallyHand =>
  side === "left"
    ? laneZ >= 0
      ? "forehand"
      : "backhand"
    : laneZ <= 0
      ? "forehand"
      : "backhand";

/**
 * How many shots in a row may share a course or a stroke. A third repeat
 * reads as the rally being stuck rather than as a pattern, so the next shot
 * is forced to change.
 */
export const MAX_REPEATED_SHOTS = 2;

/** Whether a shot is played down the line or across the table. */
export type RallyLine = "straight" | "diagonal";

/**
 * Share of unforced shots played down the line. Cross-court is the natural
 * majority in a rally, so straight shots stay the accent rather than the rule.
 */
export const STRAIGHT_SHARE = 0.4;

/** Which half of the table a shot is aimed at. */
const courseSide = (targetZ: number): number => (targetZ >= 0 ? 1 : -1);

/**
 * The line a shot travelled. A ball aimed at the side it arrived from stays in
 * its lane and goes straight; anything else crosses the table.
 */
export const shotLine = (startZ: number, targetZ: number): RallyLine =>
  courseSide(startZ) === courseSide(targetZ) ? "straight" : "diagonal";

const runTail = (recent: readonly RallyShot[]): readonly RallyShot[] => {
  const tail = recent.slice(-MAX_REPEATED_SHOTS);
  return tail.length === MAX_REPEATED_SHOTS ? tail : [];
};

/**
 * The course the next shot must avoid, or `undefined` when the run is still
 * short enough to leave the choice to chance.
 */
export const blockedCourseSide = (
  recent: readonly RallyShot[],
): number | undefined => {
  const tail = runTail(recent);
  const [first] = tail;
  if (!first) return undefined;
  const side = courseSide(first.targetZ);
  return tail.every((shot) => courseSide(shot.targetZ) === side)
    ? side
    : undefined;
};

/** The stroke the next shot must avoid, on the same rule as the course. */
export const blockedStroke = (
  recent: readonly RallyShot[],
): RallyStroke | undefined => {
  const tail = runTail(recent);
  const [first] = tail;
  if (!first) return undefined;
  return tail.every((shot) => shot.kind === first.kind)
    ? first.kind
    : undefined;
};

export const createRallyShot = (
  startZ: number,
  side: RallySide,
  random: () => number = Math.random,
  recent: readonly RallyShot[] = [],
): RallyShot => {
  // The course side is the whole shape of the shot: aiming at the side the
  // ball came from plays it down the line, the far side plays it across.
  const arrivingSide = courseSide(startZ);
  const avoidCourse = blockedCourseSide(recent);
  const targetSide =
    avoidCourse !== undefined
      ? -avoidCourse
      : random() < STRAIGHT_SHARE
        ? arrivingSide
        : -arrivingSide;
  const targetZ = targetSide * (0.48 + random() * 0.88);
  const avoidStroke = blockedStroke(recent);
  const kind: RallyStroke =
    avoidStroke === "drive"
      ? "cut"
      : avoidStroke === "cut"
        ? "drive"
        : random() < 0.68
          ? "drive"
          : "cut";

  return {
    hand: handForLane(startZ, side),
    kind,
    startZ,
    targetZ,
    bounceAt:
      kind === "drive" ? 0.64 + random() * 0.04 : 0.73 + random() * 0.04,
    spinRate: kind === "drive" ? -(17 + random() * 3) : 11 + random() * 3,
  };
};

export const sampleRallyPoint = (
  shot: RallyShot,
  progress: number,
  outbound: boolean,
): RallyPoint => {
  const clampedProgress = Math.min(1, Math.max(0, progress));
  const startX = outbound ? -4.95 : 4.95;
  const endX = -startX;
  const bounceY = 1.58;
  const contactY = 2.58;
  let y: number;

  if (clampedProgress <= shot.bounceAt) {
    const phase = clampedProgress / shot.bounceAt;
    const clearanceArc = shot.kind === "drive" ? 0.78 : 0.6;
    const linearDescent = contactY + (bounceY - contactY) * phase;
    y = linearDescent + clearanceArc * 4 * phase * (1 - phase);
  } else {
    const phase = (clampedProgress - shot.bounceAt) / (1 - shot.bounceAt);
    y = bounceY + (contactY - bounceY) * (2 * phase - phase * phase);
  }

  return {
    x: startX + (endX - startX) * clampedProgress,
    y,
    z: shot.startZ + (shot.targetZ - shot.startZ) * clampedProgress,
  };
};

/**
 * Height of the blade relative to its ready position across the swing.
 * `swingPhase` runs -1 (start of the backswing) through 0 (contact) to 1 (end
 * of the follow-through).
 *
 * A drive is carried in from above: the blade sits high on the backswing,
 * drops onto the ball at contact, then lifts through for topspin. A cut simply
 * falls from high to low.
 */
export const verticalSwingOffset = (
  stroke: RallyStroke,
  swingPhase: number,
): number => {
  if (stroke === "cut") return -swingPhase * 0.34;
  return swingPhase >= 0 ? swingPhase * 0.4 : swingPhase * -0.26;
};

/**
 * Travel toward the net across the swing, in the same phase space as
 * {@link verticalSwingOffset}. Negative values draw the blade back behind the
 * ready position, positive values push it through the ball. Drives punch
 * further forward than cuts.
 */
export const forwardSwingOffset = (
  stroke: RallyStroke,
  swingPhase: number,
): number => (stroke === "drive" ? 0.38 : 0.22) * swingPhase;

/**
 * Roll applied to the blade around its own face normal, in the player frame
 * shared by both sides. The handle trails toward the body, so a forehand hit
 * out on the playing-hand side keeps the handle pointing back across the body
 * and a backhand mirrors it. Both players use the same value: their rigs are
 * already mirrored by the face rotation, so branching per side would cancel
 * that mirror and leave one player holding the paddle backwards.
 */
export const bladeRollForHand = (hand: RallyHand): number =>
  hand === "forehand" ? Math.PI / 2 : -Math.PI / 2;

/**
 * Extra roll through contact. Drives brush upward so the blade tip rises,
 * cuts brush downward. Both are expressed in the same player frame as
 * {@link bladeRollForHand}, so neither depends on the side.
 */
export const swingRollOffset = (
  stroke: RallyStroke,
  swingPhase: number,
): number => (stroke === "drive" ? -swingPhase * 0.42 : swingPhase * 0.36);

/** How far the blade is closed on a drive, and opened on a cut, at contact. */
export const BLADE_PITCH_DEGREES = 20;

/**
 * Pitch of the blade around its horizontal axis, in radians.
 *
 * Positive closes the face — the top edge leans forward over the ball, which
 * is how a drive is struck. Negative opens it, presenting the face upward for
 * a cut. The sign works out the same for both players: their rigs are mirrored
 * by a quarter turn about Y, which flips the pitch axis along with the face,
 * so a single value keeps them symmetric.
 *
 * The blade is squarer on the backswing and reaches the full angle by contact.
 */
export const bladePitch = (stroke: RallyStroke, swingPhase: number): number => {
  const target =
    ((stroke === "drive" ? BLADE_PITCH_DEGREES : -BLADE_PITCH_DEGREES) *
      Math.PI) /
    180;
  const shaping = swingPhase < 0 ? 0.55 + 0.45 * (1 + swingPhase) : 1;
  return target * shaping;
};

/** Exponential drag applied to a flick, in inverse seconds. */
export const SPIN_FRICTION = 2.4;
/** Below this angular speed (rad/s) a flick is treated as stopped. */
export const SPIN_MIN_VELOCITY = 0.14;
/** Angular speed (rad/s) a single flick can reach, so a fast drag stays readable. */
export const SPIN_MAX_VELOCITY = 7.5;
/**
 * A pointer that has been still for longer than this before release is a
 * placement, not a flick, so it must not fling the scene.
 */
export const SPIN_RELEASE_GRACE_MS = 90;

/**
 * Angular speed to carry over when the pointer is released, from the last
 * rotation step and how long it took. Clamped so a single fast swipe cannot
 * spin the table faster than the eye can follow.
 */
export const flickVelocity = (
  angleRadians: number,
  deltaSeconds: number,
  maxVelocity = SPIN_MAX_VELOCITY,
): number => {
  if (deltaSeconds <= 0 || angleRadians <= 0) return 0;
  return Math.min(maxVelocity, angleRadians / deltaSeconds);
};

/**
 * Frame-rate independent friction. Halving the frame time halves the work per
 * step but leaves the speed after a given wall-clock duration unchanged.
 */
export const decaySpinVelocity = (
  velocity: number,
  deltaSeconds: number,
  friction = SPIN_FRICTION,
): number => velocity * Math.exp(-friction * Math.max(0, deltaSeconds));

/**
 * Zoom is a multiplier on the framed camera distance: 1 is the default
 * framing, larger pulls the camera in. The ceiling stops short of the table
 * so a hard zoom cannot punch the near plane through the playing surface.
 */
export const ZOOM_MIN = 0.8;
export const ZOOM_MAX = 2.2;
export const ZOOM_DEFAULT = 1;

export const clampZoom = (zoom: number): number =>
  Number.isFinite(zoom)
    ? Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom))
    : ZOOM_DEFAULT;

/** Pixels a single line- or page-mode wheel notch stands for. */
const WHEEL_LINE_PIXELS = 16;
const WHEEL_PAGE_PIXELS = 400;
/** Largest wheel travel honoured in one event, so a trackpad fling is gentle. */
const WHEEL_MAX_PIXELS = 240;
const WHEEL_SENSITIVITY = 0.0015;

/**
 * Multiplicative zoom step for one wheel event. Scrolling up (negative
 * `deltaY`) zooms in. The result is exponential in the scroll distance, so
 * zooming in and back out by the same travel lands on the original level
 * regardless of how the travel was split across events.
 */
export const wheelZoomFactor = (deltaY: number, deltaMode = 0): number => {
  if (!Number.isFinite(deltaY) || deltaY === 0) return 1;
  const scale =
    deltaMode === 1
      ? WHEEL_LINE_PIXELS
      : deltaMode === 2
        ? WHEEL_PAGE_PIXELS
        : 1;
  const pixels = Math.max(
    -WHEEL_MAX_PIXELS,
    Math.min(WHEEL_MAX_PIXELS, deltaY * scale),
  );
  return Math.exp(-pixels * WHEEL_SENSITIVITY);
};

/**
 * Zoom ratio between two two-finger spans. Spreading the fingers zooms in.
 * A missing or degenerate span leaves the zoom untouched rather than
 * snapping, which is what a stray third touch tends to produce.
 */
export const pinchZoomFactor = (
  previousSpan: number,
  currentSpan: number,
): number =>
  previousSpan > 0 && currentSpan > 0 && Number.isFinite(currentSpan)
    ? currentSpan / previousSpan
    : 1;

/** Distance between two active touch points, in the same units as the input. */
export const touchSpan = (
  first: { x: number; y: number },
  second: { x: number; y: number },
): number => Math.hypot(second.x - first.x, second.y - first.y);

/**
 * Whether a wheel step should be handed back to the page instead of consumed.
 * At either zoom limit the scene has nothing left to give, so the hero must
 * not trap the scroll — the page keeps moving as the reader expects.
 */
export const wheelReleasesToPage = (zoom: number, factor: number): boolean =>
  clampZoom(clampZoom(zoom) * factor) === clampZoom(zoom);

export const projectArcballPoint = (
  normalizedX: number,
  normalizedY: number,
): RallyVector3 => {
  const lengthSquared = normalizedX * normalizedX + normalizedY * normalizedY;
  if (lengthSquared <= 1) {
    return {
      x: normalizedX,
      y: normalizedY,
      z: Math.sqrt(1 - lengthSquared),
    };
  }

  const inverseLength = 1 / Math.sqrt(lengthSquared);
  return {
    x: normalizedX * inverseLength,
    y: normalizedY * inverseLength,
    z: 0,
  };
};

export const keepsTableTopVisible = (
  tableNormal: RallyVector3,
  viewerDirection: RallyVector3,
  minimumFacing = 0.12,
): boolean =>
  tableNormal.x * viewerDirection.x +
    tableNormal.y * viewerDirection.y +
    tableNormal.z * viewerDirection.z >=
  minimumFacing;
