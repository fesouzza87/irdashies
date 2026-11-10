import type { CoachFollowMode, LapTraceSource } from '@irdashies/types';

/**
 * Whether an imported ("professor's") lap fits the track and car being
 * driven, and what to follow, as in Dex Overlay (category_of, g61_match,
 * pro_for, follow_mode).
 */

/** First match wins. Same list as Dex Overlay. */
const CATEGORIES: [string, RegExp][] = [
  ['GT3', /gt3/],
  ['BMW M2', /bmw ?m2/],
  ['Mazda MX-5', /mx-?5|miata/],
  ['Porsche Cup', /(911|992)[^g]*cup|porsche.*cup/],
  ['GT4', /gt4/],
];

/** The car's category (GT3, BMW M2, MX-5, Porsche Cup...) from its path, class or name. */
export function categoryOf(car = '', carClass = '', name = ''): string {
  const s = [car, carClass, name].join(' ').toLowerCase();
  for (const [label, pattern] of CATEGORIES) if (pattern.test(s)) return label;
  return (carClass || name || car).trim();
}

const ascii = (s: string) =>
  s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
const tokens = (s: string) => new Set(ascii(s).match(/[a-z0-9]+/g) ?? []);
const sameSet = (a: Set<string>, b: Set<string>) =>
  a.size === b.size && [...a].every((x) => b.has(x));

/** The imported lap's car is this car (by name, or by path). */
export function carMatches(
  importedCar: string,
  carPath: string,
  carName: string
): boolean {
  const ic = tokens(importedCar);
  if (!ic.size) return false;
  const flat = (s: string) => ascii(s).replace(/[^a-z0-9]/g, '');
  return sameSet(ic, tokens(carName)) || flat(importedCar) === flat(carPath);
}

/** The imported lap's track is this track and layout (same words, any order). */
export function trackMatches(
  importedTrack: string,
  trackName: string
): boolean {
  const it = tokens(importedTrack);
  return it.size > 0 && sameSet(it, tokens(trackName));
}

export interface ImportedLapInfo {
  car?: string;
  track?: string;
  /** Length of the track the lap was recorded on, metres. */
  trackLengthM: number;
}

export interface CurrentCar {
  carPath: string;
  carName: string;
  carClass: string;
  /** Track display name with its layout. */
  trackName: string;
  lengthM: number | null;
}

export type ImportedLapFit =
  | 'same'
  /** Another car of the same category: its gears and pressures do not apply. */
  | 'otherCar'
  /** Another category, or another track: not used by the coach. */
  | 'mismatch';

/**
 * How an imported lap fits. The track is checked by name when the lap
 * carries one, and by length when it does not (or the names are spelled
 * differently): a lap of another circuit would put every cue in the wrong
 * place.
 */
export function importedLapFit(
  lap: ImportedLapInfo,
  current: CurrentCar
): ImportedLapFit {
  const L = current.lengthM;
  const dl = L && lap.trackLengthM > 0 ? Math.abs(lap.trackLengthM - L) / L : 0;
  const named = !!lap.track?.trim();
  const sameTrack =
    (named && trackMatches(lap.track ?? '', current.trackName)) ||
    dl <= (named ? 0.01 : 0.03);
  if (!sameTrack) return 'mismatch';
  const car = lap.car?.trim() ?? '';
  // No car in the lap: trusted as this car, like an .ibt of your own.
  if (!car || carMatches(car, current.carPath, current.carName)) return 'same';
  return categoryOf('', '', car) ===
    categoryOf(current.carPath, current.carClass, current.carName)
    ? 'otherCar'
    : 'mismatch';
}

/** Which imported lap to look at first: the one the widget points to, else Garage 61. */
export const importedKinds = (
  referenceSource: LapTraceSource
): ('garage61' | 'manual')[] =>
  referenceSource === 'manual'
    ? ['manual', 'garage61']
    : ['garage61', 'manual'];

/**
 * What to follow: your saved choice for this track and car when its laps
 * exist; otherwise the widget's default — your best when it points at your
 * best, else the imported lap (half-way with your best when `blend` is on).
 */
export function resolveFollowMode(
  saved: CoachFollowMode | null,
  referenceSource: LapTraceSource,
  blend: boolean,
  hasMine: boolean,
  hasPro: boolean
): CoachFollowMode {
  if (
    (saved === 'mine' && hasMine) ||
    (saved === 'pro' && hasPro) ||
    (saved === 'mix' && hasMine && hasPro)
  )
    return saved;
  if (hasPro && referenceSource !== 'best')
    return blend && hasMine ? 'mix' : 'pro';
  if (hasMine) return 'mine';
  return hasPro ? 'pro' : 'mine';
}
