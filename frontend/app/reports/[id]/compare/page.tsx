'use client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import Icon from '@/components/Icon';
import Shell from '@/components/Shell';
import { StatusBadge } from '@/components/ResultRow';
import { api } from '@/lib/api';
import { fmtDate } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { HistoryItem, Report, Result } from '@/lib/types';

const ORDER: Record<string, number> = { critical: 0, high: 1, low: 1, borderline: 2, normal: 3 };
const dateOf = (r: { reportDate: string | null; createdAt: string }) => r.reportDate ?? r.createdAt.slice(0, 10);

/** How far outside its normal range a result is (0 means inside). */
function deviation(r: Result) {
  if (r.rangeLow != null && r.value < r.rangeLow) return (r.rangeLow - r.value) / (r.rangeLow || 1);
  if (r.rangeHigh != null && r.value > r.rangeHigh) return (r.value - r.rangeHigh) / (r.rangeHigh || 1);
  return 0;
}

function Compare() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { t, lang } = useT();
  const [withId, setWithId] = useState<string | null>(null);
  const [a, setA] = useState<Report | null>(null);
  const [b, setB] = useState<Report | null>(null);
  const [options, setOptions] = useState<HistoryItem[]>([]);

  useEffect(() => { setWithId(new URLSearchParams(window.location.search).get('with')); }, []);
  useEffect(() => {
    api<Report>(`/reports/${id}`).then((r) => {
      setA(r);
      api<HistoryItem[]>(`/profiles/${r.profileId}/reports`).then((h) => setOptions(h.filter((x) => x.id !== r.id && x.status === 'CONFIRMED')));
    });
  }, [id]);
  useEffect(() => { if (withId) api<Report>(`/reports/${withId}`).then(setB).catch(() => setB(null)); }, [withId]);

  if (!a) return <div className="skeleton h-64 w-full" />;
  if (options.length === 0) return <p className="text-muted">{t('noOther')}</p>;

  // Put the earlier report first, whichever way round they were opened.
  const [early, late] = b ? [a, b].sort((x, y) => dateOf(x).localeCompare(dateOf(y))) : [a, a];
  const codes = b ? Array.from(new Set([...early.results, ...late.results].map((r) => r.code))) : [];
  const rows = codes.map((c) => {
    const e = early.results.find((r) => r.code === c), l = late.results.find((r) => r.code === c);
    const base = (l ?? e)!;
    let verdict: 'better' | 'worse' | 'same' | 'one' = 'one';
    if (e && l) { const d = deviation(l) - deviation(e); verdict = d < -0.02 ? 'better' : d > 0.02 ? 'worse' : 'same'; }
    return { code: c, e, l, name: lang === 'bn' ? base.nameBn : base.name, unit: base.unit, verdict, sev: ORDER[(l ?? e)!.status] };
  }).sort((x, y) => x.sev - y.sev);

  const tone = { better: 'bg-ok-tint text-ok', worse: 'bg-bad-tint text-bad', same: 'bg-wash text-muted', one: 'bg-wash text-muted' } as const;
  const label = { better: t('better'), worse: t('worse'), same: t('same'), one: t('onlyOne') } as const;

  return (
    <>
      <div className="panel mb-4">
        <label htmlFor="with" className="mb-1">{t('compareWith')}</label>
        <select id="with" className="w-full sm:w-auto" value={withId ?? ''} onChange={(e) => { setWithId(e.target.value); router.replace(`/reports/${id}/compare?with=${e.target.value}`); }}>
          <option value="" disabled>—</option>
          {options.map((o) => <option key={o.id} value={o.id}>{fmtDate(o.reportDate ?? o.createdAt, lang)}{o.labName ? ` · ${o.labName}` : ''}</option>)}
        </select>
      </div>

      {b && (
        <section className="panel">
          <div className="mb-2 grid grid-cols-[1fr_auto] gap-3 text-sm text-muted sm:grid-cols-[1fr_12rem_12rem_11rem]">
            <span />
            <span className="hidden sm:block">{t('earlier')} · {fmtDate(dateOf(early), lang)}</span>
            <span className="hidden sm:block">{t('later')} · {fmtDate(dateOf(late), lang)}</span>
            <span className="hidden sm:block">{t('change')}</span>
          </div>
          <ul>
            {rows.map((r) => (
              <li key={r.code} className="border-t border-line py-3 first:border-0 sm:grid sm:grid-cols-[1fr_12rem_12rem_11rem] sm:items-center sm:gap-3">
                <div className="font-medium">{r.name}</div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 sm:mt-0">
                  <span className="text-xs text-muted sm:hidden">{fmtDate(dateOf(early), lang)}</span>
                  {r.e ? <><span className="whitespace-nowrap tabular-nums">{r.e.value} <span className="text-sm text-muted">{r.unit}</span></span><StatusBadge status={r.e.status} direction={r.e.direction} /></> : <span className="text-muted">—</span>}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 sm:mt-0">
                  <span className="text-xs text-muted sm:hidden">{fmtDate(dateOf(late), lang)}</span>
                  {r.l ? <><span className="whitespace-nowrap font-semibold tabular-nums">{r.l.value} <span className="text-sm font-normal text-muted">{r.unit}</span></span><StatusBadge status={r.l.status} direction={r.l.direction} /></> : <span className="text-muted">—</span>}
                </div>
                <div className="mt-1 sm:mt-0">
                  <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-sm font-medium ${tone[r.verdict]}`}>
                    {r.e && r.l && r.e.value !== r.l.value && <Icon name={r.l.value > r.e.value ? 'arrowUp' : 'arrowDown'} size={14} />}
                    {r.e && r.l && r.e.value !== r.l.value ? `${r.l.value > r.e.value ? '+' : ''}${Math.round((r.l.value - r.e.value) * 100) / 100} · ` : ''}{label[r.verdict]}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

export default function ComparePage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useT();
  return (
    <Shell wide>
      <Link href={`/reports/${id}`} className="link inline-flex items-center gap-1 text-sm"><Icon name="chevron" size={14} className="rotate-180" />{t('back')}</Link>
      <h1 className="mb-4 mt-2">{t('compareTitle')}</h1>
      <Suspense fallback={<div className="skeleton h-64 w-full" />}><Compare /></Suspense>
    </Shell>
  );
}
