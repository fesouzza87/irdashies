import { ipcMain } from 'electron';
import {
  coachTrackKey,
  type CoachSessionInfo,
  type Session,
} from '@irdashies/types';
import logger from '../logger';
import type { OverlayManager } from '../overlayManager';
import {
  clearCoachMarks,
  getCoachTrackData,
  saveCoachMarks,
  saveCoachNotes,
  saveCoachTurns,
} from '../storage/coachData';

/** Messages the braking coach listens for in every window. */
export const COACH_CHANGED = 'coach:changed';
export const COACH_MARK = 'coach:mark';

const isKey = (v: unknown): v is string =>
  typeof v === 'string' && v.length > 0 && v.length <= 200;
const isCar = (v: unknown): v is string =>
  typeof v === 'string' && v.length <= 200;

/** The track and car being driven, from the latest session data. */
export const coachSessionFromSession = (
  session: Session | undefined
): CoachSessionInfo | null => {
  const weekend = session?.WeekendInfo;
  const trackId = weekend?.TrackID;
  const playerCarIdx = session?.DriverInfo?.DriverCarIdx ?? -1;
  const player = (session?.DriverInfo?.Drivers ?? []).find(
    (d) => d?.CarIdx === playerCarIdx
  );
  if (!trackId || trackId <= 0 || !player?.CarPath) return null;
  const [val, unit] = weekend?.TrackLength?.split(' ') ?? [];
  const length = unit === 'km' ? parseFloat(val) * 1000 : parseFloat(val);
  const trackConfigName = weekend?.TrackConfigName ?? '';
  return {
    trackKey: coachTrackKey(trackId, trackConfigName),
    trackId,
    trackConfigName,
    trackName: [
      weekend?.TrackDisplayName || weekend?.TrackName,
      trackConfigName,
    ]
      .filter(Boolean)
      .join(' – '),
    carPath: player.CarPath,
    carName: player.CarScreenName || player.CarPath,
    lengthM: Number.isFinite(length) && length > 0 ? length : null,
  };
};

export const setupCoachBridge = (overlayManager?: OverlayManager) => {
  const changed = (trackKey: string) =>
    overlayManager?.publishMessage(COACH_CHANGED, trackKey);

  ipcMain.handle(
    'coach:getTrackData',
    async (_, trackKey: unknown, carPath: unknown) => {
      if (!isKey(trackKey) || !isCar(carPath)) {
        throw new TypeError('Invalid payload for coach:getTrackData');
      }
      try {
        return await getCoachTrackData(trackKey, carPath);
      } catch (e) {
        logger.warn('[Coach] Failed to read track data', e);
        return { notes: [], notesSource: '', marks: [], turns: null };
      }
    }
  );

  ipcMain.handle(
    'coach:saveNotes',
    async (_, trackKey: unknown, trackName: unknown, notes: unknown) => {
      if (!isKey(trackKey) || typeof trackName !== 'string') {
        throw new TypeError('Invalid payload for coach:saveNotes');
      }
      await saveCoachNotes(trackKey, trackName.slice(0, 200), notes);
      changed(trackKey);
    }
  );

  ipcMain.handle(
    'coach:saveMarks',
    async (
      _,
      trackKey: unknown,
      carPath: unknown,
      trackName: unknown,
      marks: unknown
    ) => {
      if (
        !isKey(trackKey) ||
        !isKey(carPath) ||
        typeof trackName !== 'string'
      ) {
        throw new TypeError('Invalid payload for coach:saveMarks');
      }
      await saveCoachMarks(trackKey, carPath, trackName.slice(0, 200), marks);
      changed(trackKey);
    }
  );

  ipcMain.handle(
    'coach:clearMarks',
    async (_, trackKey: unknown, carPath: unknown) => {
      if (!isKey(trackKey) || !isKey(carPath)) {
        throw new TypeError('Invalid payload for coach:clearMarks');
      }
      await clearCoachMarks(trackKey, carPath);
      changed(trackKey);
    }
  );

  ipcMain.handle('coach:saveTurns', async (_, trackKey: unknown, turns) => {
    if (!isKey(trackKey)) {
      throw new TypeError('Invalid payload for coach:saveTurns');
    }
    if (await saveCoachTurns(trackKey, turns)) changed(trackKey);
  });

  ipcMain.handle('coach:getCurrentSession', () =>
    coachSessionFromSession(
      overlayManager?.getLatestSessionData() as Session | undefined
    )
  );
};
