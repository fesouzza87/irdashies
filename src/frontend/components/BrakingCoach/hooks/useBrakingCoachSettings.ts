import { useMemo } from 'react';
import { useDashboard } from '@irdashies/context';
import {
  getWidgetDefaultConfig,
  type BrakingCoachConfig,
} from '@irdashies/types';

const defaultConfig = getWidgetDefaultConfig('brakingcoach');

export const useBrakingCoachSettings = (): BrakingCoachConfig => {
  const { currentDashboard } = useDashboard();
  return useMemo(() => {
    const config = currentDashboard?.widgets.find(
      (w) => w.id === 'brakingcoach'
    )?.config as Partial<BrakingCoachConfig> | undefined;
    return {
      ...defaultConfig,
      ...config,
      background: { ...defaultConfig.background, ...config?.background },
      sessionVisibility: {
        ...defaultConfig.sessionVisibility,
        ...config?.sessionVisibility,
      },
    };
  }, [currentDashboard]);
};
