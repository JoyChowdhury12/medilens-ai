'use client';
import { useEffect, useState } from 'react';
import { bnNum } from '@/lib/format';
import { useT } from '@/lib/i18n';
import Icon from './Icon';

type Kind = 'upload' | 'confirm';

const DEFAULT_SECONDS: Record<Kind, number> = { upload: 20, confirm: 10 };
const STAGES: Record<Kind, string[]> = {
  upload: ['loadUp1', 'loadUp2', 'loadUp3', 'loadUp4'],
  confirm: ['loadCf1', 'loadCf2', 'loadCf3'],
};
// When each stage starts, as a share of the expected time (the server sends no real progress).
const STAGE_AT: Record<Kind, number[]> = { upload: [0, 0.08, 0.25, 0.8], confirm: [0, 0.15, 0.35] };
const TIPS: Record<Kind, string[]> = { upload: ['tipUp1', 'tipUp2', 'tipUp3'], confirm: ['tipCf1', 'tipCf2', 'tipCf3'] };

/** The usual time for this step on this computer: learnt from the last runs (kept only in this browser). */
function expectedSeconds(kind: Kind, hint?: number) {
  try {
    const saved = Number(localStorage.getItem(`ml_time_${kind}`));
    if (saved > 1 && saved < 300) return saved;
  } catch { /* storage blocked: use the default */ }
  return hint ?? DEFAULT_SECONDS[kind];
}

/** Call when the step finished successfully, so the next estimate is closer to this computer's real speed. */
export function recordDuration(kind: Kind, seconds: number) {
  try {
    const old = Number(localStorage.getItem(`ml_time_${kind}`)) || seconds;
    localStorage.setItem(`ml_time_${kind}`, String(Math.round((old * 0.5 + seconds * 0.5) * 10) / 10));
  } catch { /* ignore */ }
}

/**
 * Live progress while the server works: an animated report, a countdown ring with "about N seconds left",
 * a moving bar, the list of steps and a changing tip. The bar eases towards 95% and finishes when the page changes.
 */
export default function LoadingPanel({ kind, hint }: { kind: Kind; hint?: number }) {
  const { t, lang } = useT();
  const [expected] = useState(() => expectedSeconds(kind, hint));
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const start = Date.now();
    const id = setInterval(() => setElapsed((Date.now() - start) / 1000), 200);
    return () => clearInterval(id);
  }, []);

  const pct = Math.min(95, 95 * (1 - Math.exp(-elapsed / (expected * 0.55))));
  const left = Math.max(0, Math.ceil(expected - elapsed));
  const late = elapsed > expected;
  const stages = STAGES[kind];
  const stage = STAGE_AT[kind].reduce((s, at, i) => (elapsed >= at * expected ? i : s), 0);
  const tips = TIPS[kind];
  const tip = tips[Math.floor(elapsed / 6) % tips.length];
  const num = (n: number) => (lang === 'bn' ? bnNum(String(n)) : String(n));

  // countdown ring
  const R = 26, C = 2 * Math.PI * R;
  const ringLeft = late ? 0 : Math.max(0, 1 - elapsed / expected);

  return (
    <div role="status" aria-live="polite" className="mx-auto mt-4 w-full max-w-lg text-left">
      <div className="flex items-center gap-4">
        <ScanArt kind={kind} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-ink">{t(late ? 'takingLonger' : kind === 'upload' ? 'loadUpTitle' : 'loadCfTitle')}</p>
          <p className="mt-0.5 text-sm text-muted">{t('keepOpen')}</p>
        </div>
        <div className="relative h-16 w-16 shrink-0" aria-hidden="true">
          <svg viewBox="0 0 64 64" className="h-16 w-16 -rotate-90">
            <circle cx="32" cy="32" r={R} fill="none" strokeWidth="5" className="stroke-line" />
            <circle cx="32" cy="32" r={R} fill="none" strokeWidth="5" strokeLinecap="round"
              className={`transition-[stroke-dashoffset] duration-200 ease-linear ${late ? 'stroke-warn' : 'stroke-brand'}`}
              strokeDasharray={C} strokeDashoffset={C * (1 - ringLeft)} />
          </svg>
          <span className="absolute inset-0 flex flex-col items-center justify-center leading-none">
            {late ? <span className="h-3 w-3 animate-ping rounded-full bg-warn" /> : (
              <><span className="text-lg font-semibold tabular-nums text-ink">{num(left)}</span>
                <span className="text-[10px] text-muted">{t('sec')}</span></>
            )}
          </span>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between text-sm">
        <span className="font-medium text-ink">{late ? t('almostThere') : t('secondsLeft').replace('{n}', num(left))}</span>
        <span className="tabular-nums text-muted">{t('elapsed').replace('{n}', num(Math.floor(elapsed)))}</span>
      </div>
      <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-line" aria-hidden="true">
        <div className="progress-fill h-full rounded-full bg-brand transition-[width] duration-300 ease-out" style={{ width: `${pct}%` }} />
      </div>

      <ul className="mt-4 space-y-2 text-sm">
        {stages.map((key, i) => {
          const state = i < stage ? 'done' : i === stage ? 'now' : 'next';
          return (
            <li key={key} className={`flex items-center gap-2.5 transition-colors ${state === 'next' ? 'text-muted/70' : 'text-ink'}`}>
              <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                {state === 'done' && <span className="pop-in flex h-5 w-5 items-center justify-center rounded-full bg-ok text-white"><Icon name="check" size={13} /></span>}
                {state === 'now' && <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand border-t-transparent" />}
                {state === 'next' && <span className="h-2 w-2 rounded-full bg-line" />}
              </span>
              <span className={state === 'now' ? 'font-medium' : ''}>{t(key)}{state === 'now' && <Dots />}</span>
            </li>
          );
        })}
      </ul>

      <p key={tip} className="fade-in mt-4 rounded-md bg-wash px-3 py-2 text-sm text-muted">
        <span className="font-medium text-ink">{t('tip')}: </span>{t(tip)}
      </p>
    </div>
  );
}

function Dots() {
  return <span className="loading-dots" aria-hidden="true"><span>.</span><span>.</span><span>.</span></span>;
}

/** A small report: a scan line moves over it while reading; lines get "written" while explaining. */
function ScanArt({ kind }: { kind: Kind }) {
  return (
    <div className="relative h-16 w-12 shrink-0 overflow-hidden rounded-md border-2 border-brand/40 bg-white shadow-sm" aria-hidden="true">
      <div className="absolute inset-x-1.5 top-2 space-y-1.5">
        {[90, 70, 85, 60, 75].map((w, i) => (
          <div key={i} className={`h-1 rounded-full bg-brand/30 ${kind === 'confirm' ? 'write-line' : ''}`}
            style={{ width: `${w}%`, animationDelay: `${i * 0.35}s` }} />
        ))}
      </div>
      {kind === 'upload' && <div className="scan-line absolute inset-x-0 h-3" />}
    </div>
  );
}
