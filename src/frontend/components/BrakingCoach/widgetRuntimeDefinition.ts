import type { WidgetRuntimeDefinition } from '../../widgetRuntime';

export default {
  id: 'brakingcoach',
  sessionData: true,
  // lap-trace.sample feeds both the coach and the lap recorder that keeps its
  // reference, at the sim's native rate (the original coach reads every frame);
  // track-state drives the on-track gate.
  channels: ['lap-trace.sample', 'track-state.snapshot'],
  channelRates: { 'lap-trace.sample': 60 },
} satisfies WidgetRuntimeDefinition;
