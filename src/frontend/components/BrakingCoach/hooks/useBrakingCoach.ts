import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  BrakingCoachBeep,
  BrakingCoachLevel,
  LapTraceSampleSnapshot,
} from '@irdashies/types';
import { getChannelSnapshotStore, useLapTraceStore } from '@irdashies/context';
import {
  playCueTone,
  primeBrakeCueAudio,
  type CueTone,
} from '@irdashies/utils/brakeCueAudio';
import { buildCoachRef } from '../engine/coachRef';
import { mergeCorners } from '../engine/coachCorners';
import { CoachTracker } from '../engine/coachTracker';
import type { CoachBeep, CoachCorner, CoachState } from '../engine/types';

/** The original's beeps (winsound.Beep frequency and length), as tones. */
export const COACH_TONES: Record<CoachBeep, CueTone> = {
  short: { frequency: 950, type: 'sine', durationSec: 0.07, peak: 1 },
  brake: { frequency: 1250, type: 'sine', durationSec: 0.23, peak: 1 },
  go: { frequency: 1750, type: 'sine', durationSec: 0.08, peak: 0.8 },
};

/** The overlay redraws at most this often (the original draws at 30 fps). */
const RENDER_INTERVAL_MS = 33;

export interface BrakingCoachOptions {
  level: BrakingCoachLevel;
  beep: BrakingCoachBeep;
  /** 0..1 */
  volume: number;
  lookS: number;
  feedback: boolean;
  /**
   * The coach is on screen for this session. When not (a race with "practice
   * only"), it keeps following the corners but stays silent, like the
   * original's muted mode.
   */
  active: boolean;
}

/** Fields that change what is drawn; anything else is not worth a render. */
const stateKey = (st: CoachState) =>
  [
    st.phase,
    st.corner?.n ?? '',
    st.corner?.lastVmin ?? '',
    st.d ?? '',
    st.k ?? '',
    st.next ? `${st.next.label}:${st.next.d}` : '',
    st.feedback ? `${st.feedback.n}:${st.feedback.dt}` : '',
  ].join('|');

/** The corners of the reference lap, as the coach uses them. */
export const useCoachCorners = (): {
  corners: CoachCorner[];
  lengthM: number | null;
  timing: ReturnType<typeof buildCoachRef>;
} => {
  const referenceLap = useLapTraceStore((s) => s.referenceLap);
  const trackLengthM = useLapTraceStore((s) => s.trackLengthM);
  return useMemo(() => {
    const ref = referenceLap ? buildCoachRef(referenceLap) : null;
    const lengthM = trackLengthM > 0 ? trackLengthM : (ref?.lengthM ?? null);
    // Track tips and the driver's own marks come in the next step.
    return {
      corners: mergeCorners(ref, [], [], lengthM),
      lengthM,
      timing: ref,
    };
  }, [referenceLap, trackLengthM]);
};

const toSample = (s: LapTraceSampleSnapshot) => ({
  pct: s.lapDistPct,
  sessionTime: s.sessionTime,
  speedKph: s.speed * 3.6,
  brake: s.brake,
  throttle: s.throttle,
  gear: s.gear,
  ok: s.isOnTrack && !s.onPitRoad,
});

/**
 * Runs the coach on live telemetry: one direct subscription to the
 * `lap-trace.sample` channel (not a hook, so the engine sees every frame
 * without a React render per frame), beeps played straight from the
 * subscription, and the drawn state handed to React at most ~30 times a
 * second, and only when something visible changed.
 */
export const useBrakingCoach = (options: BrakingCoachOptions): CoachState => {
  const { corners, lengthM, timing } = useCoachCorners();
  const tracker = useRef<CoachTracker | null>(null);
  if (!tracker.current) {
    tracker.current = new CoachTracker({
      beep: options.beep,
      lookS: options.lookS,
      feedback: options.feedback,
    });
  }
  const [state, setState] = useState<CoachState>(() => ({
    phase: corners.length ? 'idle' : 'noref',
    beeps: [],
  }));

  const opts = useRef(options);
  opts.current = options;

  useEffect(() => {
    tracker.current?.setOptions({
      beep: options.beep,
      lookS: options.lookS,
      feedback: options.feedback,
    });
  }, [options.beep, options.lookS, options.feedback]);

  useEffect(() => {
    tracker.current?.setCorners(corners, timing, lengthM);
    setState({ phase: corners.length ? 'idle' : 'noref', beeps: [] });
  }, [corners, timing, lengthM]);

  const beepsOn =
    options.active &&
    options.level === 'full' &&
    options.beep !== 'off' &&
    options.volume > 0;
  useEffect(() => {
    // Open the audio device ahead of the first beep.
    if (beepsOn) primeBrakeCueAudio();
  }, [beepsOn]);

  useEffect(() => {
    const bridge = window.channelBridge;
    if (!bridge) return;
    const store = getChannelSnapshotStore('lap-trace.sample', bridge);
    const selection = store.createSelection((s) => s, Object.is, 60);
    let lastKey = '';
    let lastPhase = '';
    let lastAt = 0;
    return selection.subscribe(() => {
      const snapshot = selection.getSnapshot();
      const engine = tracker.current;
      if (!snapshot || !engine) return;
      const now = performance.now();
      const st = engine.feed(toSample(snapshot), now);
      const o = opts.current;
      if (st.beeps.length && o.active && o.level === 'full' && o.volume > 0) {
        for (const b of st.beeps) playCueTone(COACH_TONES[b], o.volume);
      }
      const key = stateKey(st);
      if (key === lastKey) return;
      // A new phase shows at once; the countdown itself is throttled.
      if (st.phase === lastPhase && now - lastAt < RENDER_INTERVAL_MS) return;
      lastKey = key;
      lastPhase = st.phase;
      lastAt = now;
      setState(st);
    });
  }, []);

  return state;
};
