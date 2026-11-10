import type { CoachMark, CoachNote, CoachTurns } from '@irdashies/types';

/**
 * Cleaning of coach data before it is written, the same limits as Dex
 * Overlay's save_notes/save_marks. Pure, so it is shared by the main process
 * and its tests.
 */

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const finite = (v: unknown): number | null => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};

const round5 = (v: number) => Math.round(v * 1e5) / 1e5;
const mod1 = (v: number) => ((v % 1) + 1) % 1;

/** Tips worth keeping: a label, a tip, a spoken point or hidden. */
export function cleanNotes(input: unknown): CoachNote[] {
  if (!Array.isArray(input)) return [];
  const out: CoachNote[] = [];
  for (const c of input) {
    if (!isRecord(c)) continue;
    const p = finite(c.p);
    if (p === null) continue;
    const label = String(c.label ?? '')
      .trim()
      .slice(0, 12);
    const note = String(c.note ?? '').slice(0, 600);
    const say = String(c.say ?? '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120);
    const hide = c.hide === true;
    if (!note && !label && !say && !hide) continue;
    const e: CoachNote = { p: round5(mod1(p)), label, note };
    if (hide) e.hide = true;
    if (say) e.say = say;
    out.push(e);
  }
  return out;
}

/** Marks with at least one adjustment (brake point, minimum or gear). */
export function cleanMarks(input: unknown): CoachMark[] {
  if (!Array.isArray(input)) return [];
  const out: CoachMark[] = [];
  for (const m of input) {
    if (!isRecord(m)) continue;
    const p = finite(m.p);
    if (p === null) continue;
    const e: CoachMark = { p: round5(mod1(p)) };
    const bp = finite(m.bp);
    if (bp !== null) e.bp = round5(mod1(bp));
    const vmin = finite(m.vmin);
    if (vmin !== null) e.vmin = Math.round(vmin);
    const gear = finite(m.gear);
    if (gear !== null) e.gear = Math.trunc(gear);
    if (Object.keys(e).length > 1) out.push(e);
  }
  return out;
}

/** A steering trace that matches its own point count, or null. */
export function cleanTurns(input: unknown): CoachTurns | null {
  if (!isRecord(input)) return null;
  const n = finite(input.n);
  const lengthM = finite(input.lengthM ?? input.length_m);
  const steer = input.steer;
  if (
    n === null ||
    !Number.isInteger(n) ||
    n < 100 ||
    n > 10000 ||
    !Array.isArray(steer) ||
    steer.length !== n ||
    !steer.every((v) => typeof v === 'number' && Number.isFinite(v))
  )
    return null;
  return {
    n,
    lengthM: lengthM !== null && lengthM > 0 ? lengthM : 0,
    steer: steer.map((v: number) => Math.round(v * 1000) / 1000),
  };
}
