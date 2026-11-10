import { getLanguage } from '@irdashies/frontend/i18n';
import { speechRate } from './engine/coachVoice';

/**
 * Reads out the coach's reference points with the system voices (on Windows,
 * the same voices Dex Overlay uses), in the app's language when one is
 * installed.
 */

const synth = (): SpeechSynthesis | null =>
  typeof window !== 'undefined' && 'speechSynthesis' in window
    ? window.speechSynthesis
    : null;

const pickVoice = (s: SpeechSynthesis, lang: string) => {
  const voices = s.getVoices();
  const base = lang.split('-')[0];
  return (
    voices.find((v) => v.lang === lang) ??
    voices.find((v) => v.lang.startsWith(base)) ??
    null
  );
};

/** Whether a call is still being read out (calls are never queued). */
export const coachSpeaking = (): boolean => !!synth()?.speaking;

/** Says `text`; false when there is no voice or one is still talking. */
export const coachSay = (
  text: string,
  { rate = 0, volume = 1 }: { rate?: number; volume?: number } = {}
): boolean => {
  const s = synth();
  if (!s || s.speaking || !text.trim()) return false;
  try {
    const u = new SpeechSynthesisUtterance(text);
    const lang = getLanguage();
    u.lang = lang;
    const voice = pickVoice(s, lang);
    if (voice) u.voice = voice;
    u.rate = speechRate(rate);
    u.volume = Math.max(0, Math.min(1, volume));
    s.speak(u);
    return true;
  } catch {
    return false;
  }
};
