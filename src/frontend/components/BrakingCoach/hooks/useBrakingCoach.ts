import { useEffect, useRef, useState } from 'react';
import type {
  BrakingCoachBeep,
  BrakingCoachLevel,
  LapTraceSampleSnapshot,
  LapTraceSource,
} from '@irdashies/types';
import {
  getChannelSnapshotStore,
  useTrackDisplayName,
} from '@irdashies/context';
import logger from '@irdashies/utils/logger';
import {
  playCueTone,
  primeBrakeCueAudio,
  setBrakeCueOutputDevice,
  type CueTone,
} from '@irdashies/utils/brakeCueAudio';
import { CoachTracker } from '../engine/coachTracker';
import { markAt, TurnsRecorder } from '../engine/coachMarks';
import { sayDue } from '../engine/coachVoice';
import { coachSay, coachSpeaking, prepareCoachVoice } from '../coachSpeech';
import type { CoachBeep, CoachState } from '../engine/types';
import { useCoachSetup, type CoachSetup } from './useCoachSetup';

/** The original's beeps (winsound.Beep frequency and length), as tones. */
export const COACH_TONES: Record<CoachBeep, CueTone> = {
  short: { frequency: 950, type: 'sine', durationSec: 0.07, peak: 1 },
  brake: { frequency: 1250, type: 'sine', durationSec: 0.23, peak: 1 },
  go: { frequency: 1750, type: 'sine', durationSec: 0.08, peak: 0.8 },
};

/** Two rising notes: the brake point was marked. */
const MARK_TONES: CueTone[] = [
  { frequency: 700, type: 'sine', durationSec: 0.06, peak: 1 },
  { frequency: 1100, type: 'sine', durationSec: 0.09, peak: 1 },
];

/** The overlay redraws at most this often (the original draws at 30 fps). */
const RENDER_INTERVAL_MS = 33;

export interface BrakingCoachOptions {
  level: BrakingCoachLevel;
  beep: BrakingCoachBeep;
  /** 0..1 */
  volume: number;
  lookS: number;
  feedback: boolean;
  /** Which imported lap to prefer ('best': follow your best by default). */
  referenceSource: LapTraceSource;
  /** With an imported reference, coach half-way between it and your best. */
  blend: boolean;
  /** Read out the corners' spoken reference points. */
  sayRef: boolean;
  /** -10..10 */
  voiceRate: number;
  /** 0..1 */
  voiceVolume: number;
  /** Windows voice; '' = one in the app language. */
  voiceName: string;
  /** Playback device for beeps and voice. */
  outputDeviceId: string;
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
    st.corner?.marked ? 'm' : '',
    st.d ?? '',
    st.k ?? '',
    st.next ? `${st.next.label}:${st.next.d}:${st.next.dir}` : '',
    st.feedback ? `${st.feedback.n}:${st.feedback.dt}` : '',
  ].join('|');

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
 *
 * Also keeps the first clean lap's steering for the track (which way each
 * corner turns) and answers the "mark brake point" key.
 */
