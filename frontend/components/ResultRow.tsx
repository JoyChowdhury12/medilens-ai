'use client';
import { useEffect, useRef, useState } from 'react';
import { useT } from '@/lib/i18n';
import { rangeLabel, reasonBn } from '@/lib/format';
import { Result, Status } from '@/lib/types';
import Icon from './Icon';
import RangeBar from './RangeBar';

const STYLE: Record<Status, { text: string; bg: string; mark: string }> = {
  normal: { text: 'text-ok', bg: 'bg-ok-tint', mark: '●' },
  borderline: { text: 'text-warn', bg: 'bg-warn-tint', mark: '●' },
  low: { text: 'text-bad', bg: 'bg-bad-tint', mark: '▼' },
  high: { text: 'text-bad', bg: 'bg-bad-tint', mark: '▲' },
  critical: { text: 'text-crit', bg: 'bg-crit-tint', mark: '!' },
};

export function StatusBadge({ status, direction }: { status: Status; direction?: string | null }) {
  const { t } = useT();
  const s = STYLE[status];
  // Show direction arrow for borderline/critical too, so the badge always says which way.
  const mark = status === 'borderline' || status === 'critical' ? (direction === 'low' ? '▼' : direction === 'high' ? '▲' : s.mark) : s.mark;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-sm font-medium ${s.bg} ${s.text}`}>
      <span aria-hidden>{mark}</span>{t(status)}
    </span>
  );
}

export default function ResultRow({ r }: { r: Result }) {
  const { t, lang } = useT();
  const [open, setOpen] = useState(r.status !== 'normal');
  const range = rangeLabel(r.rangeLow, r.rangeHigh);
  // flash the card once when the AI text arrives while the person is on the page (not on every visit)
  const before = useRef(r.aiState);
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (before.current !== 'done' && r.aiState === 'done') { setFlash(true); setTimeout(() => setFlash(false), 2700); }
    before.current = r.aiState;
  }, [r.aiState]);
  return (
    <li id={`res-${r.code}`} className={`border-b border-line py-4 last:border-0 ${flash ? 'ai-new' : ''}`}>
      <button className="block w-full text-left" onClick={() => setOpen(!open)} aria-expanded={open}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-medium">{lang === 'bn' ? r.nameBn : r.name}</div>
            {r.name !== r.nameBn && <div className="text-sm text-muted">{lang === 'bn' ? r.name : r.nameBn}</div>}
          </div>
          <div className="text-right">
            <div className="text-lg font-semibold tabular-nums">{r.value} <span className="text-sm font-normal text-muted">{r.unit}</span></div>
            <StatusBadge status={r.status} direction={r.direction} />
          </div>
        </div>
        <RangeBar value={r.value} low={r.rangeLow} high={r.rangeHigh} status={r.status} />
        {range && <div className="text-sm text-muted">{t('normalRange')}: {range} {r.unit}</div>}
      </button>
      {open && (
        <div className="mt-3 border-l-2 border-line pl-4">
          {(r.aiState === 'writing' || r.aiState === 'waiting') && (
            <p className={`mb-1.5 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${r.aiState === 'writing' ? 'ai-shimmer text-brand-dark' : 'bg-wash text-muted'}`}>
              <Icon name="sparkle" size={12} className={r.aiState === 'writing' ? 'spark-turn' : ''} />
              {r.aiState === 'writing' ? t('aiRewriting') : t('aiWaiting')}
              {r.aiState === 'writing' && <span className="loading-dots" aria-hidden="true"><span>.</span><span>.</span><span>.</span></span>}
            </p>
          )}
          <p key={r.explanationBn} className={`fade-in ${r.aiState === 'writing' ? 'ai-text-writing' : ''}`}>{r.explanationBn}
            {r.aiWritten && (
              <span title={t('aiTagTitle')} className="ml-2 inline-flex translate-y-[-1px] items-center gap-1 rounded-full bg-brand-tint px-2 py-0.5 align-middle text-xs font-medium text-brand">
                <Icon name="sparkle" size={12} />{t('aiTag')}
              </span>
            )}
          </p>
          <p className="mt-2 text-sm text-muted">{t('whyFlag')}: {lang === 'bn' ? reasonBn(r.reason) : r.reason}</p>
        </div>
      )}
    </li>
  );
}
