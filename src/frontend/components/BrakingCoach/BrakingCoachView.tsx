import { t, getLanguage } from '@irdashies/frontend/i18n';
import { useLayoutEffect, useRef, type ReactNode } from 'react';
import type { BrakingCoachLevel } from '@irdashies/types';
import type {
  CoachCornerInfo,
  CoachFeedback,
  CoachPhase,
  CoachState,
  TipCode,
} from './engine/types';

/**
 * The coach panel: a port of Dex Overlay's coach.html (MIT License, Copyright
 * (c) 2026 Dex Racing). Same phases, colours, texts and order of priority when
 * the box is too small.
 */

const TIPS: Record<TipCode, string> = {
  better: 'Better than the reference 👍',
  brake_earlier:
    'Brake a little earlier and carry more speed through the middle',
  overspeed: 'Too fast in, late on the exit: brake earlier',
  braked_early: 'Braked too early: you can brake later',
  carry: 'Carry more speed through the middle (release the brake sooner)',
  throttle: 'Get back on the throttle sooner',
  ok: 'Same as the reference',
  near: 'Close to the reference',
};

const PANEL_COLORS: Partial<Record<CoachPhase, string>> = {
  brake: 'rgba(217, 43, 43, 0.92)',
  lift: 'rgba(214, 140, 20, 0.92)',
  go: 'rgba(26, 158, 86, 0.92)',
};
const PANEL_BORDERS: Partial<Record<CoachPhase, string>> = {
  brake: '#ff5252',
  lift: '#ffb43b',
  go: '#2fd47a',
};

const GAIN = 'text-emerald-400';
const LOSS = 'text-red-400';
const MUTED = 'text-slate-400';

