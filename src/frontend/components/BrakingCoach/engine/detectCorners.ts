import { mod, wrapHalf } from './coachRef';
import type { CoachRef, DetectedCorner } from './types';

/** Minimum speed drop for a slow point to count as a corner, km/h. */
export const MIN_DROP_KMH = 5;
/** Furthest a tip (or the other driver's corner) can be from a detected corner, metres. */
export const NOTE_MATCH_M = 150;

const round = (v: number, digits = 0) => {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
};

/** Circular moving average over ±k points. */
export function smooth(v: readonly number[], k: number): number[] {
  const n = v.length;
  if (k <= 1) return [...v];
  const out: number[] = [];
  let acc = 0;
  for (let i = -k; i <= k; i++) acc += v[mod(i, n)];
  for (let i = 0; i < n; i++) {
    out.push(acc / (2 * k + 1));
    acc += v[mod(i + k + 1, n)] - v[mod(i - k, n)];
  }
  return out;
}

/** Corners of a reference lap: wherever the speed drops by at least MIN_DROP_KMH. */
export function detectCorners(ref: CoachRef): DetectedCorner[] {
  const { n, spd, brk, thr, gear } = ref;
  const L = ref.lengthM || 4000;
  const dx = L / n;
  const v = smooth(spd, Math.max(1, Math.trunc(6 / dx)));
  const W = Math.max(2, Math.trunc(40 / dx));
  const back = Math.max(4, Math.trunc(300 / dx));
  const at = (i: number) => v[mod(i, n)];

  const mins: number[] = [];
  for (let i = 0; i < n; i++) {
    let left = Infinity;
    let right = Infinity;
    for (let k = 1; k <= W; k++) {
      left = Math.min(left, at(i - k));
      right = Math.min(right, at(i + k));
    }
    if (v[i] < left && v[i] <= right) {
      let pre = -Infinity;
      for (let k = 1; k < back; k++) pre = Math.max(pre, at(i - k));
      if (pre - v[i] >= MIN_DROP_KMH) mins.push(i);
    }
  }

  const peakBetween = (a: number, b: number) => {
    let m = -Infinity;
    for (let k = a; k <= b; k++) m = Math.max(m, at(k));
    return m;
  };
  // Two slow points close together with no real speed gained between them are
  // one corner; the first stays (that is where the braking ends).
  const merged: number[] = [];
  for (const m of mins) {
    if (merged.length) {
      const a = merged[merged.length - 1];
      const between = m > a ? peakBetween(a, m) : v[m];
      if ((m - a) * dx < 130 && between - Math.max(v[a], v[m]) < 3) continue;
    }
    merged.push(m);
  }
  // The last and the first can be the same corner, across the line.
  if (merged.length > 1) {
    const a = merged[merged.length - 1];
    const b = merged[0] + n;
    if ((b - a) * dx < 130 && peakBetween(a, b) - Math.max(v[a], at(b)) < 3) {
      merged.shift();
    }
  }

  const corners: DetectedCorner[] = [];
  for (const m of merged) {
    // Back up to where the slowing down starts.
    let j = m;
    const lim = Math.trunc(400 / dx);
    while (m - j < lim && at(j - 1) > at(j) - 0.15) j--;
    const entry = j;
    const idx: number[] = [];
    for (let k = entry; k <= m; k++) idx.push(mod(k, n));

    let kind: DetectedCorner['kind'] = 'brake';
    let bp = idx.find((k) => brk[k] > 0.05);
    if (bp === undefined) {
      kind = 'lift';
      bp = idx.find((k) => thr[k] < 0.7) ?? mod(entry, n);
    }

    const span = mod(m - bp, n);
    let lastB = bp;
    let gap = 0;
    for (let k = bp; k < bp + span + Math.trunc(60 / dx); k++) {
      if (brk[mod(k, n)] > 0.05) {
        lastB = k;
        gap = 0;
      } else {
        gap++;
        // Off the brake before the slowest point.
        if (gap * dx > 15 && k >= bp + span) break;
      }
    }

    let tp: number | null = null;
    let released = false;
    for (let k = lastB + 1; k < m + Math.trunc(250 / dx); k++) {
      if (brk[mod(k, n)] < 0.05) {
        released = true;
        if (thr[mod(k, n)] >= 0.5) {
          tp = mod(k, n);
          break;
        }
      } else if (released) {
        // Back on the brake for the next corner without accelerating: the exit
        // is the slowest point.
        break;
      }
    }
    if (tp === null) tp = m;

    let pk = 0;
    for (let k = bp; k <= bp + span; k++) pk = Math.max(pk, brk[mod(k, n)]);
    corners.push({
      p: round(m / n, 5),
      bp: round(bp / n, 5),
      tp: round(tp / n, 5),
      kind,
      vmin: round(spd[m]),
      gear: gear[m],
      pk: round(pk * 100),
    });
  }
  corners.sort((a, b) => a.bp - b.bp);
  return corners;
}

