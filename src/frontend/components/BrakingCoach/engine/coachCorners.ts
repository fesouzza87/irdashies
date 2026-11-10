import { mod, wrapHalf } from './coachRef';
import {
  blendCorners,
  cornerDir,
  detectCorners,
  NOTE_MATCH_M,
} from './detectCorners';
import type {
  CoachCorner,
  CoachMark,
  CoachNote,
  CoachRef,
  DetectedCorner,
} from './types';

export type CoachFollowMode = 'mine' | 'pro' | 'mix';

const SUFFIXES = 'abcdefghijklmnopqrstuvwxyz';

/**
 * The corners the coach uses: detected in the reference, named from the track
 * tips, adjusted by the driver's own marks. Tips with no detected corner (or
 * no reference yet) still warn by position.
 */
export function mergeCorners(
  ref: CoachRef | null,
  notes: readonly CoachNote[],
  marks: readonly CoachMark[],
  length: number | null,
  blend?: readonly DetectedCorner[],
  keepGear = false
): CoachCorner[] {
  const L = length || ref?.lengthM || 4000;
  const used = new Set<number>();
  let det = ref ? detectCorners(ref) : [];
  if (blend) det = blendCorners(det, blend, L, 0.5, keepGear);

  const out: CoachCorner[] = [];
  for (const d of det) {
    const c: CoachCorner = {
      ...d,
      n: 0,
      hasRef: true,
      label: '',
      note: '',
    };
    let best: [number, number] | null = null;
    notes.forEach((nt, k) => {
      const dist = Math.abs(wrapHalf(Number(nt.p) - c.p)) * L;
      if (
        dist <= NOTE_MATCH_M &&
        !used.has(k) &&
        (best === null || dist < best[0])
      ) {
        best = [dist, k];
      }
    });
    if (best) {
      const k = (best as [number, number])[1];
      used.add(k);
      const nt = notes[k];
      c.label = nt.label ?? '';
      c.note = nt.note ?? '';
      if (nt.say) c.say = nt.say;
      if (nt.hide) c.hidden = true;
    }
    out.push(c);
  }

  notes.forEach((nt, k) => {
    if (used.has(k)) return;
    const p = Number(nt.p);
    const c: CoachCorner = {
      n: 0,
      p,
      bp: mod(p - 120 / L, 1),
      tp: p,
      kind: 'note',
      vmin: null,
      gear: null,
      pk: null,
      hasRef: false,
      label: nt.label ?? '',
      note: nt.note ?? '',
    };
    if (nt.say) c.say = nt.say;
    if (nt.hide) c.hidden = true;
    out.push(c);
  });

  // Each mark applies to the nearest corner only.
  for (const mk of marks) {
    let near: CoachCorner | undefined;
    for (const c of out) {
      if (
        !near ||
        Math.abs(wrapHalf(Number(mk.p) - c.p)) <
          Math.abs(wrapHalf(Number(mk.p) - near.p))
      )
        near = c;
    }
    if (!near || Math.abs(wrapHalf(Number(mk.p) - near.p)) * L > NOTE_MATCH_M)
      continue;
    if (mk.bp !== undefined && mk.bp !== null) {
      near.bpRef = near.bpRef ?? near.bp;
      near.bp = Number(mk.bp);
      near.marked = true;
    }
    if (mk.vmin !== undefined && mk.vmin !== null) {
      near.vminRef = near.vminRef !== undefined ? near.vminRef : near.vmin;
      near.vmin = Math.trunc(mk.vmin);
      near.edited = true;
    }
    if (mk.gear !== undefined && mk.gear !== null) {
      near.gearRef = near.gearRef !== undefined ? near.gearRef : near.gear;
      near.gear = Math.trunc(mk.gear);
      near.edited = true;
    }
  }

  out.sort((a, b) => (a.hasRef ? a.bp : a.p) - (b.hasRef ? b.bp : b.p));

  // A track with official numbering in its tips: an extra corner becomes "10a"
  // (just after 10) without disturbing the order; before the first tip, "0a";
  // more than one in the same stretch, "10a", "10b"...
  const named = notes.some((nt) => (nt.label ?? '').trim());
  let prev = '';
  const extra = new Map<string, number>();
  out.forEach((c, i) => {
    c.n = i + 1;
    if (!c.label) {
      if (named) {
        const base = prev || '0';
        const k = extra.get(base) ?? 0;
        extra.set(base, k + 1);
        c.label = base + SUFFIXES[Math.min(k, 25)];
      } else {
        c.label = String(i + 1);
      }
    } else if (!c.hidden) {
      const tail = c.label.split('–').at(-1)?.split('-').at(-1)?.trim() ?? '';
      prev = tail.replace(/[a-z]+$/, '') || c.label;
    }
  });

  // Room back to the previous corner: braking before that is the other
  // corner's braking.
  const withRef = out.filter((c) => c.hasRef && !c.hidden);
  withRef.forEach((c, k) => {
    const before = withRef[(k - 1 + withRef.length) % withRef.length];
    c.room =
      withRef.length < 2
        ? 150
        : Math.min(150, Math.max(15, mod(c.bp - before.tp, 1) * L - 5));
  });
  return out;
}

