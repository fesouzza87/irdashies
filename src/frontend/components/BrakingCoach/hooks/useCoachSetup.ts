import { useEffect, useMemo, useState } from 'react';
import {
  coachTrackKey,
  type CoachBridge,
  type CoachTrackData,
} from '@irdashies/types';
import { useLapTraceStore } from '@irdashies/context';
import { hydrateLapTrace } from '@irdashies/frontend/domain/lapTrace/hydrateLapTrace';
import { buildCoachRef } from '../engine/coachRef';
import { coachCornersFor, type CoachFollowMode } from '../engine/coachCorners';
import type { CoachCorner, CoachRef } from '../engine/types';

declare global {
  interface Window {
    coachBridge?: CoachBridge;
  }
}

export const EMPTY_TRACK_DATA: CoachTrackData = {
  notes: [],
  notesSource: '',
  marks: [],
  turns: null,
};

/**
 * Tips, marks and steering for one track and car, reloaded whenever any
 * window saves them (a mark key press, an edit in Settings).
 */
export const useCoachTrackData = (
  trackKey: string | null,
  carPath: string
): CoachTrackData => {
  const [data, setData] = useState<CoachTrackData>(EMPTY_TRACK_DATA);
  useEffect(() => {
    const bridge = window.coachBridge;
    setData(EMPTY_TRACK_DATA);
    if (!bridge || !trackKey) return;
    let live = true;
    const load = () => {
      bridge
        .getTrackData(trackKey, carPath)
        .then((d) => live && setData(d))
        .catch(() => undefined);
    };
    load();
    const off = bridge.onChanged((key) => {
      if (key === trackKey) load();
    });
    return () => {
      live = false;
      off();
    };
  }, [trackKey, carPath]);
  return data;
};

/** A stored lap of this track and car as a coach reference (null if none). */
export const useStoredCoachRef = (
  enabled: boolean,
  trackId: number | null,
  carPath: string,
  kind: 'best' | 'manual' | 'garage61',
  /** Changes when the stored lap may have changed. */
  revision: unknown
): CoachRef | null => {
  const [ref, setRef] = useState<CoachRef | null>(null);
  useEffect(() => {
    const bridge = window.lapTraceBridge;
    setRef(null);
    if (!enabled || !bridge || !trackId || !carPath) return;
    let live = true;
    bridge
      .getLapTrace(trackId, carPath, kind)
      .then((record) => {
        if (!live || !record) return;
        setRef(buildCoachRef(hydrateLapTrace(record)));
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [enabled, trackId, carPath, kind, revision]);
  return ref;
};

export interface CoachSetup {
  trackKey: string | null;
  carPath: string;
  lengthM: number | null;
  mode: CoachFollowMode;
  corners: CoachCorner[];
  timing: CoachRef | null;
  data: CoachTrackData;
}

/**
 * The corners the coach follows now. The lap in the Lap Trace store is the
 * reference: your best, or an imported lap (the "professor's"). With an
 * imported lap and `blend` on, the corners sit half-way between it and your
 * best, as Dex's default "mix" does.
 */
export const useCoachSetup = (blend: boolean): CoachSetup => {
  const referenceLap = useLapTraceStore((s) => s.referenceLap);
  const source = useLapTraceStore((s) => s.referenceSource);
  const trackId = useLapTraceStore((s) => s.trackId);
  const trackConfigName = useLapTraceStore((s) => s.trackConfigName);
  const carPath = useLapTraceStore((s) => s.carPath);
  const trackLengthM = useLapTraceStore((s) => s.trackLengthM);
  const bestLapTimeSec = useLapTraceStore((s) => s.bestLapTimeSec);

  const trackKey = trackId ? coachTrackKey(trackId, trackConfigName) : null;
  const data = useCoachTrackData(trackKey, carPath);

  const reference = useMemo(
    () => (referenceLap ? buildCoachRef(referenceLap) : null),
    [referenceLap]
  );
  const imported = source !== 'best';
  const storedBest = useStoredCoachRef(
    imported && blend,
    trackId,
    carPath,
    'best',
    bestLapTimeSec
  );
  const mine = imported ? storedBest : reference;
  const pro = imported ? reference : null;
  const mode: CoachFollowMode =
    pro && mine && blend ? 'mix' : pro ? 'pro' : 'mine';
  const lengthM = trackLengthM > 0 ? trackLengthM : null;

  const { corners, timing } = useMemo(
    () =>
      coachCornersFor({
        mine,
        pro,
        mode,
        notes: data.notes,
        marks: data.marks,
        turns: data.turns,
        lengthM,
      }),
    [mine, pro, mode, data, lengthM]
  );

  return { trackKey, carPath, lengthM, mode, corners, timing, data };
};
