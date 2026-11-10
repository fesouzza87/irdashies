import { getLanguage } from '@irdashies/frontend/i18n';
import { decodeCueAudio, playCueBuffer } from '@irdashies/utils/brakeCueAudio';
import { speechRate } from './engine/coachVoice';

/**
 * Reads out the coach's reference points with the Windows voices (SAPI, the
 * same ones Dex Overlay uses). Each phrase is rendered to audio by the main
 * process ahead of time and kept here, so a call plays the instant it is due,
 * on the same output device as the beeps. Without the app bridge (Storybook,
 * not Windows) the browser's own speech is used instead.
 */

export interface CoachVoiceOptions {
  /** Windows voice name; '' picks one in the app language. */
  voice?: string;
  /** -10..10 */
  rate?: number;
  /** 0..1 */
  volume?: number;
}

const MAX_CACHED = 200;
/** Rendered phrases: undefined while rendering, null when it failed. */
const ready = new Map<string, AudioBuffer | null>();
const rendering = new Map<string, Promise<AudioBuffer | null>>();
let speakingUntil = 0;

const keyOf = (text: string, voice: string, rate: number, lang: string) =>
  [voice, rate, lang, text].join('\u0000');

const synth = (): SpeechSynthesis | null =>
  typeof window !== 'undefined' && 'speechSynthesis' in window
    ? window.speechSynthesis
    : null;

/** Renders a phrase now so it can be played the moment it is due. */
export const prepareCoachVoice = (
  text: string,
  { voice = '', rate = 0 }: CoachVoiceOptions = {}
): Promise<AudioBuffer | null> => {
  const bridge = window.coachBridge;
  const clean = text.trim();
  if (!bridge || !clean) return Promise.resolve(null);
  const lang = getLanguage();
  const key = keyOf(clean, voice, Math.round(rate), lang);
  if (ready.has(key)) return Promise.resolve(ready.get(key) ?? null);
  const inFlight = rendering.get(key);
  if (inFlight) return inFlight;
  const job = bridge
    .synthesize(clean, voice, lang, Math.round(rate))
    .then((wav) => (wav ? decodeCueAudio(wav) : null))
    .catch(() => null)
    .then((buffer) => {
      rendering.delete(key);
      if (ready.size >= MAX_CACHED) ready.clear();
      ready.set(key, buffer);
      return buffer;
    });
  rendering.set(key, job);
  return job;
};

/** Whether a call is still being read out (calls are never queued). */
export const coachSpeaking = (): boolean =>
  performance.now() < speakingUntil || !!synth()?.speaking;

const sayWithBrowser = (text: string, rate: number, volume: number) => {
  const s = synth();
  if (!s || s.speaking) return false;
  try {
    const u = new SpeechSynthesisUtterance(text);
    const lang = getLanguage();
    u.lang = lang;
    const base = lang.split('-')[0];
    const voices = s.getVoices();
    const voice =
      voices.find((v) => v.lang === lang) ??
      voices.find((v) => v.lang.startsWith(base));
    if (voice) u.voice = voice;
    u.rate = speechRate(rate);
    u.volume = Math.max(0, Math.min(1, volume));
    s.speak(u);
    return true;
  } catch {
    return false;
  }
};

/**
 * Says `text` if it is ready; false when it is still being rendered (it will
 * be ready on a later frame) or a call is still being read out.
 */
export const coachSay = (
  text: string,
  { voice = '', rate = 0, volume = 1 }: CoachVoiceOptions = {}
): boolean => {
  const clean = text.trim();
  if (!clean || coachSpeaking()) return false;
  if (!window.coachBridge) return sayWithBrowser(clean, rate, volume);
  const key = keyOf(clean, voice, Math.round(rate), getLanguage());
  if (!ready.has(key)) {
    void prepareCoachVoice(clean, { voice, rate });
    return false;
  }
  const buffer = ready.get(key);
  // No Windows voice for it: the browser's voice still beats silence.
  if (!buffer) return sayWithBrowser(clean, rate, volume);
  playCueBuffer(buffer, volume);
  speakingUntil = performance.now() + buffer.duration * 1000;
  return true;
};

/** For the "test the voice" button: renders first if needed, then says it. */
export const coachSayNow = async (
  text: string,
  options: CoachVoiceOptions = {}
): Promise<boolean> => {
  await prepareCoachVoice(text, options);
  speakingUntil = 0;
  return coachSay(text, options);
};
