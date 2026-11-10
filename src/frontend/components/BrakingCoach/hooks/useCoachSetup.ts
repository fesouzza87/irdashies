import { useEffect, useMemo, useState } from 'react';
import {
  coachTrackKey,
  type CoachBridge,
  type CoachFollowMode,
  type CoachTrackData,
  type LapTraceSource,
} from '@irdashies/types';
import { useLapTraceStore, useSessionStore } from '@irdashies/context';
import { hydrateLapTrace } from '@irdashies/frontend/domain/lapTrace/hydrateLapTrace';
import {
  GARAGE61_IMPORT_CAR_PATH,
  GARAGE61_IMPORT_TRACK_ID,
} from '@irdashies/frontend/domain/lapTrace/garage61CsvImport';
import {
  IBT_IMPORT_CAR_PATH,
  IBT_IMPORT_TRACK_ID,
} from '@irdashies/frontend/domain/lapTrace/ibtLapImport';
import { buildCoachRef } from '../engine/coachRef';
import { coachCornersFor } from '../engine/coachCorners';
import {
  importedKinds,
  importedLapFit,
  resolveFollowMode,
  type CurrentCar,
  type ImportedLapFit,
} from '../engine/coachLapMatch';
import type { CoachCorner, CoachRef } from '../engine/types';

declare global {
  interface Window {
    coachBridge?: CoachBridge;
  }
}

export const EMPTY_TRACK_DATA: CoachTrackData = {
  follow: null,
  notes: [],
  notesSource: '',
  marks: [],
  turns: null,
};

/** The track and car being driven, as the coach identifies them. */
export interface CoachContext extends CurrentCar {
  trackKey: string;
  trackId: number;
}

/**
 * Tips, marks, steering and the follow choice for one track and car,
 * reloaded whenever any window saves them (a mark key press, Settings).
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

/** Bumps when an imported or best lap is replaced in any window. */
export const useLapRevision = (): number => {
  const [revision, setRevision] = useState(0);
  useEffect(
    () =>
      window.lapTraceBridge?.onReferenceUpdated(() =>
        setRevision((r) => r + 1)
      ),
    []
  );
  return revision;
};

const IMPORT_SLOTS = {
  garage61: [GARAGE61_IMPORT_TRACK_ID, GARAGE61_IMPORT_CAR_PATH],
  manual: [IBT_IMPORT_TRACK_ID, IBT_IMPORT_CAR_PATH],
} as const;

export interface CoachLaps {
  mine: CoachRef | null;
  pro: CoachRef | null;
  /** How the imported lap fits; null when there is none. */
  proFit: ImportedLapFit | null;
  /** The imported lap's label (driver - car - track, or the file name). */
  proLabel: string;
  proKind: 'garage61' | 'manual' | null;
}

type Imported = Omit<CoachLaps, 'mine'>;
const NO_IMPORT: Imported = {
  pro: null,
  proFit: null,
  proLabel: '',
  proKind: null,
};

/**
 * Your best lap and the imported one for this track and car. `liveBest` is
 * the store's best lap when it holds it (fresher than disk); undefined reads
 * the stored one.
 */
