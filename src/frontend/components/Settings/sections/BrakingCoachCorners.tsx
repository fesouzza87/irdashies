import { t } from '@irdashies/frontend/i18n';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  CoachFollowMode,
  CoachSessionInfo,
  LapTraceSource,
} from '@irdashies/types';
import logger from '@irdashies/utils/logger';
import { DirIcon } from '../../BrakingCoach/BrakingCoachView';
import {
  coachTableRows,
  coachTableToSave,
  type CoachTableRow,
} from '../../BrakingCoach/engine/coachTable';
import {
  useCoachModel,
  useLapRevision,
  type CoachContext,
} from '../../BrakingCoach/hooks/useCoachSetup';
import { SettingSelectRow } from '../components/SettingSelectRow';
import { ConfirmDialog } from '../components/ConfirmDialog';

const INPUT =
  'w-full rounded border border-settings-boundary bg-slate-900 px-1.5 py-1 text-sm text-slate-200 focus:border-accent-400 focus:outline-none';
const BUTTON =
  'min-h-9 px-3 py-1.5 text-sm font-semibold border border-settings-boundary bg-slate-800 hover:border-accent-400 text-slate-200 rounded-md transition-colors disabled:opacity-40';

const numOrNull = (v: string): number | null => {
  if (v.trim() === '') return null;
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n) : null;
};

/**
 * The corners of the track being driven: tips and the spoken reference point
 * for the track, and your own adjustments (brake point, minimum, gear) for
 * this car. The same corners the coach follows, built the same way.
 */
