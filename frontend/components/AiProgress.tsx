'use client';
import { useEffect, useRef, useState } from 'react';
import { bnNum } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { Report } from '@/lib/types';
import Icon from './Icon';

/**
 * Live card while our fine-tuned model rewrites the explanations in the background:
 * a real "6 of 13" count, a moving bar, time left (measured from the actual speed), and one chip per value that ticks
 * off as it finishes. Clicking a chip jumps to that result. When everything is done it turns into a short summary.
 */
export default function AiProgress({ report, finished, onClose }: { report: Report; finished: boolean; onClose: () => void }) {
  const { t, lang } = useT();
  const num = (n: number) => (lang === 'bn' ? bnNum(String(n)) : String(n));
  const total = report.aiTotal || 0;
  const done = Math.min(report.aiDone || 0, total);
  const items = report.results.filter((r) => r.status !== 'normal' && r.aiState);
  const written = items.filter((r) => r.aiState === 'done').length;
  const kept = items.filter((r) => r.aiState === 'kept').length;

  // speed measured on this page: first moment we saw progress -> now
  const first = useRef<{ at: number; done: number } | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(id); }, []);
  if (first.current === null) first.current = { at: Date.now(), done };
  const elapsed = (now - first.current.at) / 1000;
  const progressed = done - first.current.done;
  const left = progressed > 0 ? Math.max(1, Math.round(((total - done) * elapsed) / progressed)) : null;

  const pct = total ? Math.max(4, Math.round((done / total) * 100)) : 4;
  const jump = (code: string) => {
    const el = document.getElementById(`res-${code}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el?.classList.add('ai-new'); setTimeout(() => el?.classList.remove('ai-new'), 2600);
  };

  if (finished) {
    return (
      <section role="status" className="no-print fade-in mt-4 flex items-start gap-3 rounded-xl border border-ok/25 bg-ok-tint px-4 py-3.5">
        <span className="pop-in mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ok text-white"><Icon name="check" size={18} /></span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-ink">{t('aiFinishedTitle')}</p>
          <p className="text-sm text-muted">
            {t('aiFinishedText').replace('{w}', num(written)).replace('{n}', num(items.length))}
            {kept > 0 && <> {t('aiKeptText').replace('{k}', num(kept))}</>}
          </p>
        </div>
        <button onClick={onClose} aria-label={t('close')} className="rounded-full p-1.5 text-muted hover:bg-white hover:text-ink">
          <Icon name="plus" size={18} className="rotate-45" />
        </button>
      </section>
    );
  }

  return (
    <section role="status" aria-live="polite" className="no-print fade-in relative mt-4 overflow-hidden rounded-xl border border-brand/20 bg-white shadow-sm">
      <div className="ai-topline h-1 w-full" aria-hidden="true" />
      <div className="p-4 sm:p-5">
        <div className="flex items-start gap-4">
          <span className="ai-orb relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white" aria-hidden="true">
            <Icon name="sparkle" size={22} className="spark-turn" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-ink">{t('aiProgressTitle')}<span className="loading-dots" aria-hidden="true"><span>.</span><span>.</span><span>.</span></span></p>
            <p className="mt-0.5 text-sm text-muted">{t('aiProgressSub')}</p>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-2xl font-semibold tabular-nums leading-none text-ink">{num(done)}<span className="text-base font-normal text-muted">/{num(total)}</span></div>
            <div className="mt-1 text-xs text-muted">{left ? (left <= 1 ? t('almostThere') : t('secondsLeft').replace('{n}', num(left))) : t('aiEstimating')}</div>
          </div>
        </div>

        <div className="mt-4 h-2 overflow-hidden rounded-full bg-line" aria-hidden="true">
          <div className="progress-fill h-full rounded-full bg-brand transition-[width] duration-700 ease-out" style={{ width: `${pct}%` }} />
        </div>

        <ul className="mt-4 flex flex-wrap gap-2" aria-label={t('aiProgressTitle')}>
          {items.map((r) => {
            const s = r.aiState;
            const style = s === 'done' ? 'border-ok/30 bg-ok-tint text-ink' : s === 'writing' ? 'ai-shimmer border-brand/30 text-brand-dark' :
              s === 'kept' ? 'border-line bg-wash text-muted' : 'border-line bg-white text-muted';
            return (
              <li key={r.code}>
                <button onClick={() => jump(r.code)} title={t(`aiState_${s}`)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm transition-colors hover:border-brand ${style}`}>
                  {s === 'done' && <span className="pop-in flex h-4 w-4 items-center justify-center rounded-full bg-ok text-white"><Icon name="check" size={11} /></span>}
                  {s === 'writing' && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-brand border-t-transparent" />}
                  {s === 'kept' && <Icon name="check" size={14} className="text-muted" />}
                  {s === 'waiting' && <span className="h-2 w-2 rounded-full bg-line" />}
                  {lang === 'bn' ? r.nameBn.replace(/\s*\(.*\)$/, '') : r.name}
                </button>
              </li>
            );
          })}
        </ul>

        <p className="mt-4 flex items-start gap-2 border-t border-line pt-3 text-xs text-muted">
          <Icon name="shield" size={15} className="mt-0.5 shrink-0" />{t('aiProgressNote')}
        </p>
      </div>
    </section>
  );
}