export const useCoachLaps = (
  ctx: CoachContext | null,
  referenceSource: LapTraceSource,
  liveBest: CoachRef | null | undefined,
  revision: unknown
): CoachLaps => {
  const [storedBest, setStoredBest] = useState<CoachRef | null>(null);
  const [imported, setImported] = useState<Imported>(NO_IMPORT);
  const trackId = ctx?.trackId ?? null;
  const carPath = ctx?.carPath ?? '';
  const needStoredBest = liveBest === undefined;

  useEffect(() => {
    const bridge = window.lapTraceBridge;
    setStoredBest(null);
    if (!needStoredBest || !bridge || !trackId || !carPath) return;
    let live = true;
    bridge
      .getLapTrace(trackId, carPath, 'best')
      .then((r) => {
        if (live) setStoredBest(r ? buildCoachRef(hydrateLapTrace(r)) : null);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [needStoredBest, trackId, carPath, revision]);

  useEffect(() => {
    const bridge = window.lapTraceBridge;
    setImported(NO_IMPORT);
    if (!bridge || !ctx) return;
    let live = true;
    void (async () => {
      let fallback: Imported | null = null;
      for (const kind of importedKinds(referenceSource)) {
        const [slotTrack, slotCar] = IMPORT_SLOTS[kind];
        const record = await bridge
          .getLapTrace(slotTrack, slotCar, kind)
          .catch(() => null);
        if (!record) continue;
        const fit = importedLapFit(
          {
            car: record.source.car,
            track: record.source.track,
            trackLengthM: record.trackLengthM,
          },
          ctx
        );
        const found: Imported = {
          pro:
            fit === 'mismatch' ? null : buildCoachRef(hydrateLapTrace(record)),
          proFit: fit,
          proLabel: record.source.label,
          proKind: kind,
        };
        if (fit !== 'mismatch') {
          if (live) setImported(found);
          return;
        }
        fallback ??= found;
      }
      if (live && fallback) setImported(fallback);
    })();
    return () => {
      live = false;
    };
  }, [ctx, referenceSource, revision]);

  return {
    mine: liveBest === undefined ? storedBest : liveBest,
    ...imported,
  };
};

export interface CoachModel extends CoachLaps {
  data: CoachTrackData;
  mode: CoachFollowMode;
  corners: CoachCorner[];
  timing: CoachRef | null;
  lengthM: number | null;
}

/** Everything the coach follows on this track with this car. */
export const useCoachModel = (
  ctx: CoachContext | null,
  referenceSource: LapTraceSource,
  blend: boolean,
  liveBest: CoachRef | null | undefined,
  revision: unknown
): CoachModel => {
  const data = useCoachTrackData(ctx?.trackKey ?? null, ctx?.carPath ?? '');
  const laps = useCoachLaps(ctx, referenceSource, liveBest, revision);
  const mode = resolveFollowMode(
    data.follow,
    referenceSource,
    blend,
    !!laps.mine,
    !!laps.pro
  );
  const lengthM = ctx?.lengthM ?? null;
  const { corners, timing } = useMemo(
    () =>
      coachCornersFor({
        mine: laps.mine,
        pro: laps.pro,
        mode,
        notes: data.notes,
        marks: data.marks,
        turns: data.turns,
        lengthM,
        proOtherCar: laps.proFit === 'otherCar',
      }),
    [laps.mine, laps.pro, laps.proFit, mode, data, lengthM]
  );
  return { ...laps, data, mode, corners, timing, lengthM };
};

export interface CoachSetup extends CoachModel {
  trackKey: string | null;
  carPath: string;
}

/** The overlay's view: the track and car from the live session. */
export const useCoachSetup = (
  referenceSource: LapTraceSource,
  blend: boolean
): CoachSetup => {
  const referenceLap = useLapTraceStore((s) => s.referenceLap);
  const source = useLapTraceStore((s) => s.referenceSource);
  const trackId = useLapTraceStore((s) => s.trackId);
  const trackConfigName = useLapTraceStore((s) => s.trackConfigName);
  const carPath = useLapTraceStore((s) => s.carPath);
  const trackLengthM = useLapTraceStore((s) => s.trackLengthM);
  const bestLapTimeSec = useLapTraceStore((s) => s.bestLapTimeSec);
  const trackDisplayName = useSessionStore(
    (s) =>
      s.session?.WeekendInfo?.TrackDisplayName ??
      s.session?.WeekendInfo?.TrackName ??
      ''
  );
  const carName = useSessionStore((s) => {
    const info = s.session?.DriverInfo;
    return (
      info?.Drivers?.find((d) => d?.CarIdx === info.DriverCarIdx)
        ?.CarScreenName ?? ''
    );
  });
  const carClass = useSessionStore((s) => {
    const info = s.session?.DriverInfo;
    return (
      info?.Drivers?.find((d) => d?.CarIdx === info.DriverCarIdx)
        ?.CarClassShortName ?? ''
    );
  });
  const lapRevision = useLapRevision();

  const trackKey = trackId ? coachTrackKey(trackId, trackConfigName) : null;
  const lengthM = trackLengthM > 0 ? trackLengthM : null;
  const ctx = useMemo<CoachContext | null>(
    () =>
      trackKey && trackId
        ? {
            trackKey,
            trackId,
            carPath,
            carName,
            carClass,
            trackName: [trackDisplayName, trackConfigName]
              .filter(Boolean)
              .join(' – '),
            lengthM,
          }
        : null,
    [
      trackKey,
      trackId,
      carPath,
      carName,
      carClass,
      trackDisplayName,
      trackConfigName,
      lengthM,
    ]
  );
  // The store holds your best while it is the reference: the freshest copy.
  const reference = useMemo(
    () => (referenceLap ? buildCoachRef(referenceLap) : null),
    [referenceLap]
  );
  const liveBest = source === 'best' ? reference : undefined;
  const model = useCoachModel(
    ctx,
    referenceSource,
    blend,
    liveBest,
    `${bestLapTimeSec}:${lapRevision}`
  );
  return { ...model, trackKey, carPath };
};