const num = (v: number, digits = 0) =>
  new Intl.NumberFormat(getLanguage(), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(v);

const signOf = (v: number) => (v > 0 ? '+' : v < 0 ? '−' : '±');
const signed = (v: number, unit = '') => signOf(v) + num(Math.abs(v)) + unit;

const cornerName = (label: string) => t('T{label}', { label });

/** A road-sign arrow per turn, in order ('RL' is a right-left chicane). */
const ARROWS: Record<string, ReactNode> = {
  R: (
    <>
      <path d="M7 21v-8.5A5.5 5.5 0 0 1 12.5 7H19" />
      <path d="M15 3l4 4-4 4" />
    </>
  ),
  L: (
    <>
      <path d="M17 21v-8.5A5.5 5.5 0 0 0 11.5 7H5" />
      <path d="M9 3L5 7l4 4" />
    </>
  ),
};

const dirName = (dir: string) =>
  [...dir].map((x) => (x === 'R' ? t('right') : t('left'))).join(t(' then '));

export const DirIcon = ({ dir, size = 22 }: { dir: string; size?: number }) =>
  dir ? (
    <span className="inline-flex align-middle" title={dirName(dir)}>
      {[...dir].map((x, i) => (
        <svg
          key={i}
          viewBox="0 0 24 24"
          width={size}
          height={size}
          fill="none"
          stroke="currentColor"
          strokeWidth={2.7}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {ARROWS[x]}
        </svg>
      ))}
    </span>
  ) : null;

const CornerLabel = ({ c }: { c: Pick<CoachCornerInfo, 'label' | 'dir'> }) => (
  <span className="inline-flex items-center gap-1 whitespace-nowrap">
    <b className="text-[20px] text-white">{cornerName(c.label)}</b>
    <DirIcon dir={c.dir} />
  </span>
);

const Targets = ({ c, last }: { c: CoachCornerInfo; last: boolean }) => (
  <div
    data-fit="targets"
    className="flex gap-[18px] text-[11px] text-slate-400"
  >
    {c.vmin !== null && (
      <div>
        {t('Target min')}
        <b className="block text-[17px] leading-tight text-white">
          {num(c.vmin)} km/h
        </b>
      </div>
    )}
    {!!c.gear && (
      <div>
        {t('Gear')}
        <b className="block text-[17px] leading-tight text-white">
          {getLanguage() === 'pt-BR' ? `${c.gear}ª` : c.gear}
        </b>
      </div>
    )}
    {last && c.lastVmin !== undefined && (
      <div>
        {t('Last time')}
        <b
          className={`block text-[17px] leading-tight ${
            c.lastVmin < -1 ? LOSS : c.lastVmin > 1 ? GAIN : 'text-white'
          }`}
        >
          {signed(c.lastVmin, ' km/h')}
        </b>
      </div>
    )}
  </div>
);

const Bar = ({ k, kind }: { k: number; kind: 'approach' | 'throttle' }) => (
  <div className="relative h-3.5 flex-none overflow-hidden rounded-[7px] bg-white/10">
    <i
      className="absolute inset-y-0 left-0 rounded-[7px]"
      style={{
        width: `${(k * 100).toFixed(1)}%`,
        background:
          kind === 'approach'
            ? 'linear-gradient(90deg, #2fd47a, #ffd43b 75%, #ff5252)'
            : 'linear-gradient(90deg, rgba(47,212,122,.35), #2fd47a)',
      }}
    />
  </div>
);

const Distance = ({ d }: { d: number }) => (
  <div className="whitespace-nowrap text-[30px] font-extrabold leading-none">
    {num(d)}
    <small className="ml-0.5 text-[15px] font-bold text-slate-400">m</small>
  </div>
);

const Note = ({ text, lines = 2 }: { text: string; lines?: number }) => (
  <div
    data-fit="note"
    className="overflow-hidden text-[12.5px] leading-snug text-[#ffd98a]"
    style={{
      display: '-webkit-box',
      WebkitBoxOrient: 'vertical',
      WebkitLineClamp: lines,
    }}
  >
    {text}
  </div>
);

/** "brake to 80% in": the percentage stands out, in either language. */
const brakeIn = (c: CoachCornerInfo): ReactNode => {
  if (c.kind === 'lift') return t('lift in');
  if (c.kind !== 'brake' || c.pk === null) return t('brake in');
  const [before, after = ''] = t('brake to {pk} in').split('{pk}');
  return (
    <>
      {before}
      <span className="text-[15px] font-extrabold text-white">{c.pk}%</span>
      {after}
    </>
  );
};

export const FeedbackLine = ({ f }: { f: CoachFeedback }) => {
  const cls = f.dt <= -0.02 ? GAIN : f.dt >= 0.02 ? LOSS : MUTED;
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-white/10 pt-1.5 text-[12.5px] first:border-t-0 first:pt-0">
      <span className="whitespace-nowrap">
        <b className="mr-1.5 text-[20px] text-white">{cornerName(f.label)}</b>
        <span className={`text-[18px] font-extrabold ${cls}`}>
          {signOf(f.dt)}
          {num(Math.abs(f.dt), 2)} s
        </span>
      </span>
      {f.brk !== null && Math.abs(f.brk) >= 4 && (
        <span className={f.brk > 0 ? LOSS : MUTED}>
          {f.brk > 0
            ? t('braked {m} m later', { m: num(Math.abs(f.brk)) })
            : t('braked {m} m earlier', { m: num(Math.abs(f.brk)) })}
        </span>
      )}
      {f.vmin !== null && f.vminV !== null && Math.abs(f.vmin) >= 2 && (
        <span className={f.vmin < 0 ? LOSS : GAIN}>
          {t('min {speed} ({delta})', {
            speed: num(f.vminV),
            delta: signed(f.vmin),
          })}
        </span>
      )}
      {f.thr !== null && Math.abs(f.thr) >= 6 && (
        <span className={f.thr > 0 ? LOSS : GAIN}>
          {f.thr > 0
            ? t('throttle {m} m later', { m: num(Math.abs(f.thr)) })
            : t('throttle {m} m earlier', { m: num(Math.abs(f.thr)) })}
        </span>
      )}
      {f.tip !== 'ok' && f.tip !== 'near' && (
        <span data-fit="tip" className="basis-full text-[12px] text-[#ffd43b]">
          {t(TIPS[f.tip])}
        </span>
      )}
    </div>
  );
};

const Message = ({ children }: { children: ReactNode }) => (
  <div className="my-auto text-center text-[12.5px] leading-snug text-slate-400">
    {children}
  </div>
);

export interface BrakingCoachViewProps {
  state: CoachState;
  level: BrakingCoachLevel;
  hideIdle: boolean;
  /** Background opacity of the idle panel, 0..1. */
  opacity: number;
}

/**
 * When the box is too small for everything, drops the least important parts
 * first (nothing is left cut in half): the corner tip to one line, then the
 * tip, then the advice under the summary, then the targets.
 */
const useFitBox = (box: React.RefObject<HTMLDivElement | null>) => {
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const parts = (name: string) =>
      Array.from(el.querySelectorAll<HTMLElement>(`[data-fit="${name}"]`));
    for (const p of [...parts('note'), ...parts('tip'), ...parts('targets')])
      p.style.display = '';
    for (const p of parts('note')) p.style.webkitLineClamp = '';
    const over = () => el.scrollHeight > el.clientHeight + 1;
    if (!over()) return;
    const note = parts('note')[0];
    if (note) {
      note.style.webkitLineClamp = '1';
      if (!over()) return;
      note.style.display = 'none';
      if (!over()) return;
    }
    const tip = parts('tip')[0];
    if (tip) {
      tip.style.display = 'none';
      if (!over()) return;
    }
    const targets = parts('targets')[0];
    if (targets && el.querySelector('[data-bar]'))
      targets.style.display = 'none';
  });
};

