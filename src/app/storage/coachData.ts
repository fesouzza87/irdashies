import { app } from 'electron';
import fsp from 'node:fs/promises';
import path from 'node:path';
import {
  coachSafeName,
  type CoachFollowMode,
  type CoachMark,
  type CoachNote,
  type CoachTrackData,
  type CoachTurns,
} from '@irdashies/types';
import logger from '../logger';
import { cleanMarks, cleanNotes, cleanTurns } from '../coach/coachDataSanitize';
import summitPoint from '../coach/defaultNotes/9.json';

/**
 * Braking coach files, laid out like Dex Overlay's coach folder:
 * notes/<track>.json, marks/<track>__<car>.json, turns/<track>.json. Small
 * files written rarely (an edit in Settings, a mark key press, the first clean
 * lap on a track), each written whole through a temporary file.
 */

type Kind = 'notes' | 'marks' | 'turns';

/** Tips that ship with the app, used until the driver saves their own. */
const DEFAULT_NOTES: Record<string, unknown> = { '9': summitPoint };

const coachDir = () => path.join(app.getPath('userData'), 'coach');

const fileFor = (kind: Kind, trackKey: string, carPath?: string) =>
  path.join(
    coachDir(),
    kind,
    coachSafeName(trackKey) +
      (carPath ? `__${coachSafeName(carPath)}` : '') +
      '.json'
  );

/** Error logs reach analytics: a filesystem error carries the user's path. */
const errorCode = (error: unknown): string =>
  (error as NodeJS.ErrnoException)?.code ?? 'UNKNOWN';

const readJson = async (file: string): Promise<unknown> => {
  try {
    return JSON.parse(await fsp.readFile(file, 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      logger.warn('[Coach] Failed to read a coach file', errorCode(error));
    }
    return null;
  }
};

const writeJson = async (file: string, data: unknown): Promise<void> => {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  try {
    await fsp.writeFile(temp, JSON.stringify(data, null, 1), 'utf8');
    await fsp.rename(temp, file);
  } catch (error) {
    await fsp.unlink(temp).catch(() => undefined);
    logger.error('[Coach] Failed to write a coach file', errorCode(error));
    throw error;
  }
};

const field = (doc: unknown, key: string): unknown =>
  doc && typeof doc === 'object' ? (doc as Record<string, unknown>)[key] : null;

export const getCoachTrackData = async (
  trackKey: string,
  carPath: string
): Promise<CoachTrackData> => {
  const notesDoc =
    (await readJson(fileFor('notes', trackKey))) ??
    DEFAULT_NOTES[coachSafeName(trackKey)] ??
    null;
  const marksDoc = carPath
    ? await readJson(fileFor('marks', trackKey, carPath))
    : null;
  const turnsDoc = await readJson(fileFor('turns', trackKey));
  const follow = carPath
    ? field(await readJson(followFile()), followKey(trackKey, carPath))
    : null;
  return {
    follow: isFollowMode(follow) ? follow : null,
    notes: cleanNotes(field(notesDoc, 'corners')),
    notesSource: String(field(notesDoc, 'source') ?? ''),
    marks: cleanMarks(field(marksDoc, 'marks')),
    turns: cleanTurns(turnsDoc),
  };
};

export const saveCoachNotes = async (
  trackKey: string,
  trackName: string,
  notes: unknown
): Promise<void> => {
  const file = fileFor('notes', trackKey);
  const old =
    (await readJson(file)) ?? DEFAULT_NOTES[coachSafeName(trackKey)] ?? null;
  await writeJson(file, {
    v: 1,
    track: trackName || String(field(old, 'track') ?? ''),
    source: String(field(old, 'source') ?? ''),
    corners: cleanNotes(notes) satisfies CoachNote[],
  });
};

export const saveCoachMarks = async (
  trackKey: string,
  carPath: string,
  trackName: string,
  marks: unknown
): Promise<void> => {
  await writeJson(fileFor('marks', trackKey, carPath), {
    v: 1,
    track: trackName,
    car: carPath,
    marks: cleanMarks(marks) satisfies CoachMark[],
  });
};

export const clearCoachMarks = async (
  trackKey: string,
  carPath: string
): Promise<void> => {
  await fsp
    .unlink(fileFor('marks', trackKey, carPath))
    .catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
    });
};

/** Keeps the first clean lap's steering; later ones change nothing. */
export const saveCoachTurns = async (
  trackKey: string,
  turns: unknown
): Promise<boolean> => {
  const clean: CoachTurns | null = cleanTurns(turns);
  if (!clean) return false;
  const file = fileFor('turns', trackKey);
  if (cleanTurns(await readJson(file))) return false;
  await writeJson(file, {
    v: 1,
    track: trackKey,
    n: clean.n,
    length_m: clean.lengthM,
    steer: clean.steer,
  });
  return true;
};

/** follow.json: one choice per track and car, as Dex keeps it. */
const followFile = () => path.join(coachDir(), 'follow.json');
const followKey = (trackKey: string, carPath: string) =>
  `${coachSafeName(trackKey)}__${coachSafeName(carPath)}`;
const isFollowMode = (v: unknown): v is CoachFollowMode =>
  v === 'mine' || v === 'pro' || v === 'mix';

export const setCoachFollow = async (
  trackKey: string,
  carPath: string,
  mode: unknown
): Promise<void> => {
  const doc = await readJson(followFile());
  const key = followKey(trackKey, carPath);
  const all = Object.fromEntries(
    Object.entries(
      doc && typeof doc === 'object' && !Array.isArray(doc) ? doc : {}
    ).filter(([k]) => k !== key)
  );
  if (isFollowMode(mode)) all[key] = mode;
  await writeJson(followFile(), all);
};
