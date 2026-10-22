'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { DragEvent, useEffect, useRef, useState } from 'react';
import Icon from '@/components/Icon';
import Shell from '@/components/Shell';
import Sparkline from '@/components/Sparkline';
import StatusStrip from '@/components/StatusStrip';
import { StatusBadge } from '@/components/ResultRow';
import { useConfirm } from '@/components/ConfirmDialog';
import { useToast } from '@/components/Toast';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fmtDate, today } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { HistoryItem, Reminder, Trend } from '@/lib/types';

const ORDER: Record<string, number> = { critical: 0, high: 1, low: 1, borderline: 2, normal: 3 };

export default function Home() {
  const { t, lang } = useT();
  const { current, user, reloadProfiles, setCurrentId } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const camInput = useRef<HTMLInputElement>(null);
  const [history, setHistory] = useState<HistoryItem[] | null>(null);
  const [trends, setTrends] = useState<Trend[] | null>(null);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);

  useEffect(() => {
    if (!current) return;
    setHistory(null); setTrends(null);
    api<HistoryItem[]>(`/profiles/${current.id}/reports`).then(setHistory).catch((e) => toast(e.message, 'error'));
    api<Trend[]>(`/profiles/${current.id}/trends`).then(setTrends).catch(() => setTrends([]));
    api<Reminder[]>(`/reminders?profileId=${current.id}&pending=true`).then((r) => setReminders(r.slice(0, 3))).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  async function upload(file?: File) {
    if (!file || !current) return;
    if (!/^(image\/(jpeg|png)|application\/pdf)$/.test(file.type)) { toast(t('badFileType'), 'error'); return; }
    setBusy(true);
    const form = new FormData();
    form.append('file', file);
    try {
      const r = await api<{ id: string }>(`/profiles/${current.id}/reports`, { form });
      router.push(`/reports/${r.id}`);
    } catch (e: any) { toast(e.message || t('genericError'), 'error'); setBusy(false); }
    [fileInput, camInput].forEach((r) => { if (r.current) r.current.value = ''; });
  }
  async function loadDemo() {
    try {
      const r = await api<{ profileId: string }>('/demo', { body: {} });
      await reloadProfiles(); setCurrentId(r.profileId); toast(t('demoLoaded'));
    } catch (e: any) { toast(e.message, 'error'); }
  }
  const keyTrends = (trends ?? []).filter((x) => x.points.length > 1)
    .sort((a, b) => (+(b.trend !== 'stable') - +(a.trend !== 'stable')) || ORDER[a.latest.status] - ORDER[b.latest.status]).slice(0, 6);
  const onDrop = (e: DragEvent) => { e.preventDefault(); setDrag(false); upload(e.dataTransfer.files?.[0]); };

  const latest = trends ?? [];
  const counts = {
    normal: latest.filter((x) => x.latest.status === 'normal').length,
    borderline: latest.filter((x) => x.latest.status === 'borderline').length,
    abnormal: latest.filter((x) => ['low', 'high', 'critical'].includes(x.latest.status)).length,
  };
  const attention = latest.filter((x) => x.latest.status !== 'normal')
    .sort((a, b) => ORDER[a.latest.status] - ORDER[b.latest.status]).slice(0, 5);
  const lastDate = latest.map((x) => x.latest.date).sort().pop();
  const confirm = useConfirm();
  const removeReport = async (id: string) => {
    if (!(await confirm({ title: t('delReportTitle'), message: t('delReportText'), confirmLabel: t('yesDelete'), danger: true }))) return;
    await api(`/reports/${id}`, { method: 'DELETE' }); setHistory((h) => (h ?? []).filter((x) => x.id !== id)); toast(t('toastDeleted'));
    if (current) api<Trend[]>(`/profiles/${current.id}/trends`).then(setTrends).catch(() => {});
  };
  const firstTime = history !== null && history.length === 0;

  return (
    <Shell wide>
      <div className="mb-6">
        <p className="text-muted">{t('greeting')}, {user?.name.split(' ')[0]}</p>
        <h1 className="text-3xl">{current?.name}</h1>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          {/* Upload */}
          <section className={`panel border-2 border-dashed text-center transition-colors ${drag ? 'border-brand bg-brand-tint' : 'border-brand/40'}`}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={onDrop}>
            <input ref={fileInput} type="file" hidden accept="image/jpeg,image/png,application/pdf" onChange={(e) => upload(e.target.files?.[0])} />
            <input ref={camInput} type="file" hidden accept="image/*" capture="environment" onChange={(e) => upload(e.target.files?.[0])} />
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-tint text-brand"><Icon name="upload" size={24} /></div>
            <h2 className="mt-3 text-xl">{drag ? t('dropHere') : t('uploadCta')}</h2>
            <p className="mt-1 text-sm text-muted">{busy ? t('reading') : t('dropHint')}</p>
            {busy ? (
              <div className="mx-auto mt-4 h-1.5 w-48 overflow-hidden rounded bg-line"><div className="h-full w-1/2 animate-pulse rounded bg-brand" /></div>
            ) : (
              <div className="mt-4 flex flex-wrap justify-center gap-3">
                <button className="btn gap-2" disabled={!current} onClick={() => fileInput.current?.click()}><Icon name="file" size={18} />{t('chooseFile')}</button>
                <button className="btn-quiet gap-2 lg:hidden" disabled={!current} onClick={() => camInput.current?.click()}><Icon name="camera" size={18} />{t('takePhoto')}</button>
              </div>
            )}
            <ol className="mt-5 flex flex-wrap justify-center gap-x-6 gap-y-1 text-sm text-muted">
              {['step1', 'step2', 'step3'].map((k, i) => (
                <li key={k} className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-wash text-xs font-semibold text-ink">{i + 1}</span>{t(k)}
                </li>
              ))}
            </ol>
          </section>

          {/* Current status */}
          {trends === null ? <div className="skeleton h-36 w-full" /> : latest.length > 0 && (
            <section className="panel">
              <div className="flex items-baseline justify-between gap-3">
                <h2>{t('currentStatus')}</h2>
                {lastDate && <span className="text-sm text-muted">{fmtDate(lastDate, lang)}</span>}
              </div>
              <p className="mb-3 text-sm text-muted">{t('basedOn')}</p>
              <StatusStrip {...counts} />
              {attention.length === 0 ? (
                <p className="mt-4 flex items-center gap-2 text-ok"><Icon name="check" size={18} />{t('allGood')}</p>
              ) : (
                <ul className="mt-3">
                  {attention.map((x) => (
                    <li key={x.code} className="border-t border-line">
                      <Link href={`/trends?code=${x.code}`} className="flex items-center justify-between gap-3 py-2.5 hover:bg-wash">
                        <span className="min-w-0 font-medium">{lang === 'bn' ? x.nameBn : x.name}</span>
                        <span className="flex items-center gap-3">
                          <span className="whitespace-nowrap tabular-nums">{x.latest.value} <span className="text-sm text-muted">{x.unit}</span></span>
                          <StatusBadge status={x.latest.status} />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              <Link href="/trends" className="link mt-2 inline-block text-sm">{t('viewAll')}</Link>
            </section>
          )}

          {/* Key trends */}
          {keyTrends.length > 0 && (
            <section className="panel">
              <div className="flex items-baseline justify-between gap-3"><h2>{t('keyTrends')}</h2><Link href="/trends" className="link text-sm">{t('viewAll')}</Link></div>
              <p className="mb-3 text-sm text-muted">{t('keyTrendsHint')}</p>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {keyTrends.map((x) => {
                  const col = x.trend === 'improving' ? '#2b7a4b' : x.trend === 'worsening' ? '#b42318' : '#0e6e8c';
                  const last = x.points[x.points.length - 1];
                  return (
                    <Link key={x.code} href={`/trends?code=${x.code}`} className="rounded-lg border border-line p-3 hover:bg-wash">
                      <div className="truncate text-sm text-muted">{lang === 'bn' ? x.nameBn : x.name}</div>
                      <div className="mt-0.5 flex items-baseline gap-1"><span className="text-xl font-semibold tabular-nums">{x.latest.value}</span><span className="text-sm text-muted">{x.unit}</span></div>
                      <div className="mt-1"><Sparkline values={x.points.map((p) => p.value)} low={last.rangeLow} high={last.rangeHigh} color={col} w={150} h={40} /></div>
                      <div className="mt-1 flex items-center gap-1 text-sm" style={{ color: col }}>
                        {x.trend === 'improving' && <Icon name="arrowDown" size={14} />}{x.trend === 'worsening' && <Icon name="arrowUp" size={14} />}
                        {t(`trend_${x.trend}`)}
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          )}

          {/* Recent reports */}
          <section className="panel">
            <h2>{t('recent')}</h2>
            {history === null && <div className="skeleton mt-3 h-16 w-full" />}
            {firstTime && <p className="mt-2 text-muted">{t('noReports')}</p>}
            <ul className="mt-2">
              {(history ?? []).map((h) => (
                <li key={h.id} className="border-t border-line first:border-0">
                  <div className="flex items-center gap-1">
                  <Link href={`/reports/${h.id}`} className="flex min-w-0 flex-1 items-center justify-between gap-3 py-3 hover:bg-wash">
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-wash text-muted"><Icon name="file" size={20} /></span>
                      <div>
                        <div className="font-medium">{fmtDate(h.reportDate ?? h.createdAt, lang)}{h.labName ? ` · ${h.labName}` : ''}</div>
                        <div className="text-sm text-muted">{h.status === 'DRAFT' ? t('unconfirmed') : `${h.testCount} ${t('tests')}`}</div>
                      </div>
                    </div>
                    {h.status === 'DRAFT'
                      ? <span className="rounded bg-warn-tint px-2 py-0.5 text-sm font-medium text-warn">{t('unconfirmed')}</span>
                      : <span className={`rounded px-2 py-0.5 text-sm font-medium ${h.flaggedCount ? 'bg-bad-tint text-bad' : 'bg-ok-tint text-ok'}`}>
                          {h.flaggedCount ? `${h.flaggedCount} ${t('flagged')}` : t('normal')}
                        </span>}
                  </Link>
                  <button className="shrink-0 rounded p-2 text-muted hover:bg-wash hover:text-bad" aria-label={t('deleteReport')} onClick={() => removeReport(h.id)}><Icon name="trash" size={18} /></button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>

        {/* Side column */}
        <div className="space-y-5">
          {firstTime && (
            <section className="panel">
              <h2>{t('getStarted')}</h2>
              <ul className="mt-3 space-y-3 text-sm">
                <li className="flex gap-3">
                  <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${current?.sex && current?.birthDate ? 'bg-ok text-white' : 'border border-line'}`}>
                    {current?.sex && current?.birthDate && <Icon name="check" size={13} />}</span>
                  <span>{t('onboard1')} <Link href="/family" className="link">{t('edit')}</Link></span>
                </li>
                <li className="flex gap-3"><span className="mt-0.5 h-5 w-5 shrink-0 rounded-full border border-line" /><span>{t('onboard2')}</span></li>
              </ul>
              <div className="mt-4 border-t border-line pt-4">
                <button className="btn-quiet w-full gap-2" onClick={loadDemo}><Icon name="chart" size={18} />{t('demoBtn')}</button>
                <p className="mt-2 text-xs text-muted">{t('demoHint')}</p>
              </div>
            </section>
          )}
          <section className="panel">
            <h2>{t('upcoming')}</h2>
            {reminders.length === 0 && <p className="mt-2 text-sm text-muted">{t('noUpcoming')}</p>}
            <ul className="mt-2">
              {reminders.map((r) => (
                <li key={r.id} className="border-t border-line py-2.5 first:border-0">
                  <div>{r.title}</div>
                  <div className={`text-sm ${r.dueDate < today() ? 'font-medium text-bad' : 'text-muted'}`}>
                    {fmtDate(r.dueDate, lang)}{r.dueDate < today() ? ` · ${t('overdue')}` : ''}
                  </div>
                </li>
              ))}
            </ul>
            <Link href="/reminders" className="link mt-1 inline-block text-sm">{t('viewAll')}</Link>
          </section>
        </div>
      </div>
    </Shell>
  );
}
