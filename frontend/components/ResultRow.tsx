'use client';
import { useState } from 'react';
import { useT } from '@/lib/i18n';
import { rangeLabel, reasonBn } from '@/lib/format';
import { Result, Status } from '@/lib/types';
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
  return (
    <li className="border-b border-line py-4 last:border-0">
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
          <p>{r.explanationBn}</p>
          <p className="mt-2 text-sm text-muted">{t('whyFlag')}: {lang === 'bn' ? reasonBn(r.reason) : r.reason}</p>
        </div>
      )}
    </li>
  );
}
