import type { BrakingCoachConfig } from '@irdashies/types';
import { useDrivingState, useSessionVisibility } from '@irdashies/context';
import { BrakingCoachView } from './BrakingCoachView';
import { useBrakingCoach } from './hooks/useBrakingCoach';
import { useBrakingCoachSettings } from './hooks/useBrakingCoachSettings';

export type BrakingCoachProps = Partial<BrakingCoachConfig>;

/**
 * Braking coach: warns before each brake point of the reference lap (the same
 * lap Lap Trace keeps: your best clean lap, or an imported one), calls the
 * brake and the throttle, and sums up each corner on the exit.
 */
export const BrakingCoach = (props: BrakingCoachProps) => {
  const settings = useBrakingCoachSettings();
  const config = { ...settings, ...props };
  const { isDriving } = useDrivingState();
  const isSessionVisible = useSessionVisibility(config.sessionVisibility);
  const shown = isSessionVisible && (!config.showOnlyWhenOnTrack || isDriving);

  const state = useBrakingCoach({
    level: config.level,
    beep: config.beep,
    volume: config.volume,
    lookS: config.lookS,
    feedback: config.feedback,
    referenceSource: config.referenceSource,
    blend: config.blend,
    sayRef: config.sayRef,
    voiceRate: config.voiceRate,
    voiceVolume: config.voiceVolume,
    voiceName: config.voiceName,
    outputDeviceId: config.outputDeviceId,
    active: shown,
  });

  if (!shown) return null;
  return (
    <BrakingCoachView
      state={state}
      level={config.level}
      hideIdle={config.hideIdle}
      opacity={config.background.opacity}
    />
  );
};
