import { describe, expect, it } from 'vitest';
import { makeSyntheticLapTrace } from '@irdashies/frontend/domain/lapTrace/syntheticLap';
import { hydrateLapTrace } from '@irdashies/frontend/domain/lapTrace/hydrateLapTrace';
import { binsFor, buildCoachRef, refTimeAt, wrapHalf } from './coachRef';
import { blendCorners, cornerDir, detectCorners } from './detectCorners';
import {
  addCornerDirs,
  defaultFollowMode,
  effectiveCorners,
  mergeCorners,
} from './coachCorners';
import { CoachTracker, tipCode } from './coachTracker';
import type { CoachPhase, CoachRef, CoachSample } from './types';

const APEXES = [400, 1100, 1800, 2600, 3200, 3900, 4600];
const L = 5000;

const syntheticRef = (apexSpeedsMs?: number[]): CoachRef => {
  const view = hydrateLapTrace(
    makeSyntheticLapTrace({ trackLengthM: L, apexSpeedsMs })
  );
  const ref = buildCoachRef(view);
  if (!ref) throw new Error('no ref');
  return ref;
};

describe('buildCoachRef', () => {
  it('resamples the lap onto one point every ~3 m in km/h', () => {
    const ref = syntheticRef();
    expect(ref.n).toBe(binsFor(L));
    expect(ref.n).toBe(1667);
    expect(ref.spd).toHaveLength(ref.n);
    expect(Math.max(...ref.spd)).toBeCloseTo(75 * 3.6, 0);
    // Time only ever runs forward around the lap.
    for (let i = 1; i < ref.n; i++)
      expect(ref.t[i]).toBeGreaterThanOrEqual(ref.t[i - 1]);
  });

  it('caps the number of points for very short and very long tracks', () => {
    expect(binsFor(600)).toBe(400);
    expect(binsFor(25000)).toBe(4000);
  });

  it('interpolates the reference time at any lap fraction', () => {
    const ref = syntheticRef();
    expect(refTimeAt(ref, 0)).toBe(ref.t[0]);
    const mid = refTimeAt(ref, 0.5);
    expect(mid).toBeGreaterThan(ref.t[Math.floor(ref.n / 2) - 1]);
    expect(mid).toBeLessThan(ref.t[Math.floor(ref.n / 2) + 1]);
  });
});

describe('detectCorners', () => {
  it('finds each corner, brake point before the apex and throttle after it', () => {
    const ref = syntheticRef();
    const corners = detectCorners(ref);
    expect(corners).toHaveLength(APEXES.length);
    corners.forEach((c, i) => {
      const apexPct = APEXES[i] / L;
      expect(Math.abs(wrapHalf(c.p - apexPct)) * L).toBeLessThan(10);
      expect(c.kind).toBe('brake');
      expect(wrapHalf(c.bp - c.p)).toBeLessThan(0);
      // The throttle point can sit one point before the smoothed apex.
      expect(wrapHalf(c.tp - c.p) * L).toBeGreaterThan(-5);
      expect(c.pk).toBeGreaterThan(50);
    });
    // Read at the smoothed slowest point, so a little above the raw minimum.
    expect(Math.abs(corners[2].vmin - 22 * 3.6)).toBeLessThan(3);
  });

  it('ignores a slow-down smaller than 5 km/h', () => {
    const ref = syntheticRef([74, 74.5, 74, 74.5, 74, 74.5, 74]);
    expect(detectCorners(ref)).toHaveLength(0);
  });
});

describe('cornerDir', () => {
  const n = 1000;
  const steer = (fill: (i: number) => number) =>
    Array.from({ length: n }, (_, i) => fill(i));

  it('reads a right-hander from negative lock', () => {
    const s = steer((i) => (i >= 100 && i < 160 ? -0.4 : 0));
    expect(cornerDir(s, n, 0.09, 0.17, 5000)).toBe('R');
  });

  it('reads a chicane in order', () => {
    const s = steer((i) =>
      i >= 100 && i < 140 ? 0.4 : i >= 140 && i < 180 ? -0.4 : 0
    );
    expect(cornerDir(s, n, 0.09, 0.19, 5000)).toBe('LR');
  });

  it('is empty when the wheel barely turns', () => {
    expect(
      cornerDir(
        steer(() => 0.02),
        n,
        0.1,
        0.2,
        5000
      )
    ).toBe('');
  });
});

