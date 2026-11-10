import { t } from '@irdashies/frontend/i18n';
import { useState, useEffect } from 'react';
import { BaseSettingsSection } from '../components/BaseSettingsSection';
import {
  BrakingCoachWidgetSettings,
  SettingsTabType,
  getWidgetDefaultConfig,
} from '@irdashies/types';
import { useDashboard } from '@irdashies/context';
import { SettingsSection } from '../components/SettingSection';
import { SettingSliderRow } from '../components/SettingSliderRow';
import { SessionVisibility } from '../components/SessionVisibility';
import { TabButton } from '../components/TabButton';
import { SettingProps, settingPropFor } from '../components/SettingProp';
import { BrakingCoachCorners } from './BrakingCoachCorners';
import { SettingActionButton } from '../components/SettingActionButton';
import { coachSay } from '../../BrakingCoach/coachSpeech';

const SETTING_ID = 'brakingcoach';
const SettingProp = settingPropFor(SETTING_ID);

const defaultConfig = getWidgetDefaultConfig('brakingcoach');

export const BrakingCoachSettings = () => {
  const { currentDashboard } = useDashboard();

  const savedSettings = currentDashboard?.widgets.find(
    (w) => w.id === SETTING_ID
  ) as BrakingCoachWidgetSettings | undefined;

  const [settings, setSettings] = useState<BrakingCoachWidgetSettings>({
    enabled: savedSettings?.enabled ?? false,
    config: {
      ...defaultConfig,
      ...(savedSettings?.config as
        Partial<BrakingCoachWidgetSettings['config']> | undefined),
    },
  });

  const [activeTab, setActiveTab] = useState<SettingsTabType>(
    () =>
      (localStorage.getItem('brakingCoachTab') as SettingsTabType) || 'display'
  );

  useEffect(() => {
    localStorage.setItem('brakingCoachTab', activeTab);
  }, [activeTab]);

  if (!currentDashboard) return <>{t('Loading...')}</>;

  return (
    <BaseSettingsSection
      title={t('Braking Coach')}
      description={t(
        'Warns before each brake point of your reference lap, calls the brake and the throttle, and sums up each corner on the exit. The corners come from the reference lap: your best clean lap on this track and car, or a lap imported in the Lap Trace settings. Based on the Dex Overlay coach.'
      )}
      settings={settings}
      onSettingsChange={setSettings}
      widgetId={SETTING_ID}
    >
      {(handleConfigChange) => (
        <SettingProps
          widget={SETTING_ID}
          config={settings.config}
          onChange={handleConfigChange}
        >
          <div className="space-y-4">
            <div className="flex flex-wrap gap-1 border-b border-slate-700 pb-1">
              <TabButton
                id="display"
                activeTab={activeTab}
                setActiveTab={setActiveTab}
              >
                {t('Display')}
              </TabButton>
              <TabButton
                id="track"
                activeTab={activeTab}
                setActiveTab={setActiveTab}
              >
                {t('Corners')}
              </TabButton>
              <TabButton
                id="styling"
                activeTab={activeTab}
                setActiveTab={setActiveTab}
              >
                {t('Appearance')}
              </TabButton>
              <TabButton
                id="visibility"
                activeTab={activeTab}
                setActiveTab={setActiveTab}
              >
                {t('Visibility')}
              </TabButton>
            </div>

            <div>
              {activeTab === 'display' && (
                <>
                  <SettingsSection
                    title={t('Coach')}
                    scaleWidgetId={SETTING_ID}
                  >
                    <SettingProp path="referenceSource" />
                    <SettingProp path="blend" />
                    <SettingProp path="level" />
                    <SettingProp path="lookS" />
                    <SettingProp path="feedback" />
                    <SettingProp path="hideIdle" />
                  </SettingsSection>
                  <SettingsSection title={t('Sound')}>
                    <SettingProp path="beep" />
                    <SettingSliderRow
                      title={t('Volume')}
                      description={t('Volume of the coach beeps')}
                      value={Math.round(settings.config.volume * 100)}
                      units="%"
                      min={0}
                      max={100}
                      step={5}
                      onChange={(v) => handleConfigChange({ volume: v / 100 })}
                    />
                  </SettingsSection>
                  <SettingsSection title={t('Voice')}>
                    <SettingProp path="sayRef" />
                    <SettingProp path="voiceRate" />
                    <SettingSliderRow
                      title={t('Voice Volume')}
                      description={t('Volume of the spoken reference points')}
                      value={Math.round(settings.config.voiceVolume * 100)}
                      units="%"
                      min={0}
                      max={100}
                      step={5}
                      onChange={(v) =>
                        handleConfigChange({ voiceVolume: v / 100 })
                      }
                    />
                    <SettingActionButton
                      label="Test the voice"
                      title="Test"
                      description="Says a sample reference point with these settings"
                      onClick={() =>
                        coachSay(t('Brake at the 100 board'), {
                          rate: settings.config.voiceRate,
                          volume: settings.config.voiceVolume,
                        })
                      }
                    />
                  </SettingsSection>
                </>
              )}

              {activeTab === 'track' && (
                <SettingsSection title={t('Corners')}>
                  <BrakingCoachCorners
                    referenceSource={settings.config.referenceSource}
                    blend={settings.config.blend}
                  />
                </SettingsSection>
              )}

              {activeTab === 'styling' && (
                <SettingsSection title={t('Appearance')}>
                  <SettingSliderRow
                    title={t('Background Opacity')}
                    description={t(
                      'Opacity of the panel background between calls. The brake, lift and throttle calls are always solid.'
                    )}
                    value={Math.round(settings.config.background.opacity * 100)}
                    units="%"
                    min={0}
                    max={100}
                    step={5}
                    onChange={(v) =>
                      handleConfigChange({ background: { opacity: v / 100 } })
                    }
                  />
                </SettingsSection>
              )}

              {activeTab === 'visibility' && (
                <SettingsSection title={t('Session Visibility')}>
                  <SettingProp path="showOnlyWhenOnTrack" />
                  <SessionVisibility
                    sessionVisibility={settings.config.sessionVisibility}
                    handleConfigChange={handleConfigChange}
                  />
                </SettingsSection>
              )}
            </div>
          </div>
        </SettingProps>
      )}
    </BaseSettingsSection>
  );
};
