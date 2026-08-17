/**
 * Impact sounds for the hero rally, synthesised rather than loaded.
 *
 * A ping-pong impact is a very short noisy transient with a little pitched
 * ring after it, which is cheap to build from an oscillator and a decaying
 * gain. Synthesising keeps audio out of the bundle entirely and lets the two
 * surfaces differ by tone rather than by asset.
 */
export type RallyImpact = "paddle" | "table";

export interface ImpactVoice {
  /** Ring frequency in Hz. */
  frequency: number;
  /** Seconds for the impact to fade out. */
  decaySeconds: number;
  /** Peak gain before the decay, 0..1. */
  peak: number;
}

/**
 * A blade strike is harder and brighter than a bounce off the table, which is
 * duller and rings a little longer through the wood.
 */
export const IMPACT_VOICES: Record<RallyImpact, ImpactVoice> = {
  paddle: { frequency: 1750, decaySeconds: 0.075, peak: 0.5 },
  table: { frequency: 1180, decaySeconds: 0.1, peak: 0.36 },
};

/** Ceiling on the mixed output, so a fast rally cannot get shrill. */
export const MASTER_GAIN = 0.16;

/**
 * Whether the ball passed its bounce between two samples of a leg.
 *
 * `previous` and `current` are progress along one leg, both in 0..1. A leg
 * that wrapped is not a bounce and is reported by the caller as a contact, so
 * a backwards step is deliberately not a crossing.
 */
export const crossedBounce = (
  previous: number,
  current: number,
  bounceAt: number,
): boolean => previous < bounceAt && current >= bounceAt;

/**
 * Impact loudness for a shot, from how hard it was struck. Drives carry more
 * speed than cuts, so they land harder; the range stays narrow so the rally
 * reads as one rhythm rather than a series of accents.
 */
export const impactStrength = (spinRate: number): number => {
  const speed = Math.min(1, Math.abs(spinRate) / 20);
  return 0.72 + speed * 0.28;
};

export interface RallyAudio {
  play: (impact: RallyImpact, strength: number) => void;
  resume: () => Promise<void>;
  close: () => void;
}

type AudioContextConstructor = new () => AudioContext;

const audioContextConstructor = (): AudioContextConstructor | undefined => {
  const scope = window as Window & {
    webkitAudioContext?: AudioContextConstructor;
  };
  return window.AudioContext ?? scope.webkitAudioContext;
};

/**
 * Build the impact voice. Returns `undefined` where the browser has no Web
 * Audio at all, so the caller can simply leave the scene silent.
 *
 * Safari only lets a context start from a user gesture, so this is created
 * when the reader turns sound on rather than when the scene loads.
 */
export const createRallyAudio = (): RallyAudio | undefined => {
  const Constructor = audioContextConstructor();
  if (!Constructor) return undefined;

  const context = new Constructor();
  const master = context.createGain();
  master.gain.value = MASTER_GAIN;
  master.connect(context.destination);

  return {
    play(impact, strength) {
      if (context.state !== "running") return;
      const voice = IMPACT_VOICES[impact];
      const startedAt = context.currentTime;
      const endsAt = startedAt + voice.decaySeconds;
      const oscillator = context.createOscillator();
      const envelope = context.createGain();

      oscillator.type = "triangle";
      oscillator.frequency.setValueAtTime(voice.frequency, startedAt);
      // Letting the pitch fall as it dies is what makes the transient read as
      // a knock on a surface rather than a beep.
      oscillator.frequency.exponentialRampToValueAtTime(
        voice.frequency * 0.55,
        endsAt,
      );
      // Exponential ramps cannot touch zero, so the envelope runs between
      // small positive values instead.
      envelope.gain.setValueAtTime(0.0001, startedAt);
      envelope.gain.exponentialRampToValueAtTime(
        Math.max(0.0002, voice.peak * strength),
        startedAt + 0.004,
      );
      envelope.gain.exponentialRampToValueAtTime(0.0001, endsAt);

      oscillator.connect(envelope);
      envelope.connect(master);
      oscillator.start(startedAt);
      oscillator.stop(endsAt + 0.02);
      oscillator.onended = () => {
        oscillator.disconnect();
        envelope.disconnect();
      };
    },
    async resume() {
      await context.resume();
    },
    close() {
      void context.close();
    },
  };
};
