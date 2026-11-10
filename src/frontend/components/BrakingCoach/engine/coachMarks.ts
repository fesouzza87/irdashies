import type { CoachMark, CoachTurns } from '@irdashies/types';
import { binsFor, mod, wrapHalf } from './coachRef';
import { NOTE_MATCH_M } from './detectCorners';
import type { CoachCorner } from './types';

/** The mark key applies to the corner whose brake point is within this, metres. */
export const MARK_MATCH_M = 250;

/**
 * Pressing the mark key at `pct`: the nearest corner (by its reference brake
 * point) gets its brake point moved here. Its other adjustments stay. Null
 * when no corner is close enough.
 */
export function markAt(
  pct: number,
  corners: readonly CoachCorner[],
  marks: readonly CoachMark[],
  length: number
): { marks: CoachMark[]; corner: CoachCorner } | null {
  const L = length || 4000;
  let best: [number, CoachCorner] | null = null;
  for (const c of corners) {
    if (c.hidden) continue;
    const base = c.bpRef ?? c.bp;
    const d = Math.abs(wrapHalf(pct - base)) * L;
    if (d <= MARK_MATCH_M && (best === null || d < best[0])) best = [d, c];
  }
  if (!best) return null;
  const c = best[1];
  const old = marks.find(
    (m) => Math.abs(wrapHalf(Number(m.p) - c.p)) * L <= NOTE_MATCH_M
  );
  const next = marks.filter((m) => m !== old);
  next.push({ ...old, p: c.p, bp: Math.round(mod(pct, 1) * 1e5) / 1e5 });
  return { marks: next, corner: c };
}

/**
 * Collects the steering through a lap so the side of each corner can be told
 * apart, as Dex keeps the first clean lap's steering for every track. One lap
 * at a time; a lap off track, in the pits or with an incident is dropped.
 */
export class TurnsRecorder {
  private sum: Float64Array = new Float64Array(0);
  private count: Uint16Array = new Uint16Array(0);
  private n = 0;
  private lengthM = 0;
  private prevPct: number | null = null;
  private clean = false;
  private incidents = -1;

  /** Starts over, for a new track (or length). */
  reset(lengthM: number) {
    this.lengthM = lengthM;
    this.n = binsFor(lengthM);
    this.sum = new Float64Array(this.n);
    this.count = new Uint16Array(this.n);
    this.prevPct = null;
    this.clean = false;
  }

  private startLap(incidents: number) {
    this.sum.fill(0);
    this.count.fill(0);
    this.clean = true;
    this.incidents = incidents;
  }

  /**
   * One frame. Returns the finished lap's steering when the line is crossed
   * at the end of a clean, fully covered lap.
   */
  feed(
    pct: number,
    steer: number,
    ok: boolean,
    incidents: number
  ): CoachTurns | null {
    if (!this.n || pct < 0) {
      this.prevPct = null;
      return null;
    }
    let out: CoachTurns | null = null;
    const prev = this.prevPct;
    if (prev !== null && prev > 0.9 && pct < 0.1) {
      // Crossed the line.
      if (this.clean) out = this.finish();
      this.startLap(incidents);
    } else if (prev === null || Math.abs(pct - prev) > 0.05) {
      // Joined mid-lap or jumped (a reset, a tow): this lap does not count.
      this.clean = false;
    }
    this.prevPct = pct;
    if (!ok || incidents !== this.incidents) this.clean = false;
    if (this.clean) {
      const i = Math.min(this.n - 1, Math.floor(pct * this.n));
      this.sum[i] += steer;
      this.count[i] += 1;
    }
    return out;
  }

  private finish(): CoachTurns | null {
    const { n } = this;
    let filled = 0;
    for (let i = 0; i < n; i++) if (this.count[i]) filled++;
    if (filled < n * 0.9) return null;
    // Average each point, then fill the gaps from the nearest points around.
    const v: (number | null)[] = Array.from({ length: n }, (_, i) =>
      this.count[i] ? this.sum[i] / this.count[i] : null
    );
    const steer: number[] = new Array(n);
    for (let i = 0; i < n; i++) {
      const x = v[i];
      if (x !== null) {
        steer[i] = x;
        continue;
      }
      let a = 1;
      while (a < n && v[mod(i - a, n)] === null) a++;
      let b = 1;
      while (b < n && v[mod(i + b, n)] === null) b++;
      const va = v[mod(i - a, n)] ?? 0;
      const vb = v[mod(i + b, n)] ?? 0;
      steer[i] = va + ((vb - va) * a) / (a + b);
    }
    return {
      n,
      lengthM: this.lengthM,
      steer: steer.map((s) => Math.round(s * 1000) / 1000),
    };
  }
}