describe('mergeCorners', () => {
  it('names corners from the track tips and numbers the rest after them', () => {
    const ref = syntheticRef();
    const notes = [
      { p: 400 / L, label: '1', note: 'Freie forte' },
      { p: 1800 / L, label: '3', note: '' },
    ];
    const corners = mergeCorners(ref, notes, [], L);
    expect(corners.map((c) => c.label)).toEqual([
      '1',
      '1a',
      '3',
      '3a',
      '3b',
      '3c',
      '3d',
    ]);
    expect(corners[0].note).toBe('Freie forte');
    expect(corners.map((c) => c.n)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('numbers corners 1..n when no tip has a name', () => {
    const corners = mergeCorners(syntheticRef(), [], [], L);
    expect(corners.map((c) => c.label)).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
    ]);
  });

  it('keeps a tip with no detected corner as a note 120 m before it', () => {
    const corners = mergeCorners(
      null,
      [{ p: 0.5, label: 'X', note: 'Cuidado' }],
      [],
      L
    );
    expect(corners).toHaveLength(1);
    expect(corners[0].kind).toBe('note');
    expect(corners[0].bp).toBeCloseTo(0.5 - 120 / L, 6);
  });

  it('applies a mark to the nearest corner only', () => {
    const ref = syntheticRef();
    const det = detectCorners(ref);
    const corners = mergeCorners(
      ref,
      [],
      [{ p: det[1].p, bp: det[1].bp - 0.002, vmin: 150, gear: 3 }],
      L
    );
    expect(corners[1].marked).toBe(true);
    expect(corners[1].bp).toBeCloseTo(det[1].bp - 0.002, 6);
    expect(corners[1].bpRef).toBe(det[1].bp);
    expect(corners[1].vmin).toBe(150);
    expect(corners[1].gear).toBe(3);
    expect(corners[0].marked).toBeUndefined();
  });

  it('leaves the room back to the previous corner between 15 and 150 m', () => {
    for (const c of mergeCorners(syntheticRef(), [], [], L)) {
      expect(c.room).toBeGreaterThanOrEqual(15);
      expect(c.room).toBeLessThanOrEqual(150);
    }
  });

  it('sets each corner side from the steering', () => {
    const ref = syntheticRef();
    const corners = mergeCorners(ref, [], [], L);
    const steer = Array.from({ length: ref.n }, (_, i) => {
      const d = (i / ref.n) * L;
      return Math.abs(d - 400) < 60 ? -0.3 : 0;
    });
    addCornerDirs(corners, steer, L);
    expect(corners[0].dir).toBe('R');
    expect(corners[1].dir).toBe('');
  });
});

describe('follow modes', () => {
  it('defaults to half-way when both laps exist', () => {
    expect(defaultFollowMode(undefined, true, true)).toBe('mix');
    expect(defaultFollowMode(undefined, false, true)).toBe('pro');
    expect(defaultFollowMode('pro', true, false)).toBe('mine');
    expect(defaultFollowMode('mine', true, true)).toBe('mine');
  });

  it('half-way puts the brake point between the two laps', () => {
    const mine = detectCorners(syntheticRef());
    const pro = mine.map((c) => ({
      ...c,
      bp: c.bp + 0.004,
      vmin: c.vmin + 10,
    }));
    const mix = blendCorners(mine, pro, L);
    expect(mix[0].bp).toBeCloseTo(mine[0].bp + 0.002, 5);
    expect(mix[0].vmin).toBe(mine[0].vmin + 5);
  });

  it("drops the other driver's gears when the lap is from another car", () => {
    const ref = syntheticRef();
    const { corners, timing } = effectiveCorners(
      null,
      ref,
      'pro',
      [],
      [],
      L,
      true
    );
    expect(timing).toBe(ref);
    expect(corners.every((c) => c.gear === null && c.pk === null)).toBe(true);
  });
});

describe('tipCode', () => {
  const fb = (
    dt: number,
    brk: number | null,
    vmin: number | null,
    thr: number | null
  ) => ({
    n: 1,
    label: '1',
    dt,
    brk,
    vmin,
    vminV: null,
    thr,
  });

  it('follows the original rules in order', () => {
    expect(tipCode(fb(-0.05, 20, -10, 20))).toBe('better');
    expect(tipCode(fb(0.2, 10, -5, null))).toBe('brake_earlier');
    expect(tipCode(fb(0.2, null, 5, 15))).toBe('overspeed');
    expect(tipCode(fb(0.1, -15, 0, 0))).toBe('braked_early');
    expect(tipCode(fb(0.1, 0, -6, 0))).toBe('carry');
    expect(tipCode(fb(0.1, 0, 0, 12))).toBe('throttle');
    expect(tipCode(fb(0.01, 0, 0, 0))).toBe('ok');
    expect(tipCode(fb(0.05, 0, 0, 0))).toBe('near');
  });
});

describe('CoachTracker', () => {
  /** Drives the reference lap itself through the tracker, frame by frame. */
  const drive = (
    ref: CoachRef,
    tracker: CoachTracker,
    tweak?: (x: CoachSample, i: number) => CoachSample
  ) => {
    const states = [];
    for (let i = 0; i < ref.n; i++) {
      let x: CoachSample = {
        pct: i / ref.n,
        sessionTime: 1000 + ref.t[i],
        speedKph: ref.spd[i],
        brake: ref.brk[i],
        throttle: ref.thr[i],
        gear: ref.gear[i],
        ok: true,
      };
      if (tweak) x = tweak(x, i);
      states.push(tracker.feed(x, (1000 + ref.t[i]) * 1000));
    }
    return states;
  };

  const setup = (beep: 'off' | 'brake' | 'all' = 'brake') => {
    const ref = syntheticRef();
    const { corners, timing } = effectiveCorners(ref, null, 'mine', [], [], L);
    const tracker = new CoachTracker({ beep, lookS: 3.5, feedback: true });
    tracker.setCorners(corners, timing, L);
    return { ref, tracker, corners };
  };

  it('asks for a reference when there are no corners', () => {
    const tracker = new CoachTracker({
      beep: 'brake',
      lookS: 3.5,
      feedback: true,
    });
    tracker.setCorners([], null, L);
    expect(
      tracker.feed(
        {
          pct: 0.1,
          sessionTime: 1,
          speedKph: 100,
          brake: 0,
          throttle: 1,
          gear: 4,
          ok: true,
        },
        0
      ).phase
    ).toBe('noref');
  });

  it('goes approach → brake → turn → go through each corner', () => {
    const { ref, tracker } = setup();
    const phases = drive(ref, tracker).map((s) => s.phase);
    const order: CoachPhase[] = [];
    for (const p of phases) if (order[order.length - 1] !== p) order.push(p);
    const firstCorner = order.slice(
      order.indexOf('approach'),
      order.indexOf('go') + 1
    );
    expect(firstCorner).toEqual(['approach', 'brake', 'turn', 'go']);
    expect(phases.filter((p) => p === 'brake').length).toBeGreaterThan(0);
  });

  it('counts the distance down to the brake point while approaching', () => {
    const { ref, tracker } = setup();
    const states = drive(ref, tracker);
    const start = states.findIndex((s) => s.phase === 'approach');
    const end = states.findIndex((s, i) => i > start && s.phase !== 'approach');
    const approach = states.slice(start, end);
    expect(approach[0].d).toBeGreaterThan(approach[approach.length - 1].d ?? 0);
    expect(approach[approach.length - 1].k).toBeGreaterThan(0.9);
  });

  it('matching the reference gives a near-zero summary', () => {
    const { ref, tracker } = setup();
    const fbs = drive(ref, tracker)
      .map((s) => s.feedback)
      .filter((f) => f !== undefined);
    expect(fbs.length).toBeGreaterThan(0);
    const fb = fbs[0];
    if (!fb) throw new Error('no summary');
    expect(Math.abs(fb.dt)).toBeLessThan(0.03);
    expect(Math.abs(fb.brk ?? 0)).toBeLessThanOrEqual(4);
    expect(fb.vmin).toBe(0);
    expect(['ok', 'near', 'better']).toContain(fb.tip);
  });

  it('flags a slower corner and reports the lower minimum', () => {
    const { ref, tracker, corners } = setup();
    const c = corners[0];
    // 10 km/h slower and 0.3 s lost through the first corner.
    const states = drive(ref, tracker, (x, i) => {
      const s = wrapHalf(x.pct - c.bp) * L;
      const sTp = wrapHalf(c.tp - c.bp) * L;
      if (s >= 0 && s <= sTp + 30) x = { ...x, speedKph: x.speedKph - 10 };
      if (s > sTp) x = { ...x, sessionTime: x.sessionTime + 0.3 };
      void i;
      return x;
    });
    const fb = states.map((s) => s.feedback).find((f) => f?.n === c.n);
    if (!fb) throw new Error('no summary');
    expect(fb.vmin).toBe(-10);
    expect(fb.dt).toBeCloseTo(0.3, 1);
    expect(fb.tip).toBe('carry');
  });

  it('beeps three times on the approach and once at the brake point', () => {
    const { ref, tracker } = setup('brake');
    const states = drive(ref, tracker);
    // Up to the end of the first corner.
    const firstGo = states.findIndex((s) => s.phase === 'go');
    const beeps = states.slice(0, firstGo + 1).flatMap((s) => s.beeps);
    expect(beeps.filter((b) => b === 'short')).toHaveLength(3);
    expect(beeps.filter((b) => b === 'brake')).toHaveLength(1);
    expect(beeps).not.toContain('go');
  });

  it('stays quiet with beeps off, and beeps on the throttle with all', () => {
    const { ref: r1, tracker: off } = setup('off');
    expect(drive(r1, off).flatMap((s) => s.beeps)).toHaveLength(0);
    const { ref: r2, tracker: all } = setup('all');
    expect(drive(r2, all).flatMap((s) => s.beeps)).toContain('go');
  });

  it('a pass with the car off track gives no summary', () => {
    const { ref, tracker } = setup();
    const states = drive(ref, tracker, (x) => ({ ...x, ok: false }));
    expect(states.some((s) => s.feedback)).toBe(false);
  });
});
