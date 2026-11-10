import type { Meta, StoryObj } from '@storybook/react-vite';
import type {
  CoachBridge,
  CoachMark,
  CoachNote,
  CoachTrackData,
  LapTraceBridge,
} from '@irdashies/types';
import { makeSyntheticLapTrace } from '@irdashies/frontend/domain/lapTrace/syntheticLap';
import { BrakingCoachCorners } from './BrakingCoachCorners';

/**
 * The corners table with the Electron bridges replaced by in-memory ones: a
 * synthetic 5 km lap as your best, two tips and one marked brake point.
 */

const L = 5000;
const lap = makeSyntheticLapTrace({ trackLengthM: L });

const store: { notes: CoachNote[]; marks: CoachMark[] } = {
  notes: [
    {
      p: 1100 / L,
      label: '2',
      note: 'Freie na placa de 100, 3ª marcha, e mire na zebra interna.',
      say: 'placa de cem',
    },
    { p: 3200 / L, label: '5', note: 'Só um alívio de acelerador.' },
  ],
  marks: [{ p: 400 / L, bp: 280 / L }],
};

const listeners = new Set<(key: string) => void>();

const coachBridge: CoachBridge = {
  getTrackData: async (): Promise<CoachTrackData> => ({
    follow: null,
    notes: store.notes,
    notesSource: 'Guia de exemplo',
    marks: store.marks,
    turns: null,
  }),
  saveNotes: async (key, _name, notes) => {
    store.notes = notes;
    listeners.forEach((cb) => cb(key));
  },
  saveMarks: async (key, _car, _name, marks) => {
    store.marks = marks;
    listeners.forEach((cb) => cb(key));
  },
  setFollow: async () => undefined,
  clearMarks: async (key) => {
    store.marks = [];
    listeners.forEach((cb) => cb(key));
  },
  saveTurns: async () => undefined,
  getCurrentSession: async () => ({
    trackKey: '999',
    trackId: lap.trackId,
    trackConfigName: '',
    trackName: 'Pista de exemplo',
    carPath: lap.carPath,
    carName: 'Carro de exemplo',
    carClass: '',
    lengthM: L,
  }),
  onChanged: (cb) => {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },
  onMark: () => () => undefined,
  // No Windows voice in Storybook: the browser's voice is used.
  synthesize: async () => null,
  listVoices: async () => [],
};

const lapTraceBridge = {
  getLapTrace: async (_track: number, _car: string, kind: string) =>
    kind === 'best' ? lap : null,
  onReferenceUpdated: () => () => undefined,
} as unknown as LapTraceBridge;

const meta: Meta<typeof BrakingCoachCorners> = {
  component: BrakingCoachCorners,
  title: 'settings/BrakingCoachCorners',
  decorators: [
    (Story) => {
      window.coachBridge = coachBridge;
      window.lapTraceBridge = lapTraceBridge;
      return (
        <div className="max-w-4xl bg-slate-900 p-4">
          <Story />
        </div>
      );
    },
  ],
  args: { referenceSource: 'best', blend: true },
};
export default meta;

export const Default: StoryObj<typeof BrakingCoachCorners> = {};

export const NoSession: StoryObj<typeof BrakingCoachCorners> = {
  decorators: [
    (Story) => {
      window.coachBridge = {
        ...coachBridge,
        getCurrentSession: async () => null,
      };
      return <Story />;
    },
  ],
};