/**
 * What to follow when there is no saved choice: half-way when both laps
 * exist, otherwise whichever exists.
 */
export function defaultFollowMode(
  saved: CoachFollowMode | undefined,
  hasMine: boolean,
  hasPro: boolean
): CoachFollowMode {
  if (
    (saved === 'mine' && hasMine) ||
    (saved === 'pro' && hasPro) ||
    (saved === 'mix' && hasMine && hasPro)
  ) {
    return saved;
  }
  if (hasMine && hasPro) return 'mix';
  if (hasMine) return 'mine';
  if (hasPro) return 'pro';
  return 'mine';
}

/**
 * The corners the coach uses and the lap its timing is measured against, for
 * the chosen mode. `proOtherCar`: the other driver's lap was driven in another
 * car of the same category, so its gears do not fit this gearbox.
 */
export function effectiveCorners(
  mine: CoachRef | null,
  pro: CoachRef | null,
  mode: CoachFollowMode,
  notes: readonly CoachNote[],
  marks: readonly CoachMark[],
  length: number | null,
  proOtherCar = false
): { corners: CoachCorner[]; timing: CoachRef | null } {
  if (mode === 'pro' && pro) {
    const corners = mergeCorners(pro, notes, marks, length);
    if (proOtherCar) {
      for (const c of corners) {
        c.gear = null;
        c.pk = null;
      }
    }
    return { corners, timing: pro };
  }
  if (mode === 'mix' && mine && pro) {
    return {
      corners: mergeCorners(
        mine,
        notes,
        marks,
        length,
        detectCorners(pro),
        proOtherCar
      ),
      timing: mine,
    };
  }
  return { corners: mergeCorners(mine, notes, marks, length), timing: mine };
}

/**
 * Sets the side each corner turns to ('R', 'L', 'RL'...), from the steering of
 * a lap round this track.
 */
export function addCornerDirs(
  corners: CoachCorner[],
  steer: readonly number[] | undefined,
  length: number | null
): CoachCorner[] {
  if (!steer?.length || !corners.length) return corners;
  const n = steer.length;
  const L = length || 4000;
  const start = (c: CoachCorner) => (c.hasRef ? c.bp : mod(c.p - 60 / L, 1));
  const order = [...corners].sort((a, b) => start(a) - start(b));
  order.forEach((c, k) => {
    const a = start(c);
    let b = mod((c.hasRef ? c.tp : c.p) + 60 / L, 1);
    if (order.length > 1) {
      // Do not run into the next corner.
      const nb = start(order[(k + 1) % order.length]);
      const gapNext = mod(nb - a, 1);
      if (gapNext > 0 && gapNext < mod(b - a, 1)) b = nb;
    }
    c.dir = cornerDir(steer, n, a, b, L);
  });
  return corners;
}
