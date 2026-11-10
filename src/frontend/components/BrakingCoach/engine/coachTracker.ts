import { mod, refTimeAt, wrapHalf } from './coachRef';
import type {
  CoachBeep,
  CoachBeepMode,
  CoachCorner,
  CoachCornerInfo,
  CoachFeedback,
  CoachRef,
  CoachSample,
  CoachState,
  TipCode,
} from './types';

/** How long the corner summary stays up, ms. */
export const FEEDBACK_MS = 5000;

export interface CoachTrackerOptions {
  beep: CoachBeepMode;
  /** How many seconds before the brake point the warning appears (2 to 6). */
  lookS: number;
  /** Show the summary on the exit of each corner. */
  feedback: boolean;
}

/** One pass through one corner. */
interface Pass {
  ok: boolean;
  /** Where you braked, metres from the reference brake point. */
  ub: number | null;
  /** Your minimum speed through the corner, km/h. */
  vmin: number | null;
  /** Where you got back on the throttle, metres from the brake point. */
  ut: number | null;
  released: boolean;
  free: boolean;
  lifted: boolean;
  braked: boolean;
  turned: boolean;
  /** SessionTime 50 m before the brake point and 50 m past the throttle point. */
  tw0: number | null;
  tw1: number | null;
  prev: [number, number] | null;
  beeps: Set<number | 'b'>;
  go: number | null;
  bmax: number;
}

const newPass = (): Pass => ({
  ok: true,
  ub: null,
  vmin: null,
  ut: null,
  released: false,
  free: false,
  lifted: false,
  braked: false,
  turned: false,
  tw0: null,
  tw1: null,
  prev: null,
  beeps: new Set(),
  go: null,
  bmax: 0,
});

/** The advice for a corner summary. Same rules, in the same order, as the original. */
export function tipCode(fb: Omit<CoachFeedback, 'tip'>): TipCode {
  const { dt, brk: b, vmin: vm, thr: th } = fb;
  if (dt <= -0.03) return 'better';
  if (b !== null && b > 8 && vm !== null && vm < -3) return 'brake_earlier';
  if (vm !== null && vm > 4 && th !== null && th > 10) return 'overspeed';
  if (b !== null && b < -12 && dt > 0.02) return 'braked_early';
  if (vm !== null && vm < -4) return 'carry';
  if (th !== null && th > 10) return 'throttle';
  return Math.abs(dt) < 0.03 ? 'ok' : 'near';
}

/**
 * Follows the car through each corner at telemetry rate: warns before the
 * brake point, calls the brake and the throttle, and compares each finished
 * corner with the reference. Pure apart from its own state; the clock is
 * passed in.
 */
export class CoachTracker {
  private corners: CoachCorner[] = [];
  private timing: CoachRef | null = null;
  private length = 4000;
  private passes = new Map<number, Pass>();
  private lastFb: (CoachFeedback & { until: number }) | null = null;
  private lastPass = new Map<number, CoachFeedback>();

  constructor(private options: CoachTrackerOptions) {}

  setOptions(options: CoachTrackerOptions) {
    this.options = options;
  }

  /** New corners (reference, tips or marks changed): passes in progress are dropped. */
  setCorners(
    corners: readonly CoachCorner[],
    timing: CoachRef | null,
    length: number | null
  ) {
    this.corners = corners.filter((c) => !c.hidden);
    this.timing = timing;
    this.length = length || timing?.lengthM || 4000;
    this.passes.clear();
    this.lastPass.clear();
  }

  get cornerCount() {
    return this.corners.length;
  }

