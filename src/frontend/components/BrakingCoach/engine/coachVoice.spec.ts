import { describe, expect, it } from 'vitest';
import { makeSyntheticLapTrace } from '@irdashies/frontend/domain/lapTrace/syntheticLap';
import { hydrateLapTrace } from '@irdashies/frontend/domain/lapTrace/hydrateLapTrace';
import { buildCoachRef, mod, refTimeBetween } from './coachRef';
import { mergeCorners } from './coachCorners';
import {
  SAY_MARGIN,
  SAY_REPEAT_S,
  SAY_WPS,
  sayDue,
  speechRate,
  spokenWords,
} from './coachVoice';
import type { CoachRef } from './types';

const L = 5000;
const ref = buildCoachRef(
  hydrateLapTrace(makeSyntheticLapTrace({ trackLengthM: L }))
) as CoachRef;

describe('spokenWords', () => {
  it('counts numbers as the words they are read out as', () => {
    expect(spokenWords('ponte')).toBe(1);
    expect(spokenWords('placa de 100')).toBe(3); // "cem"
    expect(spokenWords('placa de 150')).toBe(5); // "cento e cinquenta"
    expect(spokenWords('placa 75')).toBe(4); // "setenta e cinco"
    expect(spokenWords('freie 50%')).toBe(4); // "cinquenta por cento"
    expect(spokenWords('freie a 125')).toBe(7); // "cento e vinte e cinco"
  });

  it('maps the voice speed like the Windows voice (a third to triple)', () => {
    expect(speechRate(0)).toBe(1);
    expect(speechRate(10)).toBeCloseTo(3);
    expect(speechRate(-10)).toBeCloseTo(1 / 3);
    expect(speechRate(99)).toBeCloseTo(3);
  });
});

describe('sayDue', () => {
  const notes = [{ p: 1100 / L, say: 'a ponte' }];
  const corners = mergeCorners(ref, notes, [], L);
  const c = corners.find((x) => x.say);
  if (!c) throw new Error('no corner with a reference point');
  const need = SAY_MARGIN + spokenWords('a ponte') / SAY_WPS;

  /** The lap fraction `sec` seconds before the brake point, at the reference pace. */
  const before = (sec: number) => {
    for (let i = 1; i < ref.n; i++) {
      const p = mod(c.bp - i / ref.n, 1);
      const t = refTimeBetween(ref, p, c.bp);
      if (t !== null && t >= sec) return p;
    }
    throw new Error('not found');
  };
  const fast = 300; // km/h: time to the brake point comes from the reference

  it('speaks when the call would end SAY_MARGIN before the brake point', () => {
    const due = sayDue(
      corners,
      before(need * 0.9),
      100,
      fast,
      ref,
      L,
      0,
      new Map()
    );
    expect(due).toEqual({ n: c.n, text: 'a ponte' });
  });

  it('stays quiet too early and too late', () => {
    expect(
      sayDue(corners, before(need * 1.5), 100, fast, ref, L, 0, new Map())
    ).toBeNull();
    expect(
      sayDue(corners, before(need * 0.4), 100, fast, ref, L, 0, new Map())
    ).toBeNull();
  });

  it('does not repeat the same corner within SAY_REPEAT_S', () => {
    const p = before(need * 0.9);
    const said = new Map([[c.n, 100]]);
    expect(sayDue(corners, p, 105, fast, ref, L, 0, said)).toBeNull();
    expect(
      sayDue(corners, p, 100 + SAY_REPEAT_S + 1, fast, ref, L, 0, said)
    ).not.toBeNull();
  });

  it('says nothing for a hidden corner or one without a reference point', () => {
    expect(
      sayDue(mergeCorners(ref, [], [], L), 0.2, 100, fast, ref, L, 0, new Map())
    ).toBeNull();
    const hidden = mergeCorners(ref, [{ ...notes[0], hide: true }], [], L);
    expect(
      sayDue(hidden, before(need * 0.9), 100, fast, ref, L, 0, new Map())
    ).toBeNull();
  });
});
