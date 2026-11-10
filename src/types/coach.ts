/**
 * Braking coach data kept per track (tips, the side each corner turns) and per
 * track and car (the driver's own marks). Stored in the same shape as Dex
 * Overlay's coach folder (notes/, marks/, turns/), so its files can be copied
 * across as they are.
 */

/** A tip for one corner of a track (from a track guide, or written by hand). */
export interface CoachNote {
  /** Lap fraction of the corner. */
  p: number;
  label?: string;
  note?: string;
  /** Short spoken reference point, read out before the brake point. */
  say?: string;
  /** Hidden corners give no cues. */
  hide?: boolean;
}

/** The driver's own adjustment to a corner: brake point, minimum, gear. */
export interface CoachMark {
  p: number;
  bp?: number;
  vmin?: number;
  gear?: number;
}

/** Steering through one clean lap, resampled like a reference lap. */
export interface CoachTurns {
  n: number;
  lengthM: number;
  /** Radians, positive = left. */
  steer: number[];
}

/**
 * What the coach follows on a track with this car: your best lap, the
 * imported ("professor's") lap, or half-way between the two.
 */
export type CoachFollowMode = 'mine' | 'pro' | 'mix';

/** Everything the coach keeps for one track (and car). */
export interface CoachTrackData {
  /** Your choice for this track and car; null = the widget's default. */
  follow: CoachFollowMode | null;
  notes: CoachNote[];
  /** Where the tips came from (a track guide), shown in Settings. */
  notesSource: string;
  marks: CoachMark[];
  turns: CoachTurns | null;
}

/** The track and car being driven now, for the Settings window. */
export interface CoachSessionInfo {
  /** `${TrackID}_${TrackConfigName}`, the coach's per-track key. */
  trackKey: string;
  trackId: number;
  trackConfigName: string;
  trackName: string;
  carPath: string;
  carName: string;
  /** e.g. "GT3 Class" (CarClassShortName); '' when unknown. */
  carClass: string;
  /** From WeekendInfo.TrackLength; null when it cannot be read. */
  lengthM: number | null;
}

export interface CoachBridge {
  getTrackData: (trackKey: string, carPath: string) => Promise<CoachTrackData>;
  saveNotes: (
    trackKey: string,
    trackName: string,
    notes: CoachNote[]
  ) => Promise<void>;
  saveMarks: (
    trackKey: string,
    carPath: string,
    trackName: string,
    marks: CoachMark[]
  ) => Promise<void>;
  clearMarks: (trackKey: string, carPath: string) => Promise<void>;
  /** null goes back to the widget's default. */
  setFollow: (
    trackKey: string,
    carPath: string,
    mode: CoachFollowMode | null
  ) => Promise<void>;
  /** Kept only when the track has none yet (the first clean lap). */
  saveTurns: (trackKey: string, turns: CoachTurns) => Promise<void>;
  getCurrentSession: () => Promise<CoachSessionInfo | null>;
  /** Some window saved coach data for this track: reload it. */
  onChanged: (callback: (trackKey: string) => void) => () => void;
  /** The "mark brake point" key binding was pressed. */
  onMark: (callback: () => void) => () => void;
  /**
   * The phrase spoken by a Windows voice, as a WAV file; null when there is
   * none (not Windows, or the voice failed). `voice` '' picks one for `lang`.
   */
  synthesize: (
    text: string,
    voice: string,
    lang: string,
    rate: number
  ) => Promise<Uint8Array | null>;
  /** The Windows voices installed. */
  listVoices: () => Promise<CoachVoiceInfo[]>;
}

export interface CoachVoiceInfo {
  name: string;
  /** e.g. "pt-BR" */
  culture: string;
}

/** Dex Overlay's file names: anything but letters, digits, `.` and `-` becomes `_`. */
export const coachSafeName = (s: string): string =>
  s.replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '') || 'x';

/** The per-track key, the same as Dex Overlay's (Summit Point is "9"). */
export const coachTrackKey = (
  trackId: number,
  trackConfigName: string | null | undefined
): string => coachSafeName(`${trackId}_${trackConfigName ?? ''}`);