/**
 * Which way a corner turns, from the steering between `start` and `end` (lap
 * fractions): 'R', 'L', 'RL'/'LR' for a chicane (in order), '' when it barely
 * turns. The main side is where the most lock is applied; a run the other way
 * only counts when it belongs to the same corner (it starts after the braking
 * and is not the exit of the corner before).
 */
export function cornerDir(
  steer: readonly number[],
  n: number,
  start: number,
  end: number,
  L: number
): string {
  const dx = (L || 4000) / n;
  const i0 = Math.round(mod(start, 1) * n);
  const cnt = Math.max(1, Math.round(mod(end - start, 1) * n));
  const w: number[] = [];
  for (let k = 0; k <= cnt; k++) w.push(steer[mod(i0 + k, n)]);
  const peak = w.reduce((m, x) => Math.max(m, Math.abs(x)), 0);
  if (peak < 0.06) return '';
  const threshold = Math.max(0.05, 0.35 * peak);
  // At least ~12 m turning the same way (ignores quick corrections).
  const need = Math.max(2, Math.trunc(12 / dx));
  const runs: [number, number, number, number][] = []; // side, start, end, peak
  let cur = 0;
  let a = 0;
  let pk = 0;
  [...w, 0].forEach((x, i) => {
    const sg = x > threshold ? 1 : x < -threshold ? -1 : 0;
    if (sg !== 0 && sg === cur) {
      pk = Math.max(pk, Math.abs(x));
      return;
    }
    if (cur !== 0 && i - a >= need) runs.push([cur, a, i, pk]);
    cur = sg;
    a = i;
    pk = Math.abs(x);
  });
  if (!runs.length) return '';
  let m = 0;
  runs.forEach((r, k) => {
    if (r[3] > runs[m][3]) m = k;
  });
  const side = (sg: number) => (sg > 0 ? 'L' : 'R');
  const out = side(runs[m][0]);
  const before = runs
    .slice(0, m)
    .filter(
      (r) => r[0] !== runs[m][0] && r[1] > need && r[3] >= 0.65 * runs[m][3]
    );
  const after = runs
    .slice(m + 1)
    .filter((r) => r[0] !== runs[m][0] && r[3] >= 0.65 * runs[m][3]);
  if (before.length) return side(before[before.length - 1][0]) + out;
  if (after.length) return out + side(after[0][0]);
  return out;
}

/**
 * Half-way: at each corner, points between your lap and the other driver's
 * (`w` = weight of the other driver).
 */
export function blendCorners(
  mine: readonly DetectedCorner[],
  pro: readonly DetectedCorner[],
  L: number,
  w = 0.5,
  keepGear = false
): DetectedCorner[] {
  return mine.map((c) => {
    let best: DetectedCorner | undefined;
    for (const q of pro) {
      if (
        !best ||
        Math.abs(wrapHalf(q.p - c.p)) < Math.abs(wrapHalf(best.p - c.p))
      )
        best = q;
    }
    if (!best || Math.abs(wrapHalf(best.p - c.p)) * L > NOTE_MATCH_M) return c;
    const mix = (a: number, b: number) => mod(a + wrapHalf(b - a) * w, 1);
    const out: DetectedCorner = {
      ...c,
      bp: round(mix(c.bp, best.bp), 5),
      tp: round(mix(c.tp, best.tp), 5),
      vmin: round(c.vmin + (best.vmin - c.vmin) * w),
      pk: round(c.pk + (best.pk - c.pk) * w),
      kind: c.kind === best.kind ? c.kind : 'brake',
    };
    if (
      !keepGear &&
      out.kind === 'brake' &&
      best.kind === 'brake' &&
      best.gear !== out.gear
    ) {
      out.gear = Math.min(out.gear, best.gear);
    }
    return out;
  });
}
