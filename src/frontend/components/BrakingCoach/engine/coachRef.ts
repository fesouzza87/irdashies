import type { LapTraceView } from '@irdashies/types';
import type { CoachRef } from './types';

/** Python-style modulo: always in [0, n). */
export const mod = (a: number, n: number): number => ((a % n) + n) % n;

/** Signed distance between two lap fractions, in (-0.5, 0.5]. */
export const wrapHalf = (d: number): number => mod(d + 0.5, 1) - 0.5;

/** One point every ~3 m (between 400 and 4000 points per lap). */
export const binsFor = (lengthM: number): number =>
  Math.trunc(Math.max(400, Math.min(4000, Math.round((lengthM || 4000) / 3))));

const round = (v: number, digits: number) => {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
};

/**
 * Resamples a recorded lap onto equally spaced points by distance, the way
 * build_ref does with the lap fractions of a Dex lap. Speeds become km/h.
 */
export function buildCoachRef(view: LapTraceView): CoachRef | null {
  const L = view.trackLengthM;
  const s = view.samples;
  const count = s.length;
  if (!(L > 0) || count < 2 || !(view.lapTimeSec > 0)) return null;
  const n = binsFor(L);
  const spd: number[] = [];
  const brk: number[] = [];
  const thr: number[] = [];
  const gear: number[] = [];
  const t: number[] = [];
  let j = 0;
  for (let i = 0; i < n; i++) {
    const d = (i / n) * L;
    while (j < count - 2 && s.distanceM[j + 1] <= d) j++;
    let a = j;
    let b = j + 1;
    let f: number;
    let time: number;
    if (d <= s.distanceM[0]) {
      // Before the first sample: hold its values, time runs from 0.
      a = b = 0;
      f = 0;
      time = s.distanceM[0] > 0 ? (d / s.distanceM[0]) * s.timeSec[0] : 0;
    } else if (d >= s.distanceM[count - 1]) {
      // After the last sample: hold its values, time runs on to the lap time.
      a = b = count - 1;
      f = 0;
      const dLast = s.distanceM[count - 1];
      const tLast = s.timeSec[count - 1];
      time =
        L > dLast
          ? tLast + ((d - dLast) / (L - dLast)) * (view.lapTimeSec - tLast)
          : tLast;
    } else {
      const span = s.distanceM[b] - s.distanceM[a];
      f = span > 0 ? Math.max(0, Math.min(1, (d - s.distanceM[a]) / span)) : 0;
      time = s.timeSec[a] + (s.timeSec[b] - s.timeSec[a]) * f;
    }
    const lerp = (arr: Float32Array) => arr[a] + (arr[b] - arr[a]) * f;
    spd.push(round(lerp(s.speed) * 3.6, 1));
    brk.push(round(Math.max(0, Math.min(1, lerp(s.brake))), 3));
    thr.push(round(Math.max(0, Math.min(1, lerp(s.throttle))), 3));
    gear.push(Math.round(f < 0.5 ? s.gear[a] : s.gear[b]));
    t.push(round(time, 3));
  }
  return {
    n,
    lengthM: round(L, 1),
    lapSec: round(view.lapTimeSec, 3),
    spd,
    brk,
    thr,
    gear,
    t,
  };
}

/** Reference time at a lap fraction, interpolated. */
export function refTimeAt(ref: CoachRef, pct: number): number {
  const { n } = ref;
  const f = mod(pct, 1) * n;
  const i = Math.floor(f) % n;
  const a = ref.t[i];
  const b = i + 1 < n ? ref.t[i + 1] : ref.lapSec;
  return a + (b - a) * (f - Math.floor(f));
}

/** Seconds from `pct` to `q` at the reference lap's pace (null without it). */
export function refTimeBetween(
  ref: CoachRef | null,
  pct: number,
  q: number
): number | null {
  if (!ref) return null;
  const { n } = ref;
  const ia = Math.floor(mod(pct, 1) * n) % n;
  const ib = Math.floor(mod(q, 1) * n) % n;
  let dt = ref.t[ib] - ref.t[ia];
  if (dt < 0) dt += ref.lapSec;
  return dt >= 0 ? dt : null;
}
