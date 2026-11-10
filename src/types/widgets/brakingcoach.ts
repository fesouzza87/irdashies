import { defineWidgetManifest } from './types';

export default defineWidgetManifest({
  id: 'brakingcoach',
  name: 'Braking Coach',
  category: 'Lap Timing',
  enabled: false,
  layout: {
    x: 760,
    y: 120,
    width: 340,
    height: 150,
  },
  config: {
    referenceSource: 'best',
    level: 'full',
    beep: 'brake',
    volume: 0.6,
    lookS: 3.5,
    feedback: true,
    hideIdle: true,
    background: { opacity: 0.85 },
    showOnlyWhenOnTrack: true,
    // Like the original "practice only": quiet in races and qualifying.
    sessionVisibility: {
      race: false,
      loneQualify: false,
      openQualify: false,
      practice: true,
      offlineTesting: true,
    },
  },
  properties: {
    referenceSource: {
      type: 'enum',
      label: 'Reference Source',
      description:
        'Which saved lap the corners come from. Your best lap is recorded automatically from your first clean lap on each track and car. When Lap Trace is on the same screen, its choice is used.',
      options: [
        { value: 'best', label: 'My best lap' },
        { value: 'manual', label: 'Imported .ibt lap' },
        { value: 'garage61', label: 'Garage 61 (imported lap)' },
      ],
      control: 'select',
    },
    level: {
      type: 'enum',
      label: 'Help Level',
      description:
        'Take the warnings away as you learn the track. Full: everything, with beeps. Quiet: everything, no beeps. Brake points only: just the brake and throttle calls and the summary. Summary only: just how each corner went.',
      options: [
        { value: 'full', label: 'Full' },
        { value: 'quiet', label: 'Quiet (no beeps)' },
        { value: 'point', label: 'Brake points only' },
        { value: 'summary', label: 'Summary only' },
      ],
      control: 'select',
    },
    beep: {
      type: 'enum',
      label: 'Beeps',
      description:
        'Three short beeps counting down to the brake point, a long one at the brake point and, with "All", a high one when it is time to get back on the throttle. Only at the Full help level.',
      options: [
        { value: 'off', label: 'Off' },
        { value: 'brake', label: 'Brake points' },
        { value: 'all', label: 'All (brake and throttle)' },
      ],
      control: 'select',
    },
    lookS: {
      type: 'number',
      label: 'Warning Time',
      description:
        'How many seconds before the brake point the warning appears',
      min: 2,
      max: 6,
      step: 0.5,
      units: 's',
    },
    feedback: {
      type: 'boolean',
      label: 'Corner Summary',
      description:
        'On the exit of each corner, show the time gained or lost against the reference, where you braked, your minimum speed and a tip',
    },
    hideIdle: {
      type: 'boolean',
      label: 'Hide on Straights',
      description:
        'Hide the panel between corners instead of showing the next corner',
    },
    showOnlyWhenOnTrack: {
      type: 'boolean',
      label: 'Show only when on track',
      description: 'If enabled, the coach will only be shown when driving',
    },
  },
});
