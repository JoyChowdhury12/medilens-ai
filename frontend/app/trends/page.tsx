'use client';
import { useEffect, useState } from 'react';
import Icon from '@/components/Icon';
import Shell from '@/components/Shell';
import { StatusBadge } from '@/components/ResultRow';
import TrendChart from '@/components/TrendChart';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fmtDate } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { Trend } from '@/lib/types';

const TREND_ICON: Record<string, string> = { improving: 'arrowDown', worsening: 'arrowUp' };

export default function TrendsPage() {
  const { t, lang } = useT();
  const { current } = useAuth();
  const [trends, setTrends] = useState<Trend[] | null>(null);
  const [sel, setSel] = useState<string | null>(null);

  useEffect(() => {
    if (!current) return;
    setTrends(null);
    const wanted = new URLSearchParams(window.location.search).get('code');
    api<Trend[]>(`/profiles/${current.id}/trends`).then((d) => {
      setTrends(d);
      setSel((cur) => [cur, wanted].find((c) => c && d.find((x) => x.code === c)) ?? (d.find((x) => x.points.length > 1) ?? d[0])?.code ?? null);
    });
  }, [current]);

  const chosen = trends?.find((x) => x.code === sel);
  return (
    <Shell wide>
      <h1 className="mb-1">{t('trendsTitle')}</h1>
      <p className="mb-5 text-muted">{current?.name}</p>
      {trends === null && <div className="skeleton h-72 w-full" />}
      {trends && trends.length === 0 && <div className="panel text-muted">{t('trendsEmpty')}</div>}

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        {chosen && (
          <section className="panel lg:order-1">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2>{lang === 'bn' ? chosen.nameBn : chosen.name}</h2>
              <span className="text-sm text-muted">{t(`trend_${chosen.trend}`)}</span>
            </div>
            {chosen.points.length > 1
              ? <div className="mt-3"><TrendChart trend={chosen} /></div>
              : <p className="mt-3 text-muted">{t('trendsNeedTwo')}</p>}
            <p className="mt-2 text-sm text-muted">{fmtDate(chosen.points[0].date, lang)} – {fmtDate(chosen.latest.date, lang)}</p>
          </section>
        )}

        {trends && trends.length > 0 && (
          <ul className="panel max-h-[34rem] self-start overflow-y-auto p-0 sm:p-0 lg:order-2">
            {trends.map((tr) => (
              <li key={tr.code} className="border-b border-line last:border-0">
                <button onClick={() => { setSel(tr.code); if (window.innerWidth < 1024) window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                  aria-current={tr.code === sel}
                  className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-wash ${tr.code === sel ? 'bg-brand-tint/60' : ''}`}>
                  <div>
                    <div className="font-medium">{lang === 'bn' ? tr.nameBn : tr.name}</div>
                    <div className="flex items-center gap-1 text-sm text-muted">
                      {TREND_ICON[tr.trend] && <Icon name={TREND_ICON[tr.trend]} size={13} />}{t(`trend_${tr.trend}`)} · {tr.points.length} {t('reportsCount')}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold tabular-nums">{tr.latest.value} <span className="text-sm font-normal text-muted">{tr.unit}</span></div>
                    <StatusBadge status={tr.latest.status} />
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Shell>
  );
}