  private finishPass(i: number, ps: Pass, now: number) {
    const c = this.corners[i];
    const R = this.timing;
    if (!c || !c.hasRef || !ps.ok || ps.tw0 === null || ps.tw1 === null || !R)
      return;
    const L = this.length;
    const a = mod(c.bp - 50 / L, 1);
    const b = mod(c.tp + 50 / L, 1);
    const rdt = mod(refTimeAt(R, b) - refTimeAt(R, a), R.lapSec);
    const dt = ps.tw1 - ps.tw0 - rdt;
    const sTp = mod(c.tp - c.bp, 1) * L;
    const base = {
      n: c.n,
      label: c.label,
      dt: Math.round(dt * 100) / 100,
      brk: ps.ub === null || c.kind !== 'brake' ? null : Math.round(ps.ub),
      vmin:
        ps.vmin === null || c.vmin === null
          ? null
          : Math.round(ps.vmin - c.vmin),
      vminV: ps.vmin === null ? null : Math.round(ps.vmin),
      thr: ps.ut === null ? null : Math.round(ps.ut - sTp),
    };
    const fb: CoachFeedback = { ...base, tip: tipCode(base) };
    this.lastFb = { ...fb, until: now + FEEDBACK_MS };
    this.lastPass.set(c.n, fb);
  }

  /** Exact (interpolated) time you passed `at` metres into this corner. */
  private static cross(
    ps: Pass,
    key: 'tw0' | 'tw1',
    s: number,
    T: number,
    at: number
  ) {
    if (ps[key] === null && s >= at) {
      const pr = ps.prev;
      ps[key] =
        pr && pr[0] < at && s > pr[0]
          ? pr[1] + ((T - pr[1]) * (at - pr[0])) / (s - pr[0])
          : T;
    }
  }

  private track(
    c: CoachCorner,
    ps: Pass,
    s: number,
    T: number,
    x: CoachSample,
    L: number
  ) {
    if (!x.ok) ps.ok = false;
    const sMin = mod(c.p - c.bp, 1) * L;
    const sTp = mod(c.tp - c.bp, 1) * L;
    CoachTracker.cross(ps, 'tw0', s, T, -50);
    CoachTracker.cross(ps, 'tw1', s, T, sTp + 50);
    ps.prev = [s, T];
    if (x.brake > ps.bmax) ps.bmax = x.brake;
    if (x.brake < 0.05) {
      // Foot off the brake (still braking for the corner before does not count).
      ps.free = true;
    } else if (ps.free && s >= -(c.room ?? 150)) {
      ps.braked = true;
      if (ps.ub === null) ps.ub = s;
    }
    if (s >= 0 && s <= sTp + 30 && (ps.vmin === null || x.speedKph < ps.vmin))
      ps.vmin = x.speedKph;
    if (ps.braked && x.brake < 0.05) ps.released = true;
    if (s >= -30 && x.throttle < 0.5) ps.lifted = true;
    if (
      ps.ut === null &&
      x.throttle >= 0.5 &&
      x.brake < 0.05 &&
      s >= 0 &&
      s > sMin - 80 &&
      (c.kind === 'brake' ? ps.released : ps.lifted)
    ) {
      ps.ut = s;
    }
  }

  private withFeedback(st: CoachState, now: number): CoachState {
    if (this.options.feedback && this.lastFb && this.lastFb.until > now) {
      const { until: _until, ...fb } = this.lastFb;
      void _until;
      st.feedback = fb;
    }
    return st;
  }

  private nextCorner(pct: number, L: number) {
    let best: [number, CoachCorner] | null = null;
    for (const c of this.corners) {
      const d = mod(c.bp - pct, 1) * L;
      if (best === null || d < best[0]) best = [d, c];
    }
    return best
      ? { label: best[1].label, d: Math.round(best[0]), dir: best[1].dir ?? '' }
      : undefined;
  }

