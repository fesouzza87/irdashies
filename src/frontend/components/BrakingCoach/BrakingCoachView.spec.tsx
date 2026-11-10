import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getLanguage, setLanguage } from '@irdashies/frontend/i18n';
import { render, screen } from '@testing-library/react';
import { BrakingCoachView } from './BrakingCoachView';
import type { CoachCornerInfo, CoachState } from './engine/types';

const corner: CoachCornerInfo = {
  n: 3,
  label: '3',
  note: 'Blind apex',
  kind: 'brake',
  vmin: 92,
  gear: 3,
  pk: 85,
  marked: false,
  dir: 'R',
  lastVmin: -3,
};

const view = (
  state: CoachState,
  level: 'full' | 'quiet' | 'point' | 'summary' = 'full',
  hideIdle = false
) =>
  render(
    <BrakingCoachView
      state={state}
      level={level}
      hideIdle={hideIdle}
      opacity={0.8}
    />
  );

const phaseShown = (container: HTMLElement) =>
  container.querySelector('[data-phase]')?.getAttribute('data-phase');

describe('BrakingCoachView', () => {
  // Numbers follow the app language; the texts are checked in English.
  const initial = getLanguage();
  beforeAll(() => setLanguage('en', false));
  afterAll(() => setLanguage(initial, false));

  it('shows the distance, brake pressure and targets on the approach', () => {
    view({ phase: 'approach', corner, d: 142, k: 0.5, beeps: [] });
    expect(screen.getByText('T3')).toBeTruthy();
    expect(screen.getByText('85%')).toBeTruthy();
    expect(screen.getByText('142')).toBeTruthy();
    expect(screen.getByText('92 km/h')).toBeTruthy();
    expect(screen.getByText('Blind apex')).toBeTruthy();
    expect(screen.getByText('−3 km/h')).toBeTruthy();
  });

  it('calls the brake on a solid red panel', () => {
    const { container } = view({ phase: 'brake', corner, beeps: [] });
    expect(screen.getByText(/BRAKE/)).toBeTruthy();
    expect(screen.getByText('to 85%')).toBeTruthy();
    const panel = container.firstElementChild as HTMLElement;
    expect(panel.style.backgroundColor).toBe('rgba(217, 43, 43, 0.92)');
  });

  it('calls the throttle', () => {
    view({ phase: 'go', corner, beeps: [] });
    expect(screen.getByText('THROTTLE')).toBeTruthy();
  });

  it('sums up the corner with a tip', () => {
    view({
      phase: 'idle',
      beeps: [],
      feedback: {
        n: 2,
        label: '2',
        dt: 0.14,
        brk: 9,
        vmin: -5,
        vminV: 101,
        thr: 12,
        tip: 'brake_earlier',
      },
    });
    expect(screen.getByText('+0.14 s')).toBeTruthy();
    expect(screen.getByText('braked 9 m later')).toBeTruthy();
    expect(screen.getByText('min 101 (−5)')).toBeTruthy();
    expect(screen.getByText('throttle 12 m later')).toBeTruthy();
    expect(
      screen.getByText(
        'Brake a little earlier and carry more speed through the middle'
      )
    ).toBeTruthy();
  });

  it('leaves out the summary while a corner tip is on the approach', () => {
    view({
      phase: 'approach',
      corner,
      d: 100,
      k: 0.5,
      beeps: [],
      feedback: {
        n: 2,
        label: '2',
        dt: 0.1,
        brk: null,
        vmin: null,
        vminV: null,
        thr: null,
        tip: 'near',
      },
    });
    expect(screen.queryByText('+0.10 s')).toBeNull();
  });

  it('hides on the straights when asked, otherwise shows the next corner', () => {
    const idle: CoachState = {
      phase: 'idle',
      beeps: [],
      next: { label: '4', d: 380, dir: '' },
    };
    const hidden = view(idle, 'full', true);
    expect(hidden.container.innerHTML).toBe('');
    hidden.unmount();
    view(idle);
    expect(screen.getByText('T4')).toBeTruthy();
  });

  it('drops the countdown at the "brake points only" level', () => {
    const { container } = view(
      { phase: 'approach', corner, d: 100, k: 0.5, beeps: [] },
      'point'
    );
    expect(phaseShown(container)).toBe('idle');
    expect(screen.queryByText('100')).toBeNull();
  });

  it('keeps the brake call at "brake points only" without the tip', () => {
    view({ phase: 'brake', corner, beeps: [] }, 'point');
    expect(screen.getByText(/BRAKE/)).toBeTruthy();
    expect(screen.queryByText('Blind apex')).toBeNull();
  });

  it('shows only the summary at the "summary only" level', () => {
    const { container } = view(
      { phase: 'brake', corner, beeps: [] },
      'summary'
    );
    expect(phaseShown(container)).toBe('idle');
    expect(screen.queryByText(/BRAKE/)).toBeNull();
  });

  it('asks for a clean lap with no reference', () => {
    view({ phase: 'noref', beeps: [] }, 'summary');
    expect(screen.getByText('Coach: recording the reference')).toBeTruthy();
  });
});
