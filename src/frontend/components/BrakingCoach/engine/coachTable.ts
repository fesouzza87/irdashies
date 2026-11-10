import type { CoachMark, CoachNote } from '@irdashies/types';
import { wrapHalf } from './coachRef';
import { NOTE_MATCH_M } from './detectCorners';
import type { CoachCorner, CornerKind } from './types';

/** One editable row of the corners table in Settings. */
export interface CoachTableRow {
  n: number;
  p: number;
  kind: CornerKind;
  hasRef: boolean;
  dir: string;
  /** The label the coach would give it without one of yours ("10a"). */
  autoLabel: string;
  /** Your label ('' = automatic). */
  label: string;
  note: string;
  say: string;
  hide: boolean;
  /** Brake point now (lap fraction), and your marked one if any. */
  bp: number;
  bpMark: number | null;
  vmin: number | null;
  /** The minimum without your adjustment. */
  vminRef: number | null;
  gear: number | null;
  gearRef: number | null;
}

/** The table, from the corners as the coach uses them. */
export function coachTableRows(
  corners: readonly CoachCorner[],
  notes: readonly CoachNote[],
  length: number
): CoachTableRow[] {
  const L = length || 4000;
  const used = new Set<number>();
  return corners.map((c) => {
    let near = -1;
    let best = Infinity;
    notes.forEach((nt, k) => {
      const d = Math.abs(wrapHalf(Number(nt.p) - c.p)) * L;
      if (d <= NOTE_MATCH_M && d < best && !used.has(k)) {
        best = d;
        near = k;
      }
    });
    if (near >= 0) used.add(near);
    const nt = near >= 0 ? notes[near] : undefined;
    return {
      n: c.n,
      p: c.p,
      kind: c.kind,
      hasRef: c.hasRef,
      dir: c.dir ?? '',
      autoLabel: c.label,
      label: (nt?.label ?? '').trim(),
      note: c.note,
      say: c.say ?? '',
      hide: !!c.hidden,
      bp: c.bp,
      bpMark: c.marked ? c.bp : null,
      vmin: c.vmin,
      vminRef: c.vminRef !== undefined ? c.vminRef : c.vmin,
      gear: c.gear,
      gearRef: c.gearRef !== undefined ? c.gearRef : c.gear,
    };
  });
}

/** What to save from the table: tips for the track, marks for this car. */
export function coachTableToSave(rows: readonly CoachTableRow[]): {
  notes: CoachNote[];
  marks: CoachMark[];
} {
  const notes: CoachNote[] = [];
  const marks: CoachMark[] = [];
  for (const r of rows) {
    const label = r.label.trim();
    const say = r.say.trim();
    if (label || r.note || say || r.hide) {
      const nt: CoachNote = { p: r.p, label, note: r.note };
      if (say) nt.say = say;
      if (r.hide) nt.hide = true;
      notes.push(nt);
    }
    const m: CoachMark = { p: r.p };
    if (r.bpMark !== null) m.bp = r.bpMark;
    if (r.vmin !== null && r.vmin !== r.vminRef) m.vmin = r.vmin;
    if (r.gear !== null && r.gear !== r.gearRef) m.gear = r.gear;
    if (Object.keys(m).length > 1) marks.push(m);
  }
  return { notes, marks };
}