  /** One telemetry frame in, what the overlay shows out. `now` in ms. */
  feed(x: CoachSample, now: number): CoachState {
    const beeps: CoachBeep[] = [];
    const pct = x.pct >= 0 ? x.pct : null;
    if (!this.corners.length || pct === null) {
      this.passes.clear();
      return this.withFeedback(
        { phase: this.corners.length ? 'idle' : 'noref', beeps },
        now
      );
    }
    const L = this.length;
    const T = x.sessionTime;
    const v = Math.max(x.speedKph, 1) / 3.6;
    const look = Math.max(120, Math.min(450, v * this.options.lookS));

    // Every corner nearby has its own pass (corners close together are
    // followed at the same time).
    const near = new Map<number, number>();
    this.corners.forEach((c, i) => {
      const s = wrapHalf(pct - c.bp) * L;
      const sTp = mod(c.tp - c.bp, 1) * L;
      if (s >= -look && s <= sTp + 70) near.set(i, s);
    });
    for (const [i, ps] of [...this.passes]) {
      if (!near.has(i)) {
        this.passes.delete(i);
        this.finishPass(i, ps, now);
      }
    }
    const inside = new Map<number, number>();
    for (const [i, s] of near) {
      let ps = this.passes.get(i);
      if (!ps) {
        ps = newPass();
        this.passes.set(i, ps);
      }
      this.track(this.corners[i], ps, s, T, x, L);
      const sTp = mod(this.corners[i].tp - this.corners[i].bp, 1) * L;
      if (s >= 0 && s < sTp + 40) inside.set(i, s);
    }

    const st = this.withFeedback({ phase: 'idle', beeps }, now);
    const next = this.nextCorner(pct, L);
    if (next) st.next = next;

    let act: number;
    if (inside.size) {
      // Inside a corner: the most recent one.
      act = [...inside].reduce((m, e) => (e[1] < m[1] ? e : m))[0];
    } else {
      const ahead = [...near].filter(([, s]) => s < 0);
      if (!ahead.length) return st;
      act = ahead.reduce((m, e) => (e[1] > m[1] ? e : m))[0];
    }
    const c = this.corners[act];
    const s = near.get(act);
    const ps = this.passes.get(act);
    if (s === undefined || !ps) return st;
    const sMin = mod(c.p - c.bp, 1) * L;
    const sTp = mod(c.tp - c.bp, 1) * L;
    const info: CoachCornerInfo = {
      n: c.n,
      label: c.label,
      note: c.note,
      kind: c.kind,
      vmin: c.vmin,
      gear: c.gear,
      pk: c.pk,
      marked: !!c.marked,
      dir: c.dir ?? '',
    };
    const last = this.lastPass.get(c.n);
    if (last && last.vmin !== null) info.lastVmin = last.vmin;
    st.corner = info;

    const beep = this.options.beep;
    if (s < 0) {
      st.phase = 'approach';
      st.d = Math.round(-s);
      st.k = Math.round(Math.max(0, Math.min(1, 1 + s / look)) * 1000) / 1000;
      if (beep !== 'off' && c.kind !== 'note' && ps.ok && x.speedKph > 40) {
        const tt = -s / v;
        for (const th of [1.5, 1.0, 0.5]) {
          if (tt <= th && !ps.beeps.has(th)) {
            ps.beeps.add(th);
            // Only on time: a threshold crossed long ago stays quiet.
            if (tt > th - 0.25) beeps.push('short');
          }
        }
      }
    } else if (c.kind === 'note') {
      st.phase = 'note';
    } else if (
      !ps.turned &&
      s < Math.max(8, sMin * 0.8) &&
      (c.kind === 'brake' || c.kind === 'lift') &&
      (x.brake > 0.05 || s < 25)
    ) {
      st.phase = c.kind === 'brake' ? 'brake' : 'lift';
      if (beep !== 'off' && !ps.beeps.has('b') && ps.ok && s < 15) {
        ps.beeps.add('b');
        beeps.push('brake');
      }
    } else if (s < sTp) {
      ps.turned = true;
      st.phase = 'turn';
      st.d = Math.round(sTp - s);
      st.k =
        Math.round(
          Math.max(
            0,
            Math.min(1, 1 - (sTp - s) / Math.max(30, sTp - sMin + 30))
          ) * 1000
        ) / 1000;
    } else {
      st.phase = 'go';
      if (ps.go === null) {
        ps.go = now;
        if (beep === 'all' && ps.ok && x.brake < 0.1) beeps.push('go');
      }
    }
    return st;
  }
}
