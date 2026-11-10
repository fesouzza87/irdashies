import { mod, refTimeBetween } from './coachRef';
import type { CoachCorner, CoachRef } from './types';

/** Words per second of the Windows voice at normal speed. */
export const SAY_WPS = 2.8;
/** The call ends this long before the brake point, seconds. */
export const SAY_MARGIN = 1.2;
/** The same corner is not called again within this, seconds. */
export const SAY_REPEAT_S = 20;

/**
 * How many words the voice says: a number is read out in words ("150" is
 * "cento e cinquenta"), and "%" as "por cento". Same count as Dex Overlay.
 */
export function spokenWords(text: string): number {
  let n = 0;
  for (const w of text.match(/[\p{L}\p{N}_]+/gu) ?? []) {
    if (/^\d+$/.test(w)) {
      const v = Number(w);
      n +=
        v < 20 || (v < 100 && v % 10 === 0) || v % 100 === 0
          ? 1
          : v < 100 || v % 10 === 0 || v % 100 < 20
            ? 3
            : 5;
    } else {
      n += 1;
    }
  }
  return n + 2 * (text.split('%').length - 1);
}

/** Voice speed -10..10 as a speech rate (0.33x to 3x, like the Windows voice). */
export const speechRate = (rate: number): number =>
  3 ** (Math.max(-10, Math.min(10, rate)) / 10);

/**
 * The spoken reference point due now, if any: for the next corner that has
 * one, early enough for the call to end SAY_MARGIN before its brake point
 * (time to the brake point from the reference lap's pace, or the current
 * speed when that is sooner), and not repeated within SAY_REPEAT_S.
 */
export function sayDue(
  corners: readonly CoachCorner[],
  pct: number,
  sessionTime: number,
  speedKph: number,
  timing: CoachRef | null,
  length: number,
  rate: number,
  said: ReadonlyMap<number, number>
): { n: number; text: string } | null {
  if (pct < 0) return null;
  const L = length || 4000;
  let best: [number, CoachCorner, string] | null = null;
  for (const c of corners) {
    const text = (c.say ?? '').trim();
    if (!text || c.hidden) continue;
    // A tip with no detected corner: bp is already 120 m before it.
    const d = mod(c.bp - pct, 1) * L;
    if (best === null || d < best[0]) best = [d, c, text];
  }
  if (!best) return null;
  const [d, c, text] = best;
  const need = SAY_MARGIN + spokenWords(text) / (SAY_WPS * speechRate(rate));
  let t = d / Math.max(speedKph / 3.6, 8);
  // Along the reference lap: counts the speed still to come on the straight.
  const tr = refTimeBetween(timing, pct, c.bp);
  if (tr !== null) t = Math.min(t, tr);
  const last = said.get(c.n);
  if (
    need * 0.6 <= t &&
    t <= need &&
    (last === undefined || Math.abs(sessionTime - last) > SAY_REPEAT_S)
  ) {
    return { n: c.n, text };
  }
  return null;
}