export const BrakingCoachView = ({
  state,
  level,
  hideIdle,
  opacity,
}: BrakingCoachViewProps) => {
  const box = useRef<HTMLDivElement>(null);
  useFitBox(box);

  let phase = state.phase;
  let c = state.corner;
  // Help level: the warnings go away as you learn the track.
  if (level === 'point' && ['approach', 'turn', 'note'].includes(phase))
    phase = 'idle';
  if (level === 'summary' && phase !== 'noref') phase = 'idle';
  if (level !== 'full' && level !== 'quiet' && c) c = { ...c, note: '' };

  let body: ReactNode = null;
  if (phase === 'noref') {
    body = (
      <Message>
        <b className="mb-0.5 block text-[13.5px] text-white">
          {t('Coach: recording the reference')}
        </b>
        {t(
          'Complete one clean lap (or import a reference lap in the Lap Trace settings).'
        )}
      </Message>
    );
  } else if (phase === 'approach' && c) {
    body = (
      <>
        <div className="flex items-baseline justify-between gap-2.5">
          <div className="whitespace-nowrap text-[12.5px] font-bold text-slate-400">
            <CornerLabel c={c} /> {brakeIn(c)}
            {c.marked && (
              <span className="ml-1 text-[11px] text-amber-300">
                ● {t('your mark')}
              </span>
            )}
          </div>
          <Distance d={state.d ?? 0} />
        </div>
        <div data-bar>
          <Bar k={state.k ?? 0} kind="approach" />
        </div>
        <Targets c={c} last />
        {c.note && <Note text={c.note} />}
      </>
    );
  } else if ((phase === 'brake' || phase === 'lift') && c) {
    body = (
      <>
        <div className="text-center text-[46px] font-black leading-none tracking-wider text-white drop-shadow">
          {phase === 'brake' ? t('BRAKE') : t('LIFT')}
          {phase === 'brake' && c.pk !== null && (
            <span className="ml-0.5 text-[27px] font-extrabold tracking-normal">
              {' '}
              {t('to {pk}%', { pk: c.pk })}
            </span>
          )}
          {c.dir && (
            <span className="ml-2.5 align-middle">
              <DirIcon dir={c.dir} size={44} />
            </span>
          )}
        </div>
        <div className="flex justify-center text-white/80">
          <Targets c={c} last={false} />
        </div>
        {c.note && <Note text={c.note} />}
      </>
    );
  } else if (phase === 'turn' && c) {
    body = (
      <>
        <div className="flex items-baseline justify-between gap-2.5">
          <div className="whitespace-nowrap text-[12.5px] font-bold text-slate-400">
            <CornerLabel c={c} /> {t('throttle in')}
          </div>
          <Distance d={state.d ?? 0} />
        </div>
        <div data-bar>
          <Bar k={state.k ?? 0} kind="throttle" />
        </div>
        <Targets c={c} last={false} />
      </>
    );
  } else if (phase === 'go' && c) {
    body = (
      <div className="text-center text-[46px] font-black leading-none tracking-wider text-white drop-shadow">
        {t('THROTTLE')}
      </div>
    );
  } else if (phase === 'note' && c) {
    body = (
      <>
        <CornerLabel c={c} />
        <Note text={c.note} lines={4} />
      </>
    );
  }

  // Short of room: the corner's own tip comes before the last summary.
  const coloured = phase === 'brake' || phase === 'lift' || phase === 'go';
  const fb =
    !coloured && !(phase === 'approach' && c?.note) && state.feedback ? (
      <FeedbackLine f={state.feedback} />
    ) : null;

  if (!body && !fb) {
    if (hideIdle) return null;
    const nx = state.next;
    body = (
      <Message>
        {nx ? (
          <>
            {t('Next')}: <b className="text-white">{cornerName(nx.label)}</b>
            <DirIcon dir={nx.dir} size={16} /> · {num(nx.d)} m
          </>
        ) : (
          t('Coach ready')
        )}
      </Message>
    );
  }

  const centred =
    coloured || phase === 'note' || (!body && !!fb) || phase === 'idle';
  return (
    <div
      className="flex h-full flex-col overflow-hidden rounded-md border text-white transition-colors duration-100"
      style={{
        backgroundColor: PANEL_COLORS[phase] ?? `rgba(15, 23, 42, ${opacity})`,
        borderColor: PANEL_BORDERS[phase] ?? 'rgba(255, 255, 255, 0.08)',
      }}
    >
      <div
        ref={box}
        data-phase={phase}
        className={`flex min-h-0 flex-1 flex-col gap-[7px] px-3.5 pb-2 pt-2.5 ${
          centred ? 'justify-center' : ''
        }`}
      >
        {body}
        {fb}
      </div>
    </div>
  );
};
