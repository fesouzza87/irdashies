/**
 * Braking coach engine — a TypeScript port of the braking coach in Dex Overlay
 * (coach.py, MIT License, Copyright (c) 2026 Dex Racing). The detection rules,
 * thresholds and phase logic follow the original so the coach behaves the same;
 * only the plumbing differs (the reference lap comes from the Lap Trace store,
 * and the clock is passed in so the engine stays pure and testable).
 */

/** A reference lap resampled onto `n` equally spaced points around the lap. */
export interface CoachRef {
  /** Number of points; one every ~3 m (400 to 4000 per lap). */
  n: number;
  lengthM: number;
  lapSec: number;
  /** km/h */
  spd: number[];
  /** 0..1 */
  brk: number[];
  /** 0..1 */
  thr: number[];
  gear: number[];
  /** Seconds since the start of the lap at each point. */
  t: number[];
  /** Steering wheel angle in radians, positive = left, when the lap has it. */
  steer?: number[];
}

export type CornerKind = 'brake' | 'lift' | 'note';

/** A corner found in a reference lap. Positions are lap fractions (0..1). */
export interface DetectedCorner {
  /** Slowest point. */
  p: number;
  /** Brake point (or lift point when the reference only lifted). */
  bp: number;
  /** Where the reference got back on the throttle. */
  tp: number;
  kind: Exclude<CornerKind, 'note'>;
  /** Minimum speed, km/h. */
  vmin: number;
  gear: number;
  /** Peak brake pressure, %. */
  pk: number;
}

export type { CoachMark, CoachNote } from '@irdashies/types';

/** A corner as the coach uses it: detected, named, adjusted. */
export interface CoachCorner {
  /** 1-based order around the lap. */
  n: number;
  p: number;
  bp: number;
  tp: number;
  kind: CornerKind;
  vmin: number | null;
  gear: number | null;
  pk: number | null;
  hasRef: boolean;
  label: string;
  note: string;
  say?: string;
  hidden?: boolean;
  marked?: boolean;
  edited?: boolean;
  bpRef?: number;
  vminRef?: number | null;
  gearRef?: number | null;
  /** Which way the corner turns: 'R', 'L', or a chicane such as 'RL'. */
  dir?: string;
  /** Room to the previous corner, metres: braking earlier than this is the other corner's braking. */
  room?: number;
}

export type TipCode =
  | 'better'
  | 'brake_earlier'
  | 'overspeed'
  | 'braked_early'
  | 'carry'
  | 'throttle'
  | 'ok'
  | 'near';

/** Summary of how a corner went against the reference, shown on the exit. */
export interface CoachFeedback {
  n: number;
  label: string;
  /** Time gained (negative) or lost (positive) through the corner, seconds. */
  dt: number;
  /** Metres later (positive) or earlier (negative) than the reference brake point. */
  brk: number | null;
  /** Minimum speed against the reference, km/h. */
  vmin: number | null;
  /** Minimum speed reached, km/h. */
  vminV: number | null;
  /** Metres later (positive) or earlier (negative) back on the throttle. */
  thr: number | null;
  tip: TipCode;
}

export type CoachPhase =
  'idle' | 'noref' | 'approach' | 'brake' | 'lift' | 'turn' | 'go' | 'note';

export interface CoachCornerInfo {
  n: number;
  label: string;
  note: string;
  kind: CornerKind;
  vmin: number | null;
  gear: number | null;
  pk: number | null;
  marked: boolean;
  dir: string;
  /** Minimum speed the last time through, against the target, km/h. */
  lastVmin?: number;
}

export type CoachBeep = 'short' | 'brake' | 'go';

/** What the overlay shows this frame. */
export interface CoachState {
  phase: CoachPhase;
  corner?: CoachCornerInfo;
  /** Metres to the brake point (approach) or to the throttle point (turn). */
  d?: number;
  /** Bar fill, 0..1. */
  k?: number;
  next?: { label: string; d: number; dir: string };
  feedback?: CoachFeedback;
  /** Beeps due this frame. */
  beeps: CoachBeep[];
}

/** One telemetry frame, as the coach reads it. */
export interface CoachSample {
  /** LapDistPct, 0..1; negative when unknown. */
  pct: number;
  /** SessionTime, seconds. */
  sessionTime: number;
  /** km/h */
  speedKph: number;
  /** 0..1 */
  brake: number;
  /** 0..1 */
  throttle: number;
  gear: number;
  /** On track and off pit road. */
  ok: boolean;
}

export type CoachBeepMode = 'off' | 'brake' | 'all';
