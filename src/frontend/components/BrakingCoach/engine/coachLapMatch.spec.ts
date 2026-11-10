import { describe, expect, it } from 'vitest';
import {
  carMatches,
  categoryOf,
  importedKinds,
  importedLapFit,
  resolveFollowMode,
  trackMatches,
  type CurrentCar,
} from './coachLapMatch';

const bmwM4: CurrentCar = {
  carPath: 'bmwm4gt3',
  carName: 'BMW M4 GT3',
  carClass: 'GT3 Class',
  trackName: 'Summit Point Raceway',
  lengthM: 3197,
};

describe('categoryOf', () => {
  it('groups cars like Dex Overlay', () => {
    expect(categoryOf('ferrari296gt3')).toBe('GT3');
    expect(categoryOf('', 'GT3 Class')).toBe('GT3');
    expect(categoryOf('', '', 'BMW M2 CS Racing')).toBe('BMW M2');
    expect(categoryOf('mx5 mx52016')).toBe('Mazda MX-5');
    expect(categoryOf('', '', 'Porsche 911 GT3 Cup (992)')).toBe('GT3');
    expect(categoryOf('porsche992cup')).toBe('Porsche Cup');
    expect(categoryOf('', 'Formula Vee')).toBe('Formula Vee');
  });
});

describe('matching an imported lap', () => {
  it('knows the same car by name or by path', () => {
    expect(carMatches('BMW M4 GT3', 'bmwm4gt3', 'BMW M4 GT3')).toBe(true);
    expect(carMatches('bmw-m4-gt3', 'bmwm4gt3', 'x')).toBe(true);
    expect(carMatches('Ferrari 296 GT3', 'bmwm4gt3', 'BMW M4 GT3')).toBe(false);
  });

  it('knows the track by its words in any order, accents aside', () => {
    expect(trackMatches('Raceway Summit Point', 'Summit Point Raceway')).toBe(
      true
    );
    expect(trackMatches('Interlagos', 'Autódromo José Carlos Pace')).toBe(
      false
    );
  });

  it('uses a lap of this car as it is', () => {
    expect(
      importedLapFit(
        {
          car: 'BMW M4 GT3',
          track: 'Summit Point Raceway',
          trackLengthM: 3197,
        },
        bmwM4
      )
    ).toBe('same');
  });

  it('uses another car of the same category without its gears', () => {
    expect(
      importedLapFit(
        {
          car: 'Ferrari 296 GT3',
          track: 'Summit Point Raceway',
          trackLengthM: 3197,
        },
        bmwM4
      )
    ).toBe('otherCar');
  });

  it('leaves out another category or another track', () => {
    expect(
      importedLapFit(
        {
          car: 'Mazda MX-5 Cup',
          track: 'Summit Point Raceway',
          trackLengthM: 3197,
        },
        bmwM4
      )
    ).toBe('mismatch');
    expect(
      importedLapFit(
        { car: 'BMW M4 GT3', track: 'Lime Rock Park', trackLengthM: 2410 },
        bmwM4
      )
    ).toBe('mismatch');
  });

  it('checks an unnamed lap (an .ibt) by the track length', () => {
    expect(importedLapFit({ trackLengthM: 3200 }, bmwM4)).toBe('same');
    expect(importedLapFit({ trackLengthM: 4000 }, bmwM4)).toBe('mismatch');
  });

  it('looks at the lap the widget points to first', () => {
    expect(importedKinds('manual')).toEqual(['manual', 'garage61']);
    expect(importedKinds('garage61')).toEqual(['garage61', 'manual']);
    expect(importedKinds('best')).toEqual(['garage61', 'manual']);
  });
});

describe('resolveFollowMode', () => {
  it('keeps your choice for the track and car while its laps exist', () => {
    expect(resolveFollowMode('pro', 'best', true, true, true)).toBe('pro');
    expect(resolveFollowMode('mix', 'garage61', false, true, true)).toBe('mix');
    // The imported lap is gone: back to the default.
    expect(resolveFollowMode('pro', 'garage61', true, true, false)).toBe(
      'mine'
    );
  });

  it("defaults to the widget's settings", () => {
    expect(resolveFollowMode(null, 'best', true, true, true)).toBe('mine');
    expect(resolveFollowMode(null, 'garage61', true, true, true)).toBe('mix');
    expect(resolveFollowMode(null, 'garage61', false, true, true)).toBe('pro');
    expect(resolveFollowMode(null, 'manual', true, false, true)).toBe('pro');
    expect(resolveFollowMode(null, 'best', true, false, true)).toBe('pro');
  });
});
