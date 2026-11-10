import { describe, expect, it } from 'vitest';
import { makeSyntheticLapTrace } from '@irdashies/frontend/domain/lapTrace/syntheticLap';
import { hydrateLapTrace } from '@irdashies/frontend/domain/lapTrace/hydrateLapTrace';
import { binsFor, buildCoachRef } from './coachRef';
import { coachCornersFor, mergeCorners } from './coachCorners';
import { markAt, MARK_MATCH_M, TurnsRecorder } from './coachMarks';
import { coachTableRows, coachTableToSave } from './coachTable';
import type { CoachRef } from './types';

const L = 5000;
const APEXES = [400, 1100, 1800, 2600, 3200, 3900, 4600];

const syntheticRef = (): CoachRef => {
  const ref = buildCoachRef(
    hydrateLapTrace(makeSyntheticLapTrace({ trackLengthM: L }))
  );
  if (!ref) throw new Error('no ref');
  return ref;
};

describe('marking a brake point', () => {
  it('moves the nearest corner brake point to where the key was pressed', () => {
    const corners = mergeCorners(syntheticRef(), [], [], L);
    const c = corners[2];
    const pressAt = c.bp + 20 / L;
    const result = markAt(pressAt, corners, [], L);
    expect(result?.corner.n).toBe(c.n);
    expect(result?.marks).toEqual([
      { p: c.p, bp: Math.round(pressAt * 1e5) / 1e5 },
    ]);

    // The coach now brakes there, flagged as your mark.
    const marked = mergeCorners(syntheticRef(), [], result?.marks ?? [], L);
    expect(marked[2].bp).toBeCloseTo(pressAt, 4);
    expect(marked[2].marked).toBe(true);
    expect(marked[2].bpRef).toBe(c.bp);
  });

  it('keeps the other adjustments of that corner and replaces its old mark', () => {
    const corners = mergeCorners(syntheticRef(), [], [], L);
    const c = corners[0];
    const marks = [{ p: c.p, bp: c.bp - 0.001, vmin: 80 }];
    const result = markAt(c.bp, corners, marks, L);
    expect(result?.marks).toEqual([
      { p: c.p, bp: Math.round(c.bp * 1e5) / 1e5, vmin: 80 },
    ]);
  });

  it('ignores a press far from any brake point', () => {
    const corners = mergeCorners(syntheticRef(), [], [], L);
    // Half-way between two brake points ~700 m apart.
    const gap = (corners[1].bp - corners[0].bp) * L;
    expect(gap / 2).toBeGreaterThan(MARK_MATCH_M);
    const mid = (corners[0].bp + corners[1].bp) / 2;
    expect(markAt(mid, corners, [], L)).toBeNull();
  });
});

describe('recording the steering', () => {
  /**
   * Turning left up to 2250 m (between the corners at 1800 and 2600 m) and
   * right after it.
   */
  const drive = (rec: TurnsRecorder, laps: number, broken = false) => {
    let out = null;
    const steps = 4000;
    for (let lap = 0; lap < laps; lap++) {
      for (let i = 0; i < steps; i++) {
        const pct = i / steps;
        const ok = !(broken && lap === 1 && i === 2000);
        const r = rec.feed(pct, pct < 0.45 ? 0.3 : -0.3, ok, 0);
        if (r) out = r;
      }
    }
    // Cross the line once more to finish the last lap.
    return rec.feed(0.0001, 0, true, 0) ?? out;
  };

  it('keeps a full clean lap, once the line is crossed after it', () => {
    const rec = new TurnsRecorder();
    rec.reset(L);
    const turns = drive(rec, 2);
    expect(turns?.n).toBe(binsFor(L));
    expect(turns?.steer[100]).toBeCloseTo(0.3);
    expect(turns?.steer[turns.n - 100]).toBeCloseTo(-0.3);
  });

  it('drops a lap that went off track, and the out lap joined mid-way', () => {
    const rec = new TurnsRecorder();
    rec.reset(L);
    // Lap 0 starts at the line but the recorder only trusts laps it saw start.
    expect(drive(rec, 2, true)).toBeNull();
  });

  it('gives each corner its side from the steering', () => {
    const rec = new TurnsRecorder();
    rec.reset(L);
    const turns = drive(rec, 2);
    const { corners } = coachCornersFor({
      mine: syntheticRef(),
      pro: null,
      mode: 'mine',
      notes: [],
      marks: [],
      turns,
      lengthM: L,
    });
    expect(corners).toHaveLength(APEXES.length);
    corners.forEach((c, i) =>
      expect(c.dir).toBe(APEXES[i] < 0.45 * L ? 'L' : 'R')
    );
  });
});

describe('corners table', () => {
  it('round-trips tips and adjustments through the table', () => {
    const ref = syntheticRef();
    const notes = [{ p: APEXES[1] / L, label: '2', note: 'Ponte' }];
    const corners = mergeCorners(ref, notes, [], L);
    const rows = coachTableRows(corners, notes, L);
    expect(rows[1]).toMatchObject({ label: '2', note: 'Ponte' });
    expect(rows[0].label).toBe('');
    // Before the first named corner: "0a", as Dex numbers it.
    expect(rows[0].autoLabel).toBe('0a');

    rows[0] = {
      ...rows[0],
      say: 'placa de 100',
      vmin: (rows[0].vmin ?? 0) - 5,
    };
    rows[3] = { ...rows[3], hide: true };
    const { notes: saved, marks } = coachTableToSave(rows);
    expect(saved.map((n) => n.label)).toEqual(['', '2', '']);
    expect(saved[0].say).toBe('placa de 100');
    expect(saved[2].hide).toBe(true);
    expect(marks).toEqual([{ p: rows[0].p, vmin: rows[0].vmin }]);

    const again = mergeCorners(ref, saved, marks, L);
    expect(again[0].vmin).toBe(rows[0].vmin);
    expect(again[0].edited).toBe(true);
    expect(again[3].hidden).toBe(true);
  });
});
