import { useEffect, useMemo, useState } from 'react';
import { Meta, StoryObj } from '@storybook/react-vite';
import type { BrakingCoachLevel } from '@irdashies/types';
import { makeSyntheticLapTrace } from '@irdashies/frontend/domain/lapTrace/syntheticLap';
import { hydrateLapTrace } from '@irdashies/frontend/domain/lapTrace/hydrateLapTrace';
import { BrakingCoachView } from './BrakingCoachView';
import { buildCoachRef } from './engine/coachRef';
import { mergeCorners } from './engine/coachCorners';
import { CoachTracker } from './engine/coachTracker';
import type { CoachCornerInfo, CoachState } from './engine/types';

/**
 * The coach panel in each of its phases, and a whole lap driven by the coach
 * engine itself on a synthetic reference lap (the "driver" follows the
 * reference with a little noise, so the summaries come out close to it).
 */

const corner: CoachCornerInfo = {
  n: 3,
  label: '3',
  note: 'Curva cega: mire no zebra interno e não suba no externo.',
  kind: 'brake',
  vmin: 92,
  gear: 3,
  pk: 85,
  marked: false,
  dir: 'R',
  lastVmin: -3,
};

const feedback: CoachState['feedback'] = {
  n: 2,
  label: '2',
  dt: 0.14,
  brk: 9,
  vmin: -5,
  vminV: 101,
  thr: 12,
  tip: 'brake_earlier',
};

const Frame = ({
  state,
  level = 'full',
  hideIdle = false,
  width = 340,
  height = 150,
}: {
  state: CoachState;
  level?: BrakingCoachLevel;
  hideIdle?: boolean;
  width?: number;
  height?: number;
}) => (
  <div style={{ width, height }}>
    <BrakingCoachView
      state={state}
      level={level}
      hideIdle={hideIdle}
      opacity={0.85}
    />
  </div>
);

const meta: Meta<typeof Frame> = {
  component: Frame,
  title: 'widgets/BrakingCoach',
  argTypes: {
    level: {
      control: 'select',
      options: ['full', 'quiet', 'point', 'summary'],
    },
  },
};
export default meta;

type Story = StoryObj<typeof Frame>;

export const Approach: Story = {
  args: {
    state: {
      phase: 'approach',
      corner,
      d: 142,
      k: 0.62,
      beeps: [],
    },
  },
};

export const ApproachMarked: Story = {
  args: {
    state: {
      phase: 'approach',
      corner: { ...corner, marked: true, note: '', dir: 'RL' },
      d: 58,
      k: 0.86,
      feedback,
      beeps: [],
    },
  },
};

export const Brake: Story = {
  args: { state: { phase: 'brake', corner, beeps: [] } },
};

export const Lift: Story = {
  args: {
    state: {
      phase: 'lift',
      corner: { ...corner, kind: 'lift', pk: null, note: '', dir: 'L' },
      beeps: [],
    },
  },
};

export const Turn: Story = {
  args: {
    state: { phase: 'turn', corner, d: 48, k: 0.4, beeps: [] },
  },
};

export const Throttle: Story = {
  args: { state: { phase: 'go', corner, beeps: [] } },
};

export const TrackNote: Story = {
  args: {
    state: {
      phase: 'note',
      corner: {
        ...corner,
        kind: 'note',
        vmin: null,
        gear: null,
        pk: null,
        note: 'Ondulação na freada: frear em linha reta antes de virar.',
      },
      beeps: [],
    },
  },
};

export const CornerSummary: Story = {
  args: {
    state: {
      phase: 'idle',
      next: { label: '4', d: 380, dir: 'L' },
      feedback,
      beeps: [],
    },
  },
};

export const BetterThanReference: Story = {
  args: {
    state: {
      phase: 'idle',
      feedback: {
        ...feedback,
        dt: -0.08,
        brk: -2,
        vmin: 3,
        vminV: 109,
        thr: -7,
        tip: 'better',
      },
      beeps: [],
    },
  },
};

export const NextCorner: Story = {
  args: {
    state: {
      phase: 'idle',
      next: { label: '5', d: 640, dir: 'R' },
      beeps: [],
    },
  },
};

export const RecordingReference: Story = {
  args: { state: { phase: 'noref', beeps: [] } },
};

export const SmallBox: Story = {
  name: 'Small box (drops the least important parts)',
  args: {
    height: 96,
    state: {
      phase: 'approach',
      corner,
      d: 142,
      k: 0.62,
      beeps: [],
    },
  },
};

const TRACK_LENGTH_M = 5000;
const FPS = 60;

/** A whole lap through the real engine, driving the reference lap itself. */
const SimulatedLap = ({ level }: { level: BrakingCoachLevel }) => {
  const sim = useMemo(() => {
    const view = hydrateLapTrace(
      makeSyntheticLapTrace({ trackLengthM: TRACK_LENGTH_M })
    );
    const ref = buildCoachRef(view);
    if (!ref) return null;
    const corners = mergeCorners(ref, [], [], TRACK_LENGTH_M);
    const tracker = new CoachTracker({
      beep: 'off',
      lookS: 3.5,
      feedback: true,
    });
    tracker.setCorners(corners, ref, TRACK_LENGTH_M);
    return { ref, tracker };
  }, []);
  const [state, setState] = useState<CoachState>({ phase: 'noref', beeps: [] });

  useEffect(() => {
    if (!sim) return;
    const { ref, tracker } = sim;
    let pct = 0;
    let sessionTime = 0;
    const id = window.setInterval(() => {
      const i = Math.floor(pct * ref.n) % ref.n;
      // Step along the lap at the reference's own pace.
      const speed = Math.max(ref.spd[i], 20);
      const dt = 1 / FPS;
      pct = (pct + ((speed / 3.6) * dt) / ref.lengthM) % 1;
      sessionTime += dt;
      setState(
        tracker.feed(
          {
            pct,
            sessionTime,
            speedKph: speed,
            brake: ref.brk[i],
            throttle: ref.thr[i],
            gear: ref.gear[i],
            ok: true,
          },
          sessionTime * 1000
        )
      );
    }, 1000 / FPS);
    return () => window.clearInterval(id);
  }, [sim]);

  return (
    <div style={{ width: 340, height: 150 }}>
      <BrakingCoachView
        state={state}
        level={level}
        hideIdle={false}
        opacity={0.85}
      />
    </div>
  );
};

export const Simulated: StoryObj<typeof SimulatedLap> = {
  name: 'Simulated lap',
  render: (args) => <SimulatedLap {...args} />,
  args: { level: 'full' },
};
