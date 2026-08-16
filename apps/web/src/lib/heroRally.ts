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

export const createRallyShot = (
  startZ: number,
  side: RallySide,
  random: () => number = Math.random,
): RallyShot => {
  let targetZ = (random() < 0.5 ? -1 : 1) * (0.48 + random() * 0.88);
  if (Math.abs(targetZ - startZ) < 0.38) targetZ *= -1;
  const kind: RallyStroke = random() < 0.68 ? "drive" : "cut";

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
