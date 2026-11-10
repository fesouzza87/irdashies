import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CoachBridge } from '@irdashies/types';
import { playCueBuffer } from '@irdashies/utils/brakeCueAudio';
import { coachSay, coachSpeaking, prepareCoachVoice } from './coachSpeech';

// jsdom has no Web Audio: a decoded phrase is just its length here.
vi.mock('@irdashies/utils/brakeCueAudio', () => ({
  decodeCueAudio: async (bytes: Uint8Array) =>
    bytes.length > 44 ? ({ duration: 0.3 } as AudioBuffer) : null,
  playCueBuffer: vi.fn(),
}));

/** A valid WAV file: `ms` of silence, 8 kHz mono 16-bit. */
const silentWav = (ms: number): Uint8Array => {
  const samples = Math.round((8000 * ms) / 1000);
  const buf = new ArrayBuffer(44 + samples * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) =>
    [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + samples * 2, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, 8000, true);
  v.setUint32(28, 16000, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, samples * 2, true);
  return new Uint8Array(buf);
};

describe('coach voice', () => {
  afterEach(() => {
    delete window.coachBridge;
  });

  it('renders a phrase ahead of time and plays it only once ready', async () => {
    const synthesize = vi.fn(async () => silentWav(300));
    window.coachBridge = { synthesize } as unknown as CoachBridge;

    // Not rendered yet: nothing is said, the rendering starts.
    expect(coachSay('a ponte', { rate: 2 })).toBe(false);
    await prepareCoachVoice('a ponte', { rate: 2 });
    expect(synthesize).toHaveBeenCalledTimes(1);
    expect(synthesize).toHaveBeenCalledWith(
      'a ponte',
      '',
      expect.any(String),
      2
    );

    expect(coachSay('a ponte', { rate: 2, volume: 0.7 })).toBe(true);
    expect(playCueBuffer).toHaveBeenCalledWith({ duration: 0.3 }, 0.7);
    // Still talking: the next call waits rather than piling up.
    expect(coachSpeaking()).toBe(true);
    expect(coachSay('a ponte', { rate: 2 })).toBe(false);
    // Rendered once, kept.
    expect(synthesize).toHaveBeenCalledTimes(1);
  });
});
