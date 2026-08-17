import { Volume2, VolumeX } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  bladePitch,
  bladeRollForHand,
  createRallyShot,
  decaySpinVelocity,
  flickVelocity,
  forwardSwingOffset,
  clampPitch,
  pitchLimitsForViewer,
  sampleRallyPoint,
  shortestTurn,
  swingRollOffset,
  verticalSwingOffset,
  clampZoom,
  pinchCenter,
  pinchZoomFactor,
  touchSpan,
  wheelReleasesToPage,
  wheelZoomFactor,
  PITCH_PER_PIXEL,
  SPIN_MIN_VELOCITY,
  SPIN_RELEASE_GRACE_MS,
  YAW_PER_PIXEL,
  ZOOM_DEFAULT,
  type RallyShot,
} from "../lib/heroRally";
import {
  createRallyAudio,
  crossedBounce,
  impactStrength,
  type RallyAudio,
} from "../lib/heroRallyAudio";

const LEG_DURATION_SECONDS = 1.08;

export function HeroRallyScene() {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  /**
   * Impact sound is off until the reader asks for it. A hero that starts
   * making noise on load is hostile, and Safari will not start an audio
   * context outside a user gesture anyway.
   */
  const audioRef = useRef<RallyAudio | undefined>(undefined);
  const [soundOn, setSoundOn] = useState(false);

  const toggleSound = useCallback(() => {
    if (soundOn) {
      audioRef.current?.close();
      audioRef.current = undefined;
      setSoundOn(false);
      return;
    }
    const audio = audioRef.current ?? createRallyAudio();
    if (!audio) return;
    audioRef.current = audio;
    void audio.resume().then(
      () => setSoundOn(true),
      () => setSoundOn(false),
    );
  }, [soundOn]);

  useEffect(() => () => audioRef.current?.close(), []);

  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas) return;

    const markUnavailable = () => {
      delete root.dataset.ready;
      delete root.dataset.resetState;
      delete root.dataset.dragging;
      root.dataset.unavailable = "true";
    };
    if (!("WebGLRenderingContext" in window)) {
      markUnavailable();
      return;
    }

    let cancelled = false;
    let disposeScene: (() => void) | undefined;

    void import("three")
      .then((THREE) => {
        if (cancelled) return;

        let renderer: InstanceType<typeof THREE.WebGLRenderer>;
        try {
          renderer = new THREE.WebGLRenderer({
            canvas,
            antialias: true,
            alpha: true,
            powerPreference: "high-performance",
          });
        } catch {
          markUnavailable();
          return;
        }

        const cleanupSteps: Array<() => void> = [];
        let disposed = false;
        const cleanupScene = () => {
          if (disposed) return;
          disposed = true;
          for (const cleanup of cleanupSteps.reverse()) {
            try {
              cleanup();
            } catch {
              // Cleanup is best-effort so later resources are still released.
            }
          }
        };
        disposeScene = cleanupScene;
        cleanupSteps.push(() => renderer.dispose());
        cleanupSteps.push(() => {
          delete root.dataset.ready;
          delete root.dataset.resetState;
          delete root.dataset.dragging;
        });

        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFShadowMap;
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.08;

        const scene = new THREE.Scene();
        cleanupSteps.push(() => {
          scene.traverse((object) => {
            if (!(object instanceof THREE.Mesh)) return;
            object.geometry.dispose();
            const materials = Array.isArray(object.material)
              ? object.material
              : [object.material];
            for (const material of materials) material.dispose();
          });
        });

        const rallyWorld = new THREE.Group();
        const rallyContent = new THREE.Group();
        rallyWorld.position.y = 1.35;
        rallyContent.position.y = -1.35;
        rallyWorld.add(rallyContent);
        scene.add(rallyWorld);

        const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 70);
        const cameraBase = new THREE.Vector3(0, 5.15, 8.8);
        const cameraTarget = new THREE.Vector2();
        const cameraCurrent = new THREE.Vector2();
        const cameraFocusY = 1.95;
        const cameraLookAt = new THREE.Vector3(0, cameraFocusY, 0);
        let cameraPanX = 0.88;
        let cameraPanY = 0.46;
        let pointerBounds = {
          left: 0,
          top: 0,
          width: 1,
          height: 1,
        };
        camera.position.copy(cameraBase);
        camera.lookAt(cameraLookAt);

        scene.add(new THREE.HemisphereLight(0xffffff, 0xa8b6cb, 2.2));
        const sun = new THREE.DirectionalLight(0xffffff, 3.1);
        sun.position.set(-4, 10, 7);
        sun.castShadow = true;
        sun.shadow.mapSize.set(1024, 1024);
        sun.shadow.camera.left = -8;
        sun.shadow.camera.right = 8;
        sun.shadow.camera.top = 7;
        sun.shadow.camera.bottom = -5;
        scene.add(sun);

        const floor = new THREE.Mesh(
          new THREE.PlaneGeometry(32, 24),
          new THREE.ShadowMaterial({
            color: 0x64748b,
            opacity: 0.08,
            transparent: true,
          }),
        );
        floor.rotation.x = -Math.PI / 2;
        floor.receiveShadow = true;
        scene.add(floor);

        const table = new THREE.Group();
        const tableTopMaterial = new THREE.MeshStandardMaterial({
          color: 0x4b7ff0,
          roughness: 0.7,
        });
        const tableEdgeMaterial = new THREE.MeshStandardMaterial({
          color: 0x234fae,
          roughness: 0.58,
        });
        const top = new THREE.Mesh(new THREE.BoxGeometry(9, 0.22, 5), [
          tableEdgeMaterial,
          tableEdgeMaterial,
          tableTopMaterial,
          tableEdgeMaterial,
          tableEdgeMaterial,
          tableEdgeMaterial,
        ]);
        top.position.y = 1.31;
        top.castShadow = true;
        top.receiveShadow = true;
        table.add(top);

        const lineMaterial = new THREE.MeshStandardMaterial({
          color: 0xffffff,
          roughness: 0.76,
        });
        const centerLine = new THREE.Mesh(
          new THREE.BoxGeometry(8.92, 0.012, 0.035),
          lineMaterial,
        );
        centerLine.position.set(0, 1.427, 0);
        table.add(centerLine);
        for (const z of [-2.44, 2.44]) {
          const edgeLine = new THREE.Mesh(
            new THREE.BoxGeometry(8.92, 0.014, 0.045),
            lineMaterial,
          );
          edgeLine.position.set(0, 1.43, z);
          table.add(edgeLine);
        }

        const legMaterial = new THREE.MeshStandardMaterial({
          color: 0x64748b,
          roughness: 0.52,
          metalness: 0.24,
        });
        for (const x of [-3.5, 3.5]) {
          for (const z of [-1.85, 1.85]) {
            const leg = new THREE.Mesh(
              new THREE.BoxGeometry(0.18, 1.28, 0.18),
              legMaterial,
            );
            leg.position.set(x, 0.64, z);
            leg.castShadow = true;
            table.add(leg);
          }
        }

        const postMaterial = new THREE.MeshStandardMaterial({
          color: 0x334155,
          roughness: 0.44,
          metalness: 0.22,
        });
        const netMaterial = new THREE.MeshStandardMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.62,
          roughness: 0.74,
          side: THREE.DoubleSide,
          wireframe: true,
        });
        const net = new THREE.Group();
        const netSheet = new THREE.Mesh(
          new THREE.PlaneGeometry(5.06, 0.68, 20, 5),
          netMaterial,
        );
        netSheet.rotation.y = Math.PI / 2;
        netSheet.position.y = 1.78;
        net.add(netSheet);
        for (const z of [-2.58, 2.58]) {
          const post = new THREE.Mesh(
            new THREE.CylinderGeometry(0.055, 0.055, 0.9, 12),
            postMaterial,
          );
          post.position.set(0, 1.73, z);
          post.castShadow = true;
          net.add(post);
        }
        const tape = new THREE.Mesh(
          new THREE.BoxGeometry(0.045, 0.045, 5.16),
          lineMaterial,
        );
        tape.position.y = 2.12;
        net.add(tape);
        table.add(net);
        rallyContent.add(table);

        const paddleShape = new THREE.Shape();
        paddleShape.moveTo(0, 1.08);
        paddleShape.bezierCurveTo(0.72, 1.08, 0.98, 0.55, 0.92, -0.08);
        paddleShape.bezierCurveTo(0.88, -0.7, 0.48, -1.02, 0, -1.08);
        paddleShape.bezierCurveTo(-0.48, -1.02, -0.88, -0.7, -0.92, -0.08);
        paddleShape.bezierCurveTo(-0.98, 0.55, -0.72, 1.08, 0, 1.08);

        const bladeEdgeMaterial = new THREE.MeshStandardMaterial({
          color: 0xc49155,
          roughness: 0.62,
        });
        const redRubber = new THREE.MeshPhysicalMaterial({
          color: 0xd94a54,
          roughness: 0.86,
          clearcoat: 0.05,
          clearcoatRoughness: 0.76,
        });
        const blackRubber = new THREE.MeshPhysicalMaterial({
          color: 0x1f2937,
          roughness: 0.84,
          clearcoat: 0.04,
          clearcoatRoughness: 0.78,
        });
        const handleMaterial = new THREE.MeshStandardMaterial({
          color: 0xc78b45,
          roughness: 0.62,
        });

        const createPaddleRig = () => {
          const rig = new THREE.Group();
          const model = new THREE.Group();
          const edgeGeometry = new THREE.ExtrudeGeometry(paddleShape, {
            depth: 0.13,
            bevelEnabled: true,
            bevelSegments: 2,
            bevelSize: 0.035,
            bevelThickness: 0.025,
            curveSegments: 24,
          });
          edgeGeometry.translate(0, 0, -0.065);
          const edge = new THREE.Mesh(edgeGeometry, bladeEdgeMaterial);
          edge.castShadow = true;
          model.add(edge);

          const faceGeometry = new THREE.ShapeGeometry(paddleShape, 28);
          const front = new THREE.Mesh(faceGeometry, redRubber);
          front.position.z = 0.096;
          model.add(front);
          const back = new THREE.Mesh(faceGeometry, blackRubber);
          back.position.z = -0.096;
          back.rotation.y = Math.PI;
          model.add(back);

          const neck = new THREE.Mesh(
            new THREE.BoxGeometry(0.42, 0.38, 0.19),
            handleMaterial,
          );
          neck.position.y = -1.05;
          neck.castShadow = true;
          model.add(neck);
          const handle = new THREE.Mesh(
            new THREE.BoxGeometry(0.38, 1.22, 0.25, 3, 5, 2),
            handleMaterial,
          );
          handle.position.y = -1.72;
          handle.castShadow = true;
          model.add(handle);

          model.scale.setScalar(0.72);
          model.userData.front = front;
          model.userData.back = back;
          rig.add(model);
          rig.userData.model = model;
          return rig;
        };

        const leftPaddle = createPaddleRig();
        const rightPaddle = createPaddleRig();
        rallyContent.add(leftPaddle, rightPaddle);

        const ballGroup = new THREE.Group();
        const ball = new THREE.Mesh(
          new THREE.SphereGeometry(0.13, 24, 16),
          new THREE.MeshStandardMaterial({
            color: 0xfff3a8,
            roughness: 0.44,
            emissive: 0x7a5a00,
            emissiveIntensity: 0.09,
          }),
        );
        ball.castShadow = true;
        ballGroup.add(ball);
        ballGroup.add(
          new THREE.Mesh(
            new THREE.TorusGeometry(0.131, 0.008, 6, 32),
            new THREE.MeshBasicMaterial({
              color: 0x165dff,
              transparent: true,
              opacity: 0.72,
            }),
          ),
        );

        const arrowMaterial = new THREE.MeshBasicMaterial({
          color: 0x0f46ca,
          transparent: true,
          opacity: 0.74,
          depthTest: false,
        });
        const createSpinArrow = (direction: number) => {
          const points = Array.from({ length: 19 }, (_, index) => {
            const progress = index / 18;
            const angle =
              (-Math.PI * 0.72 + progress * Math.PI * 1.42) * direction;
            return new THREE.Vector3(
              Math.cos(angle) * 0.245,
              Math.sin(angle) * 0.245,
              0.02,
            );
          });
          const curve = new THREE.CatmullRomCurve3(points);
          const arrow = new THREE.Group();
          const shaft = new THREE.Mesh(
            new THREE.TubeGeometry(curve, 24, 0.014, 6, false),
            arrowMaterial,
          );
          shaft.renderOrder = 8;
          arrow.add(shaft);
          const tip = new THREE.Mesh(
            new THREE.ConeGeometry(0.04, 0.105, 10),
            arrowMaterial,
          );
          tip.position.copy(curve.getPointAt(1));
          tip.quaternion.setFromUnitVectors(
            new THREE.Vector3(0, 1, 0),
            curve.getTangentAt(1).normalize(),
          );
          tip.renderOrder = 8;
          arrow.add(tip);
          return arrow;
        };
        const clockwiseArrow = createSpinArrow(-1);
        const counterClockwiseArrow = createSpinArrow(1);
        ballGroup.add(clockwiseArrow, counterClockwiseArrow);
        rallyContent.add(ballGroup);

        const trailMaterial = new THREE.MeshBasicMaterial({
          color: 0xf1c84b,
          transparent: true,
          opacity: 0.16,
        });
        const trail = Array.from({ length: 5 }, (_, index) => {
          const dot = new THREE.Mesh(
            new THREE.SphereGeometry(0.09 - index * 0.009, 12, 8),
            trailMaterial.clone(),
          );
          dot.material.opacity = 0.15 - index * 0.022;
          rallyContent.add(dot);
          return dot;
        });
        const history = Array.from(
          { length: 26 },
          () => new THREE.Vector3(-4.95, 2.55, 0.72),
        );

        const rallyPlan: RallyShot[] = [];
        let rallyPlanStartIndex = 0;
        const ensureShot = (shotIndex: number): RallyShot => {
          while (rallyPlanStartIndex + rallyPlan.length <= shotIndex) {
            const previousShot = rallyPlan.at(-1);
            const startZ = previousShot?.targetZ ?? 0.72;
            const nextIndex = rallyPlanStartIndex + rallyPlan.length;
            rallyPlan.push(
              createRallyShot(
                startZ,
                nextIndex % 2 === 0 ? "left" : "right",
                Math.random,
                // The retained window is the run the anti-repeat rule reads.
                rallyPlan,
              ),
            );
          }
          while (rallyPlan.length > 2 && rallyPlanStartIndex < shotIndex) {
            rallyPlan.shift();
            rallyPlanStartIndex += 1;
          }
          const shot = rallyPlan[shotIndex - rallyPlanStartIndex];
          if (!shot) throw new Error("랠리 타구를 생성하지 못했습니다.");
          return shot;
        };

        const leftBase = new THREE.Vector3(-5.16, 2.42, 0);
        const rightBase = new THREE.Vector3(5.16, 2.42, 0);
        const tempEuler = new THREE.Euler();
        const tempQuaternion = new THREE.Quaternion();
        const worldUpAxis = new THREE.Vector3(0, 1, 0);
        const worldRightAxis = new THREE.Vector3(1, 0, 0);
        const yawQuaternion = new THREE.Quaternion();
        const pitchQuaternion = new THREE.Quaternion();
        // Frames the table top, net and paddle blades. The legs and the floor
        // shadow are allowed to crop so the rally fills the wide hero stage.
        const fitHalfExtents = new THREE.Vector3(5.6, 1.25, 2.55);
        const fitAxisX = new THREE.Vector3();
        const fitAxisY = new THREE.Vector3();
        const fitAxisZ = new THREE.Vector3();
        const cameraRight = new THREE.Vector3();
        const cameraUp = new THREE.Vector3();
        const cameraBackward = new THREE.Vector3();
        const timer = new THREE.Timer();
        timer.connect(document);
        cleanupSteps.push(() => timer.dispose());
        const reducedMotion = window.matchMedia(
          "(prefers-reduced-motion: reduce)",
        );
        let elapsed = 0;
        let running = !reducedMotion.matches && !document.hidden;
        /** Leg and progress the last impact sound was played for. */
        let lastSoundedShot: number | undefined;
        let lastSoundedProgress = 0;
        let frame = 0;
        let resetTimer: number | undefined;
        let resetStartedAt = 0;
        let resettingWorld = false;
        /** Multiplier on the framed camera distance; 1 is the default view. */
        let zoomLevel = ZOOM_DEFAULT;
        let resetFromZoom = ZOOM_DEFAULT;
        let hasSetInitialPaddlePose = false;
        /**
         * The steer is a turntable: yaw spins the table about its own up axis
         * and never runs out, pitch tilts it about the camera's horizontal
         * axis and is clamped so the underside stays hidden. Keeping them
         * apart is what lets a tilted table still be spun sideways — a single
         * combined rotation has to reject the whole step at the tilt limit,
         * taking the reader's sideways turn down with it.
         */
        let worldYaw = 0;
        let worldPitch = 0;
        let resetFromYaw = 0;
        let resetFromPitch = 0;
        // Flick momentum, one decaying velocity per steer axis.
        const viewerDirection = new THREE.Vector3();
        let yawVelocity = 0;
        let pitchVelocity = 0;
        let spinningWorld = false;
        let lastDragMoveAt = 0;

        const currentPitchLimits = () => {
          viewerDirection
            .copy(camera.position)
            .sub(rallyWorld.position)
            .normalize();
          return pitchLimitsForViewer(viewerDirection.y, viewerDirection.z);
        };
        const applyWorldRotation = () => {
          yawQuaternion.setFromAxisAngle(worldUpAxis, worldYaw);
          pitchQuaternion.setFromAxisAngle(worldRightAxis, worldPitch);
          rallyWorld.quaternion
            .copy(pitchQuaternion)
            .multiply(yawQuaternion)
            .normalize();
        };
        cleanupSteps.push(() => {
          running = false;
          cancelAnimationFrame(frame);
          if (resetTimer !== undefined) window.clearTimeout(resetTimer);
        });

        const smoothPulse = (distance: number, radius: number) => {
          const value = Math.max(0, 1 - distance / radius);
          return value * value * (3 - 2 * value);
        };

        const setPaddlePose = (
          paddle: InstanceType<typeof THREE.Group>,
          side: "left" | "right",
          hit: number,
          shot: RallyShot,
          laneZ: number,
          swingPhase: number,
          blend: number,
        ) => {
          const isLeft = side === "left";
          const base = isLeft ? leftBase : rightBase;
          const toward = isLeft ? 1 : -1;
          paddle.position.lerp(
            new THREE.Vector3(
              base.x +
                toward *
                  (hit * 0.16 + forwardSwingOffset(shot.kind, swingPhase)),
              base.y + verticalSwingOffset(shot.kind, swingPhase),
              laneZ,
            ),
            blend,
          );

          const faceAngle = isLeft ? Math.PI / 2 : -Math.PI / 2;
          const baseRoll = bladeRollForHand(shot.hand);
          const swingOffset = swingRollOffset(shot.kind, swingPhase);
          const pitch = bladePitch(shot.kind, swingPhase);
          tempEuler.set(pitch, faceAngle, 0, "YXZ");
          tempQuaternion.setFromEuler(tempEuler);
          paddle.quaternion.slerp(tempQuaternion, blend);

          const model = paddle.userData.model as InstanceType<
            typeof THREE.Group
          >;
          const front = model.userData.front as InstanceType<typeof THREE.Mesh>;
          const back = model.userData.back as InstanceType<typeof THREE.Mesh>;
          model.rotation.z = THREE.MathUtils.lerp(
            model.rotation.z,
            baseRoll + swingOffset,
            blend,
          );
          front.material = shot.hand === "forehand" ? redRubber : blackRubber;
          back.material = shot.hand === "forehand" ? blackRubber : redRubber;
        };

        const applyCameraFrame = () => {
          camera.position.set(
            cameraBase.x + cameraCurrent.x * cameraPanX,
            cameraBase.y - cameraCurrent.y * cameraPanY,
            cameraBase.z + Math.abs(cameraCurrent.x) * 0.16,
          );
          cameraLookAt.set(
            cameraCurrent.x * 0.24,
            cameraFocusY - cameraCurrent.y * 0.12,
            0,
          );
          camera.lookAt(cameraLookAt);

          fitAxisX.set(1, 0, 0).applyQuaternion(rallyWorld.quaternion);
          fitAxisY.set(0, 1, 0).applyQuaternion(rallyWorld.quaternion);
          fitAxisZ.set(0, 0, 1).applyQuaternion(rallyWorld.quaternion);
          cameraRight.set(1, 0, 0).applyQuaternion(camera.quaternion);
          cameraUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
          cameraBackward.copy(camera.position).sub(cameraLookAt).normalize();

          const projectedExtent = (axis: InstanceType<typeof THREE.Vector3>) =>
            Math.abs(fitAxisX.dot(axis)) * fitHalfExtents.x +
            Math.abs(fitAxisY.dot(axis)) * fitHalfExtents.y +
            Math.abs(fitAxisZ.dot(axis)) * fitHalfExtents.z;
          const verticalTangent = Math.tan(
            THREE.MathUtils.degToRad(camera.fov / 2),
          );
          const horizontalTangent = verticalTangent * camera.aspect;
          const fitDistance =
            projectedExtent(cameraBackward) +
            Math.max(
              projectedExtent(cameraUp) / verticalTangent,
              projectedExtent(cameraRight) / horizontalTangent,
            ) *
              1.02;
          // The fit only ever pushes the camera back, never pulls it in, so
          // the framed distance is the looser of the two. Zoom then divides
          // that distance, which is what lets a zoom-in cross the fit.
          const baseDistance = camera.position.distanceTo(cameraLookAt);
          const framedDistance = Math.max(fitDistance, baseDistance);
          camera.position
            .copy(cameraLookAt)
            .addScaledVector(cameraBackward, framedDistance / zoomLevel);
        };

        const renderScene = () => {
          applyCameraFrame();
          renderer.render(scene, camera);
        };

        const renderFrame = () => {
          timer.update();
          const delta = Math.max(0, Math.min(timer.getDelta(), 0.04));
          if (running) elapsed += delta;

          if (spinningWorld) {
            yawVelocity = decaySpinVelocity(yawVelocity, delta);
            pitchVelocity = decaySpinVelocity(pitchVelocity, delta);
            worldYaw += yawVelocity * delta;
            // The pitch clamp already keeps the underside hidden, so momentum
            // slides along the limit instead of being cut short by it.
            worldPitch = clampPitch(
              worldPitch + pitchVelocity * delta,
              currentPitchLimits(),
            );
            applyWorldRotation();
            if (Math.hypot(yawVelocity, pitchVelocity) <= SPIN_MIN_VELOCITY) {
              yawVelocity = 0;
              pitchVelocity = 0;
              spinningWorld = false;
              queueWorldReset();
            }
          }

          if (resettingWorld) {
            const resetProgress = Math.min(
              1,
              (window.performance.now() - resetStartedAt) / 1100,
            );
            const easedProgress = 1 - Math.pow(1 - resetProgress, 3);
            worldYaw = THREE.MathUtils.lerp(resetFromYaw, 0, easedProgress);
            worldPitch = THREE.MathUtils.lerp(resetFromPitch, 0, easedProgress);
            applyWorldRotation();
            // Framing returns with the orientation, so a zoomed-in reader is
            // handed back the same default view a first-time reader sees.
            zoomLevel = THREE.MathUtils.lerp(
              resetFromZoom,
              ZOOM_DEFAULT,
              easedProgress,
            );
            if (resetProgress >= 1) {
              worldYaw = 0;
              worldPitch = 0;
              applyWorldRotation();
              zoomLevel = ZOOM_DEFAULT;
              resettingWorld = false;
              root.dataset.resetState = "idle";
            }
          }

          const cameraEase = 1 - Math.exp(-delta * 3.1);
          cameraCurrent.lerp(cameraTarget, cameraEase);

          const shotIndex = Math.floor(elapsed / LEG_DURATION_SECONDS);
          const progress =
            (elapsed % LEG_DURATION_SECONDS) / LEG_DURATION_SECONDS;
          const outbound = shotIndex % 2 === 0;
          const shot = ensureShot(shotIndex);

          const audio = audioRef.current;
          if (audio && running) {
            // A new leg means the ball just left a blade; within a leg the
            // one impact left is the bounce off the table.
            if (
              lastSoundedShot !== undefined &&
              shotIndex !== lastSoundedShot
            ) {
              audio.play("paddle", impactStrength(shot.spinRate));
            } else if (
              lastSoundedShot === shotIndex &&
              crossedBounce(lastSoundedProgress, progress, shot.bounceAt)
            ) {
              audio.play("table", impactStrength(shot.spinRate) * 0.85);
            }
          }
          lastSoundedShot = shotIndex;
          lastSoundedProgress = progress;
          const point = sampleRallyPoint(shot, progress, outbound);
          ballGroup.position.set(point.x, point.y, point.z);

          const travelDirection = outbound ? 1 : -1;
          const spinDirection = shot.spinRate * travelDirection;
          ballGroup.rotation.z += delta * spinDirection;
          clockwiseArrow.visible = spinDirection < 0;
          counterClockwiseArrow.visible = spinDirection >= 0;

          history.unshift(ballGroup.position.clone());
          history.length = 26;
          trail.forEach((dot, index) => {
            const previous = history[(index + 1) * 4];
            if (previous) dot.position.copy(previous);
          });

          const leftHit = smoothPulse(Math.abs(point.x + 4.95), 0.72);
          const rightHit = smoothPulse(Math.abs(point.x - 4.95), 0.72);
          const nextShot = ensureShot(shotIndex + 1);
          const leftShot = outbound ? shot : nextShot;
          const rightShot = outbound ? nextShot : shot;
          const leftLane = outbound ? shot.startZ : shot.targetZ;
          const rightLane = outbound ? shot.targetZ : shot.startZ;
          const swingWindow = 0.22;
          const beforeContact = THREE.MathUtils.clamp(
            (progress - 1) / swingWindow,
            -1,
            0,
          );
          const afterContact = THREE.MathUtils.clamp(
            progress / swingWindow,
            0,
            1,
          );
          const paddleBlend = hasSetInitialPaddlePose ? 0.22 : 1;
          setPaddlePose(
            leftPaddle,
            "left",
            leftHit,
            leftShot,
            leftLane,
            outbound ? afterContact : beforeContact,
            paddleBlend,
          );
          setPaddlePose(
            rightPaddle,
            "right",
            rightHit,
            rightShot,
            rightLane,
            outbound ? beforeContact : afterContact,
            paddleBlend,
          );
          hasSetInitialPaddlePose = true;

          renderScene();
          if (running) frame = requestAnimationFrame(renderFrame);
        };

        const resize = () => {
          const width = Math.max(1, canvas.clientWidth);
          const height = Math.max(1, canvas.clientHeight);
          const aspect = width / height;
          const narrowness = Math.max(0, 1.45 - aspect);
          const panScale = THREE.MathUtils.clamp((aspect - 0.62) / 0.83, 0, 1);
          cameraBase.y = 8.4 + narrowness * 2.2;
          cameraBase.z = 13.6 + narrowness * 18;
          cameraPanX = THREE.MathUtils.lerp(0.5, 1.36, panScale);
          cameraPanY = THREE.MathUtils.lerp(0.38, 0.74, panScale);
          const bounds = root.getBoundingClientRect();
          pointerBounds = {
            left: bounds.left,
            top: bounds.top,
            width: Math.max(1, bounds.width),
            height: Math.max(1, bounds.height),
          };
          renderer.setSize(width, height, false);
          camera.aspect = aspect;
          camera.updateProjectionMatrix();
          renderScene();
        };

        const resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(canvas);
        cleanupSteps.push(() => resizeObserver.disconnect());
        let dragPointerId: number | undefined;

        const cancelWorldReset = () => {
          if (resetTimer !== undefined) window.clearTimeout(resetTimer);
          resetTimer = undefined;
          resettingWorld = false;
          spinningWorld = false;
          yawVelocity = 0;
          pitchVelocity = 0;
          root.dataset.resetState = "idle";
        };
        const queueWorldReset = () => {
          if (resetTimer !== undefined) window.clearTimeout(resetTimer);
          root.dataset.resetState = "pending";
          resetTimer = window.setTimeout(() => {
            resetTimer = undefined;
            if (
              dragPointerId !== undefined &&
              root.hasPointerCapture(dragPointerId)
            ) {
              root.releasePointerCapture(dragPointerId);
            }
            dragPointerId = undefined;
            delete root.dataset.dragging;
            cameraTarget.set(0, 0);
            if (reducedMotion.matches) {
              worldYaw = 0;
              worldPitch = 0;
              applyWorldRotation();
              zoomLevel = ZOOM_DEFAULT;
              root.dataset.resetState = "idle";
              renderScene();
              return;
            }
            // Unwind the shorter way: yaw accumulates without a limit, so a
            // reader who spun the table twice must not watch it spin back.
            worldYaw = shortestTurn(worldYaw);
            resetFromYaw = worldYaw;
            resetFromPitch = worldPitch;
            resetFromZoom = zoomLevel;
            resetStartedAt = window.performance.now();
            resettingWorld = true;
            root.dataset.resetState = "returning";
          }, 5000);
        };

        const interactionRoot = canvas.closest<HTMLElement>(".hero") ?? root;
        /** Last screen point the steer followed, in client pixels. */
        let steerX = 0;
        let steerY = 0;

        const reseedSteer = (clientX: number, clientY: number) => {
          steerX = clientX;
          steerY = clientY;
        };
        /**
         * Turn the world toward a screen point. Horizontal travel spins the
         * table, vertical travel tilts it, and each is measured in raw pixels
         * so the steer answers a drag the same way in every direction.
         *
         * The two axes are applied separately on purpose: clamping only the
         * tilt lets a table held at its tilt limit still be spun sideways.
         */
        const rotateWorldToward = (
          clientX: number,
          clientY: number,
          timeStamp: number,
        ) => {
          const deltaX = clientX - steerX;
          const deltaY = clientY - steerY;
          steerX = clientX;
          steerY = clientY;
          if (deltaX === 0 && deltaY === 0) return;

          const yawStep = deltaX * YAW_PER_PIXEL;
          const limits = currentPitchLimits();
          const pitchBefore = worldPitch;
          worldYaw += yawStep;
          worldPitch = clampPitch(
            worldPitch + deltaY * PITCH_PER_PIXEL,
            limits,
          );
          applyWorldRotation();

          const now = timeStamp || window.performance.now();
          const stepSeconds = lastDragMoveAt
            ? (now - lastDragMoveAt) / 1000
            : 0;
          lastDragMoveAt = now;
          // Momentum follows what the table actually did, so travel the clamp
          // swallowed cannot build up a flick the reader never saw.
          const pitchStep = worldPitch - pitchBefore;
          if (stepSeconds > 0) {
            yawVelocity =
              yawVelocity * 0.35 +
              Math.sign(yawStep) *
                flickVelocity(Math.abs(yawStep), stepSeconds) *
                0.65;
            pitchVelocity =
              pitchVelocity * 0.35 +
              Math.sign(pitchStep) *
                flickVelocity(Math.abs(pitchStep), stepSeconds) *
                0.65;
          }
        };
        /**
         * Touch points currently on the scene. Two of them make a pinch, which
         * takes the gesture over from the one-finger arcball drag until a
         * finger lifts.
         */
        const activeTouches = new Map<number, { x: number; y: number }>();
        /**
         * Pinch zoom is anchored to the span and zoom the gesture started
         * with, not accumulated per event. Pointer moves arrive one finger at
         * a time, so an incremental span ratio wobbles on every event and
         * drifts for good once a wobble is swallowed by the zoom limit.
         */
        let pinchStartSpan = 0;
        let pinchStartZoom = ZOOM_DEFAULT;
        let pinching = false;

        const currentPinchSpan = () => {
          const [first, second] = [...activeTouches.values()];
          return first && second ? touchSpan(first, second) : 0;
        };
        const currentPinchCenter = () => {
          const [first, second] = [...activeTouches.values()];
          return first && second ? pinchCenter(first, second) : undefined;
        };
        /**
         * Hold every finger of the gesture, so a release that lands outside
         * the canvas still reaches this element. Without it a finger lifted
         * off the edge of a short hero is never seen to end, the gesture never
         * settles, and the return to the default view is never queued.
         */
        const capturePointer = (pointerId: number) => {
          if (root.hasPointerCapture(pointerId)) return;
          try {
            root.setPointerCapture(pointerId);
          } catch {
            // The pointer may already be gone; the gesture still works without.
          }
        };
        const releasePointer = (pointerId: number) => {
          if (!root.hasPointerCapture(pointerId)) return;
          try {
            root.releasePointerCapture(pointerId);
          } catch {
            // Releasing a pointer the browser already dropped is harmless.
          }
        };
        /**
         * Hand the gesture to a screen point without letting the change of
         * steer register as motion: re-seeding the steer and clearing the step
         * clock is what stops the table snapping as fingers come and go.
         */
        const reseedGesture = (clientX: number, clientY: number) => {
          reseedSteer(clientX, clientY);
          lastDragMoveAt = 0;
          yawVelocity = 0;
          pitchVelocity = 0;
          spinningWorld = false;
        };
        const setZoom = (value: number) => {
          const next = clampZoom(value);
          if (next === zoomLevel) return;
          zoomLevel = next;
          if (!running) renderScene();
        };
        const applyZoom = (factor: number) => setZoom(zoomLevel * factor);
        const handleWheel = (event: WheelEvent) => {
          // A trackpad pinch arrives as a ctrl-held wheel. It must always be
          // consumed: handing it back does not scroll the page, it zooms the
          // whole browser, which is worse than trapping the gesture.
          const trackpadPinch = event.ctrlKey;
          const factor = wheelZoomFactor(
            event.deltaY,
            event.deltaMode,
            trackpadPinch,
          );
          const spent = wheelReleasesToPage(zoomLevel, factor);
          // At either limit a plain wheel has nothing left to give, so it goes
          // back to the page instead of trapping the reader in the hero.
          if (spent && !trackpadPinch) return;
          event.preventDefault();
          if (spent) return;
          cancelWorldReset();
          applyZoom(factor);
          queueWorldReset();
        };

        const handleWorldPointerDown = (event: PointerEvent) => {
          if (event.pointerType === "touch") {
            activeTouches.set(event.pointerId, {
              x: event.clientX,
              y: event.clientY,
            });
            capturePointer(event.pointerId);
            if (activeTouches.size === 2) {
              cancelWorldReset();
              // The two fingers steer together from here: their midpoint
              // rotates and their span zooms, so the gesture takes over from
              // whichever finger was dragging alone. Both keep their capture
              // so either one can be lifted anywhere and still be seen.
              dragPointerId = undefined;
              const center = currentPinchCenter();
              if (center) reseedGesture(center.x, center.y);
              pinchStartSpan = currentPinchSpan();
              pinchStartZoom = zoomLevel;
              pinching = true;
              cameraTarget.set(0, 0);
              root.dataset.dragging = "true";
              root.dataset.resetState = "dragging";
              event.preventDefault();
              return;
            }
            if (activeTouches.size > 2) return;
          }
          if (!event.isPrimary || dragPointerId !== undefined) return;
          cancelWorldReset();
          dragPointerId = event.pointerId;
          capturePointer(event.pointerId);
          reseedSteer(event.clientX, event.clientY);
          cameraTarget.set(0, 0);
          lastDragMoveAt = 0;
          root.dataset.dragging = "true";
          root.dataset.resetState = "dragging";
          event.preventDefault();
        };
        const handleWorldPointerMove = (event: PointerEvent) => {
          if (
            event.pointerType === "touch" &&
            activeTouches.has(event.pointerId)
          ) {
            activeTouches.set(event.pointerId, {
              x: event.clientX,
              y: event.clientY,
            });
            if (pinching) {
              cancelWorldReset();
              const span = currentPinchSpan();
              if (span > 0 && pinchStartSpan > 0) {
                setZoom(pinchStartZoom * pinchZoomFactor(pinchStartSpan, span));
              }
              // Zoom and rotation come from the same gesture: the span drives
              // one, the midpoint the other, and both land on this frame.
              const center = currentPinchCenter();
              if (center) {
                rotateWorldToward(center.x, center.y, event.timeStamp);
              }
              if (!running) renderScene();
              event.preventDefault();
              return;
            }
          }
          if (event.pointerId !== dragPointerId) return;
          cancelWorldReset();
          rotateWorldToward(event.clientX, event.clientY, event.timeStamp);
          if (!running) renderScene();
          event.preventDefault();
        };
        /**
         * A release either flings the scene or parks it. Only a pointer that
         * was still moving at the moment it lifted carries momentum; a drag
         * that came to rest first is a deliberate placement.
         */
        const settleWorldDrag = () => {
          const stillMs = lastDragMoveAt
            ? window.performance.now() - lastDragMoveAt
            : Number.POSITIVE_INFINITY;
          lastDragMoveAt = 0;
          if (
            running &&
            !reducedMotion.matches &&
            stillMs <= SPIN_RELEASE_GRACE_MS &&
            Math.hypot(yawVelocity, pitchVelocity) > SPIN_MIN_VELOCITY
          ) {
            spinningWorld = true;
            root.dataset.resetState = "spinning";
            return;
          }
          yawVelocity = 0;
          pitchVelocity = 0;
          spinningWorld = false;
          queueWorldReset();
        };
        const handleWorldPointerEnd = (event: PointerEvent) => {
          if (event.pointerType === "touch") {
            activeTouches.delete(event.pointerId);
            releasePointer(event.pointerId);
            if (pinching && activeTouches.size < 2) {
              pinching = false;
              pinchStartSpan = 0;
              const [remaining] = [...activeTouches.entries()];
              if (remaining) {
                // One finger is still down, so the gesture continues as a
                // plain drag. Re-seeding from that finger is what keeps the
                // steer change from reading as a jump.
                const [remainingId, point] = remaining;
                dragPointerId = remainingId;
                capturePointer(remainingId);
                reseedGesture(point.x, point.y);
                root.dataset.dragging = "true";
                root.dataset.resetState = "dragging";
              } else {
                dragPointerId = undefined;
                delete root.dataset.dragging;
                settleWorldDrag();
              }
              event.preventDefault();
              return;
            }
            // A stray touch that was never steering still has to leave the
            // scene settled, or nothing will ever queue the return.
            if (activeTouches.size === 0 && dragPointerId === undefined) {
              delete root.dataset.dragging;
              settleWorldDrag();
              event.preventDefault();
              return;
            }
          }
          if (event.pointerId !== dragPointerId) return;
          releasePointer(event.pointerId);
          dragPointerId = undefined;
          delete root.dataset.dragging;
          settleWorldDrag();
          event.preventDefault();
        };
        const handleLostPointerCapture = (event: PointerEvent) => {
          if (event.pointerId !== dragPointerId) return;
          dragPointerId = undefined;
          delete root.dataset.dragging;
          settleWorldDrag();
        };
        const refreshPointerBounds = () => {
          const bounds = interactionRoot.getBoundingClientRect();
          pointerBounds = {
            left: bounds.left,
            top: bounds.top,
            width: Math.max(1, bounds.width),
            height: Math.max(1, bounds.height),
          };
        };
        const handlePointerMove = (event: PointerEvent) => {
          if (
            dragPointerId !== undefined ||
            reducedMotion.matches ||
            event.pointerType === "touch"
          ) {
            return;
          }
          const x =
            ((event.clientX - pointerBounds.left) / pointerBounds.width - 0.5) *
            2;
          const y =
            ((event.clientY - pointerBounds.top) / pointerBounds.height - 0.5) *
            2;
          cameraTarget.set(
            THREE.MathUtils.clamp(x, -1, 1),
            THREE.MathUtils.clamp(y, -1, 1),
          );
        };
        const resetPointer = () => cameraTarget.set(0, 0);
        interactionRoot.addEventListener("pointerenter", refreshPointerBounds, {
          passive: true,
        });
        interactionRoot.addEventListener("pointermove", handlePointerMove, {
          passive: true,
        });
        interactionRoot.addEventListener("pointerleave", resetPointer, {
          passive: true,
        });
        // Not passive: a wheel step that the scene consumes must be able to
        // hold the page still while it zooms.
        root.addEventListener("wheel", handleWheel, { passive: false });
        root.addEventListener("pointerdown", handleWorldPointerDown);
        root.addEventListener("pointermove", handleWorldPointerMove);
        root.addEventListener("pointerup", handleWorldPointerEnd);
        root.addEventListener("pointercancel", handleWorldPointerEnd);
        root.addEventListener("lostpointercapture", handleLostPointerCapture);
        cleanupSteps.push(() => {
          interactionRoot.removeEventListener(
            "pointerenter",
            refreshPointerBounds,
          );
          interactionRoot.removeEventListener("pointermove", handlePointerMove);
          interactionRoot.removeEventListener("pointerleave", resetPointer);
          root.removeEventListener("wheel", handleWheel);
          root.removeEventListener("pointerdown", handleWorldPointerDown);
          root.removeEventListener("pointermove", handleWorldPointerMove);
          root.removeEventListener("pointerup", handleWorldPointerEnd);
          root.removeEventListener("pointercancel", handleWorldPointerEnd);
          root.removeEventListener(
            "lostpointercapture",
            handleLostPointerCapture,
          );
        });

        const start = () => {
          if (running || reducedMotion.matches || document.hidden) return;
          running = true;
          timer.reset();
          frame = requestAnimationFrame(renderFrame);
        };
        const stop = () => {
          running = false;
          cancelAnimationFrame(frame);
        };
        const handleVisibility = () => {
          if (document.hidden) stop();
          else start();
        };
        const handleReducedMotion = (event: MediaQueryListEvent) => {
          cameraTarget.set(0, 0);
          cameraCurrent.set(0, 0);
          if (event.matches) {
            if (resettingWorld) {
              resettingWorld = false;
              rallyWorld.quaternion.identity();
              root.dataset.resetState = "idle";
            }
            stop();
            renderScene();
          } else {
            start();
          }
        };
        reducedMotion.addEventListener("change", handleReducedMotion);
        document.addEventListener("visibilitychange", handleVisibility);
        cleanupSteps.push(() => {
          reducedMotion.removeEventListener("change", handleReducedMotion);
          document.removeEventListener("visibilitychange", handleVisibility);
        });

        resize();
        delete root.dataset.unavailable;
        root.dataset.ready = "true";
        root.dataset.resetState = "idle";
        renderFrame();
      })
      .catch(() => {
        disposeScene?.();
        if (!cancelled) markUnavailable();
      });

    return () => {
      cancelled = true;
      disposeScene?.();
    };
  }, []);

  return (
    <div className="hero-rally-stage">
      <div className="hero-rally-scene" ref={rootRef} aria-hidden="true">
        <canvas ref={canvasRef} />
      </div>
      <button
        type="button"
        className="hero-rally-sound"
        onClick={toggleSound}
        aria-pressed={soundOn}
        aria-label={soundOn ? "타구음 끄기" : "타구음 켜기"}
        title={soundOn ? "타구음 끄기" : "타구음 켜기"}
      >
        {soundOn ? (
          <Volume2 aria-hidden="true" size={16} />
        ) : (
          <VolumeX aria-hidden="true" size={16} />
        )}
      </button>
    </div>
  );
}