export const useBrakingCoach = (options: BrakingCoachOptions): CoachState => {
  const setup = useCoachSetup(options.referenceSource, options.blend);
  const { corners, timing, lengthM, trackKey } = setup;
  const trackName = useTrackDisplayName();
  const tracker = useRef<CoachTracker | null>(null);
  if (!tracker.current) {
    tracker.current = new CoachTracker({
      beep: options.beep,
      lookS: options.lookS,
      feedback: options.feedback,
    });
  }
  const turns = useRef(new TurnsRecorder());
  const lastPct = useRef(-1);
  /** SessionTime each corner's reference point was last read out. */
  const said = useRef(new Map<number, number>());
  const [state, setState] = useState<CoachState>(() => ({
    phase: corners.length ? 'idle' : 'noref',
    beeps: [],
  }));

  const opts = useRef(options);
  opts.current = options;
  const live = useRef<CoachSetup & { trackName: string }>({
    ...setup,
    trackName: trackName ?? '',
  });
  live.current = { ...setup, trackName: trackName ?? '' };

  useEffect(() => {
    tracker.current?.setOptions({
      beep: options.beep,
      lookS: options.lookS,
      feedback: options.feedback,
    });
  }, [options.beep, options.lookS, options.feedback]);

  useEffect(() => {
    tracker.current?.setCorners(corners, timing, lengthM);
    said.current.clear();
    setState({ phase: corners.length ? 'idle' : 'noref', beeps: [] });
  }, [corners, timing, lengthM]);

  // Steering is only collected while the track has none stored.
  const needTurns = !!trackKey && !!lengthM && !setup.data.turns;
  const collecting = useRef(false);
  useEffect(() => {
    collecting.current = needTurns;
    if (needTurns && lengthM) turns.current.reset(lengthM);
  }, [needTurns, lengthM, trackKey]);

  const beepsOn =
    options.active &&
    options.level === 'full' &&
    options.beep !== 'off' &&
    options.volume > 0;
  const voiceOn = options.active && options.sayRef && options.voiceVolume > 0;
  useEffect(() => {
    // Route first, then open the device ahead of the first beep or call.
    setBrakeCueOutputDevice(options.outputDeviceId);
    if (beepsOn || voiceOn) primeBrakeCueAudio();
  }, [beepsOn, voiceOn, options.outputDeviceId]);

  // Every corner's call is rendered ahead of time, so it plays the instant
  // it is due.
  const sayTexts = corners
    .filter((c) => !c.hidden && c.say)
    .map((c) => c.say)
    .join('\n');
  useEffect(() => {
    if (!voiceOn) return;
    for (const text of sayTexts.split('\n')) {
      if (text) {
        void prepareCoachVoice(text, {
          voice: options.voiceName,
          rate: options.voiceRate,
        });
      }
    }
  }, [voiceOn, sayTexts, options.voiceName, options.voiceRate]);

  useEffect(() => {
    const bridge = window.coachBridge;
    if (!bridge) return;
    return bridge.onMark(() => {
      const s = live.current;
      const pct = lastPct.current;
      if (pct < 0 || !s.trackKey || !s.carPath) return;
      const result = markAt(pct, s.corners, s.data.marks, s.lengthM ?? 0);
      if (!result) return;
      const volume = opts.current.volume;
      if (volume > 0) {
        playCueTone(MARK_TONES[0], volume);
        window.setTimeout(() => playCueTone(MARK_TONES[1], volume), 70);
      }
      bridge
        .saveMarks(s.trackKey, s.carPath, s.trackName, result.marks)
        .catch((e) => logger.warn('[Coach] Failed to save a mark', e));
    });
  }, []);

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
      const sample = toSample(snapshot);
      lastPct.current = sample.ok ? sample.pct : -1;

      if (collecting.current) {
        const lap = turns.current.feed(
          sample.pct,
          snapshot.steer ?? 0,
          sample.ok,
          snapshot.incidentCount
        );
        const key = live.current.trackKey;
        if (lap && key) {
          collecting.current = false;
          window.coachBridge
            ?.saveTurns(key, lap)
            .catch((e) => logger.warn('[Coach] Failed to save turns', e));
        }
      }

      const st = engine.feed(sample, now);
      const o = opts.current;
      if (o.sayRef && o.active && sample.ok && !coachSpeaking()) {
        const s = live.current;
        const due = sayDue(
          s.corners,
          sample.pct,
          sample.sessionTime,
          sample.speedKph,
          s.timing,
          s.lengthM ?? 0,
          o.voiceRate,
          said.current
        );
        if (
          due &&
          coachSay(due.text, {
            voice: o.voiceName,
            rate: o.voiceRate,
            volume: o.voiceVolume,
          })
        ) {
          said.current.set(due.n, sample.sessionTime);
        }
      }
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