export const BrakingCoachCorners = ({
  referenceSource,
  blend,
}: {
  referenceSource: LapTraceSource;
  blend: boolean;
}) => {
  const [session, setSession] = useState<CoachSessionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(() => {
    const bridge = window.coachBridge;
    if (!bridge) {
      setLoading(false);
      return;
    }
    setLoading(true);
    bridge
      .getCurrentSession()
      .then(setSession)
      .catch(() => setSession(null))
      .finally(() => setLoading(false));
  }, []);
  useEffect(refresh, [refresh]);

  const ctx = useMemo<CoachContext | null>(
    () =>
      session
        ? {
            trackKey: session.trackKey,
            trackId: session.trackId,
            carPath: session.carPath,
            carName: session.carName,
            carClass: session.carClass,
            trackName: session.trackName,
            lengthM: session.lengthM,
          }
        : null,
    [session]
  );
  const lapRevision = useLapRevision();
  const model = useCoachModel(
    ctx,
    referenceSource,
    blend,
    undefined,
    lapRevision
  );
  const { data, mine, pro, proFit, proLabel, mode } = model;
  const lengthM = model.lengthM ?? mine?.lengthM ?? pro?.lengthM ?? null;

  const baseRows = useMemo(
    () => coachTableRows(model.corners, data.notes, lengthM ?? 4000),
    [model.corners, data.notes, lengthM]
  );

  const setFollow = (value: CoachFollowMode | 'auto') => {
    if (!session) return;
    window.coachBridge
      ?.setFollow(
        session.trackKey,
        session.carPath,
        value === 'auto' ? null : value
      )
      .catch((e) => logger.warn('[Coach] Failed to save the follow mode', e));
  };

  const [rows, setRows] = useState<CoachTableRow[]>(baseRows);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  useEffect(() => {
    setRows(baseRows);
    setDirty(false);
  }, [baseRows]);

  const edit = (i: number, change: Partial<CoachTableRow>) => {
    setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...change } : r)));
    setDirty(true);
  };

  const save = async () => {
    const bridge = window.coachBridge;
    if (!bridge || !session) return;
    const { notes, marks } = coachTableToSave(rows);
    setSaving(true);
    try {
      await bridge.saveNotes(session.trackKey, session.trackName, notes);
      await bridge.saveMarks(
        session.trackKey,
        session.carPath,
        session.trackName,
        marks
      );
      setDirty(false);
    } catch (e) {
      logger.warn('[Coach] Failed to save the corners table', e);
    } finally {
      setSaving(false);
    }
  };

  const clearMarks = async () => {
    setConfirmClear(false);
    if (!session) return;
    await window.coachBridge
      ?.clearMarks(session.trackKey, session.carPath)
      .catch((e) => logger.warn('[Coach] Failed to clear marks', e));
  };

  if (loading)
    return <p className="text-sm text-slate-400">{t('Loading...')}</p>;
  if (!session) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-slate-400">
          {t(
            'Join a session (a Test Drive will do) to see and edit the corners of that track and car.'
          )}
        </p>
        <button type="button" className={BUTTON} onClick={refresh}>
          {t('Refresh')}
        </button>
      </div>
    );
  }

  const L = lengthM ?? 4000;
  const anyMark = data.marks.length > 0;

  return (
    <div className="space-y-3">
      <div className="text-sm text-slate-300">
        <b>{session.trackName}</b> · {session.carName}
        {data.notesSource && (
          <p className="mt-1 text-xs text-slate-500">
            {t('Tips: {source}', { source: data.notesSource })}
          </p>
        )}
        {!mine && !pro && (
          <p className="mt-1 text-xs text-amber-300">
            {t(
              'No reference lap yet: the corners come from the tips only. Drive a clean lap for the brake points.'
            )}
          </p>
        )}
      </div>
      <SettingSelectRow<CoachFollowMode | 'auto'>
        title={t('Follow on this track and car')}
        description={t(
          'Your best lap, the imported lap (.ibt or Garage 61), or half-way between the two. Automatic follows the widget settings.'
        )}
        value={data.follow ?? 'auto'}
        options={[
          { value: 'auto', label: t('Automatic') },
          { value: 'mine', label: t('My best lap'), disabled: !mine },
          { value: 'pro', label: t('Imported lap'), disabled: !pro },
          {
            value: 'mix',
            label: t('Half-way'),
            disabled: !mine || !pro,
          },
        ]}
        onChange={setFollow}
      />
      <p className="text-xs text-slate-400">
        {t('Following now: {mode}', {
          mode:
            mode === 'mine'
              ? t('My best lap')
              : mode === 'pro'
                ? t('Imported lap')
                : t('Half-way'),
        })}
        {proLabel && (
          <>
            {' · '}
            {proFit === 'mismatch'
              ? t(
                  'The imported lap ({label}) is from another track or car category: the coach does not use it here.',
                  { label: proLabel }
                )
              : proFit === 'otherCar'
                ? t(
                    'Imported lap: {label}, driven in another car of the same category (its gears and brake pressures are left out).',
                    { label: proLabel }
                  )
                : t('Imported lap: {label}', { label: proLabel })}
          </>
        )}
      </p>
      <p className="text-xs text-slate-500">
        {t(
          'Tips, labels and the spoken reference point are kept for the track; minimum, gear and your marked brake points for this car. Press the "Braking Coach: Mark Brake Point" key (Ctrl+Shift+B by default) where you brake to mark it.'
        )}
      </p>

      {rows.length === 0 ? (
        <p className="text-sm text-slate-400">{t('No corners found yet.')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-xs uppercase text-slate-500">
              <tr>
                <th className="p-1">{t('Corner')}</th>
                <th className="p-1">{t('Brake point')}</th>
                <th className="w-16 p-1">{t('Min (km/h)')}</th>
                <th className="w-12 p-1">{t('Gear')}</th>
                <th className="p-1">{t('Tip')}</th>
                <th className="p-1">{t('Spoken reference')}</th>
                <th className="p-1">{t('Hide')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr
                  key={`${r.n}-${r.p}`}
                  className={`border-t border-slate-800 align-top ${
                    r.hide ? 'opacity-50' : ''
                  }`}
                >
                  <td className="w-24 p-1">
                    <div className="flex items-center gap-1">
                      <input
                        className={INPUT}
                        value={r.label}
                        placeholder={r.autoLabel}
                        maxLength={12}
                        aria-label={t('Corner')}
                        onChange={(e) => edit(i, { label: e.target.value })}
                      />
                      <span className="text-slate-300">
                        <DirIcon dir={r.dir} size={16} />
                      </span>
                    </div>
                  </td>
                  <td className="whitespace-nowrap p-1 text-slate-300">
                    {r.hasRef ? (
                      <>
                        {Math.round(r.bp * L)} m
                        {r.kind === 'lift' && (
                          <span className="ml-1 text-xs text-slate-500">
                            {t('(lift)')}
                          </span>
                        )}
                        {r.bpMark !== null && (
                          <button
                            type="button"
                            className="ml-1 text-xs text-amber-300 hover:underline"
                            title={t('Back to the reference brake point')}
                            onClick={() => edit(i, { bpMark: null })}
                          >
                            ● {t('your mark')} ×
                          </button>
                        )}
                      </>
                    ) : (
                      <span className="text-xs text-slate-500">
                        {t('tip only')}
                      </span>
                    )}
                  </td>
                  <td className="p-1">
                    <input
                      className={INPUT}
                      inputMode="numeric"
                      value={r.vmin ?? ''}
                      placeholder={r.vminRef?.toString() ?? ''}
                      disabled={!r.hasRef}
                      aria-label={t('Min (km/h)')}
                      onChange={(e) =>
                        edit(i, {
                          vmin: numOrNull(e.target.value) ?? r.vminRef,
                        })
                      }
                    />
                  </td>
                  <td className="p-1">
                    <input
                      className={INPUT}
                      inputMode="numeric"
                      value={r.gear ?? ''}
                      placeholder={r.gearRef?.toString() ?? ''}
                      disabled={!r.hasRef}
                      aria-label={t('Gear')}
                      onChange={(e) =>
                        edit(i, {
                          gear: numOrNull(e.target.value) ?? r.gearRef,
                        })
                      }
                    />
                  </td>
                  <td className="p-1">
                    <textarea
                      className={`${INPUT} min-h-[2.2rem]`}
                      rows={1}
                      value={r.note}
                      maxLength={600}
                      aria-label={t('Tip')}
                      onChange={(e) => edit(i, { note: e.target.value })}
                    />
                  </td>
                  <td className="p-1">
                    <input
                      className={INPUT}
                      value={r.say}
                      maxLength={120}
                      placeholder={t('e.g. "the bridge"')}
                      aria-label={t('Spoken reference')}
                      onChange={(e) => edit(i, { say: e.target.value })}
                    />
                  </td>
                  <td className="p-1 text-center">
                    <input
                      type="checkbox"
                      checked={r.hide}
                      aria-label={t('Hide')}
                      onChange={(e) => edit(i, { hide: e.target.checked })}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={BUTTON}
          disabled={!dirty || saving}
          onClick={() => void save()}
        >
          {saving ? t('Saving...') : t('Save')}
        </button>
        <button
          type="button"
          className={BUTTON}
          disabled={!dirty}
          onClick={() => {
            setRows(baseRows);
            setDirty(false);
          }}
        >
          {t('Discard changes')}
        </button>
        <button
          type="button"
          className={BUTTON}
          disabled={!anyMark}
          onClick={() => setConfirmClear(true)}
        >
          {t('Clear my marks')}
        </button>
        <button type="button" className={BUTTON} onClick={refresh}>
          {t('Refresh')}
        </button>
      </div>

      <ConfirmDialog
        isOpen={confirmClear}
        title={t('Clear my marks')}
        message={t(
          'Remove your brake points, minimums and gears for this car on this track? The tips stay.'
        )}
        confirmText={t('Clear')}
        variant="warning"
        onConfirm={() => void clearMarks()}
        onCancel={() => setConfirmClear(false)}
      />
    </div>
  );
};
