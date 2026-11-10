import { describe, expect, it } from 'vitest';
import { coachTrackKey } from '@irdashies/types';
import { cleanMarks, cleanNotes, cleanTurns } from './coachDataSanitize';
import summitPoint from './defaultNotes/9.json';

describe('coach track key', () => {
  it('matches Dex Overlay\'s file names (Summit Point is "9")', () => {
    expect(coachTrackKey(9, '')).toBe('9');
    expect(coachTrackKey(9, null)).toBe('9');
    expect(coachTrackKey(132, 'Grand Prix')).toBe('132_Grand_Prix');
  });

  it('ships the Summit Point tips in the shape the coach reads', () => {
    const notes = cleanNotes(summitPoint.corners);
    expect(notes.length).toBeGreaterThanOrEqual(8);
    expect(notes[0]).toMatchObject({ p: 0.17735, label: '1' });
  });
});

describe('saving coach data', () => {
  it('keeps only tips with something in them, within the limits', () => {
    const notes = cleanNotes([
      { p: 0.1, label: '1', note: 'x'.repeat(700) },
      { p: 0.2, label: '', note: '' },
      { p: 0.3, label: '', note: '', say: '  a   ponte ', hide: true },
      { p: 'nope' },
      'junk',
    ]);
    expect(notes).toHaveLength(2);
    expect(notes[0].note).toHaveLength(600);
    expect(notes[1]).toEqual({
      p: 0.3,
      label: '',
      note: '',
      say: 'a ponte',
      hide: true,
    });
  });

  it('keeps only marks that adjust something', () => {
    expect(
      cleanMarks([
        { p: 0.1, bp: 0.09 },
        { p: 0.2 },
        { p: 0.3, vmin: '95.4', gear: 3.7 },
        { p: 1.2, bp: -0.01 },
      ])
    ).toEqual([
      { p: 0.1, bp: 0.09 },
      { p: 0.3, vmin: 95, gear: 3 },
      { p: 0.2, bp: 0.99 },
    ]);
  });

  it('refuses a steering trace that does not match its length', () => {
    expect(cleanTurns({ n: 400, steer: [0, 1] })).toBeNull();
    const ok = cleanTurns({
      n: 400,
      length_m: 1200,
      steer: new Array(400).fill(0.1234),
    });
    expect(ok).toMatchObject({ n: 400, lengthM: 1200 });
    expect(ok?.steer[0]).toBe(0.123);
  });
});
