'use client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import ConfirmForm from '@/components/ConfirmForm';
import Icon from '@/components/Icon';
import ResultRow from '@/components/ResultRow';
import Shell from '@/components/Shell';
import StatusStrip from '@/components/StatusStrip';
import { useConfirm } from '@/components/ConfirmDialog';
import { useToast } from '@/components/Toast';
import { api, openFile } from '@/lib/api';
import { bnNum, fmtDate } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { DraftTest, HistoryItem, Report } from '@/lib/types';
import { useBanglaVoice } from '@/lib/useBanglaVoice';

type Filter = 'all' | 'attention' | 'normal';

export default function ReportPage() {
  const { id } = useParams<{ id: string }>();
  const { t, lang } = useT();
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const voice = useBanglaVoice();
  const [report, setReport] = useState<Report | null>(null);
  const [others, setOthers] = useState<HistoryItem[]>([]);
  const [editing, setEditing] = useState(false);
  const [err, setErr] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [share, setShare] = useState<{ url: string; expires: string } | null>(null);

  useEffect(() => { api<Report>(`/reports/${id}`).then(setReport).catch((e) => setErr(e.message)); }, [id]);
  useEffect(() => {
    if (!report || report.status !== 'CONFIRMED') return;
    api<HistoryItem[]>(`/profiles/${report.profileId}/reports`)
      .then((h) => setOthers(h.filter((x) => x.id !== report.id && x.status === 'CONFIRMED'))).catch(() => {});
  }, [report?.id, report?.status, report?.profileId]); // eslint-disable-line react-hooks/exhaustive-deps

  const shown = useMemo(() => (report?.results ?? []).filter((r) =>
    filter === 'all' ? true : filter === 'normal' ? r.status === 'normal' : r.status !== 'normal'), [report, filter]);

  if (err) return <Shell><p role="alert" className="text-bad">{err}</p><Link className="link" href="/">{t('back')}</Link></Shell>;
  if (!report) return <Shell><div className="skeleton h-10 w-64" /><div className="skeleton mt-6 h-64 w-full" /></Shell>;

  // Values for the check screen: what the AI read, or (when editing) the saved results.
  const rows: DraftTest[] = editing || report.status === 'CONFIRMED'
    ? report.results.map((r) => ({
        code: r.code, name: r.name, value: r.value, unit: r.unit,
        printed_low: r.rangeSource === 'report' ? r.rangeLow : null,
        printed_high: r.rangeSource === 'report' ? r.rangeHigh : null,
      }))
    : report.draft?.tests ?? [];

  async function remove() {
    if (!(await confirm({ title: t('delReportTitle'), message: t('delReportText'), confirmLabel: t('yesDelete'), danger: true }))) return;
    await api(`/reports/${id}`, { method: 'DELETE' });
    toast(t('toastDeleted'));
    router.push('/');
  }

  async function startShare() {
    try {
      const r = await api<{ token: string; expiresAt: string }>(`/reports/${id}/share`, { body: {} });
      setShare({ url: `${window.location.origin}/s/${r.token}`, expires: r.expiresAt });
    } catch (e: any) { toast(e.message, 'error'); }
  }
  async function stopShare() {
    await api(`/reports/${id}/share`, { method: 'DELETE' }); setShare(null); toast(t('linkOffDone'));
  }
  async function copyShare() {
    try { await navigator.clipboard.writeText(share!.url); toast(t('copied')); } catch { toast(share!.url); }
  }

  const deleteControl = (
    <div className="no-print mt-6">
      <button className="inline-flex items-center gap-1.5 text-sm text-bad underline underline-offset-2" onClick={remove}><Icon name="trash" size={15} />{t('deleteReport')}</button>
    </div>
  );

  if (report.status === 'DRAFT' || editing) {
    return (
      <Shell>
        <ConfirmForm report={report} rows={rows} onDone={(r) => { setReport(r); setEditing(false); toast(t('toastSaved')); window.scrollTo(0, 0); }} />
        {report.status === 'DRAFT' && deleteControl}
      </Shell>
    );
  }

  const urgent = report.nextStep?.urgency === 'urgent';
  const flagged = report.results.filter((r) => r.status !== 'normal');
  const counts = {
    normal: report.results.length - flagged.length,
    borderline: report.results.filter((r) => r.status === 'borderline').length,
    abnormal: report.results.filter((r) => ['low', 'high', 'critical'].includes(r.status)).length,
  };
  const reportDate = report.reportDate ?? report.createdAt;
  // The most recent confirmed report before this one, offered for a quick comparison.
  const previous = others.filter((o) => (o.reportDate ?? o.createdAt) <= reportDate)
    .sort((a, b) => (b.reportDate ?? b.createdAt).localeCompare(a.reportDate ?? a.createdAt))[0] ?? others[0];

  const readAloud = () => {
    if (voice.speaking) return voice.stop();
    const texts = [report.summaryBn ?? '', report.nextStep?.urgency !== 'none' ? report.nextStep?.urgency_text_bn ?? '' : '']
      .concat(flagged.map((r) => `${r.nameBn}। ${r.explanationBn}`));
    voice.speak(texts.filter(Boolean));
  };

  return (
    <Shell>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1>{t('results')}</h1>
          <p className="text-muted">{fmtDate(report.reportDate, lang)}{report.labName ? ` · ${report.labName}` : ''}</p>
        </div>
        <div className="no-print flex flex-wrap gap-2">
          {voice.supported && (
            <button className="btn-quiet gap-2" onClick={readAloud} aria-pressed={voice.speaking}>
              <Icon name={voice.speaking ? 'stop' : 'speaker'} size={18} />{voice.speaking ? t('stopListen') : t('listen')}
            </button>
          )}
          <button className="btn-quiet gap-2" onClick={() => window.print()}><Icon name="print" size={18} />{t('print')}</button>
        </div>
      </div>

      {urgent && (
        <div role="alert" className="mt-4 flex gap-3 rounded-lg border border-crit/30 border-l-4 border-l-crit bg-crit-tint px-4 py-3 font-medium text-crit">
          <Icon name="alert" className="mt-0.5 shrink-0" />{t('urgentBanner')}
        </div>
      )}

      {(report.warnings ?? []).map((w, i) => (
        <div key={i} role="status" className="mt-4 flex gap-3 rounded-lg border border-warn/30 border-l-4 border-l-warn bg-warn-tint px-4 py-3 text-warn">
          <Icon name="alert" className="mt-0.5 shrink-0" />
          <div><div className="font-medium">{t('checkAgain')}</div><p className="text-ink">{lang === 'bn' ? bnNum(w.text_bn) : w.text}</p>
            <button className="link mt-1 text-sm" onClick={() => setEditing(true)}>{t('editValues')}</button></div>
        </div>
      ))}

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[360px_1fr]">
        <aside className="lg:sticky lg:top-6">
      <section className="panel mt-0">
        <p className="text-lg">{report.summaryBn}</p>
        <div className="mt-4"><StatusStrip {...counts} /></div>
      </section>

      {report.nextStep && report.nextStep.urgency !== 'none' && (
        <section className="panel mt-4 bg-brand-tint/40">
          <h2>{t('nextStep')}</h2>
          <p className="mt-1">{report.nextStep.urgency_text_bn}</p>
          {report.nextStep.specialist_bn && (
            <p className="text-muted">{t('specialist')}: {lang === 'bn' ? report.nextStep.specialist_bn : report.nextStep.specialist}</p>
          )}
        </section>
      )}

        <div className="no-print mt-4 flex flex-col gap-2">
        <button className="btn w-full gap-2" onClick={() => openFile(`/reports/${id}/summary.pdf`, 'medilens-doctor-summary.pdf').catch((e) => toast(e.message, 'error'))}>
          <Icon name="download" size={18} />{t('downloadSummary')}
        </button>
        {previous && <Link href={`/reports/${id}/compare?with=${previous.id}`} className="btn-quiet w-full gap-2"><Icon name="compare" size={18} />{t('compare')}</Link>}
        <button className="btn-quiet w-full gap-2" onClick={startShare}><Icon name="users" size={18} />{t('shareDoctor')}</button>
        {share && (
          <div className="rounded-lg border border-brand/30 bg-brand-tint/40 p-3 text-sm">
            <p className="text-muted">{t('shareHint')}</p>
            <input readOnly aria-label="Share link" value={share.url} className="mt-2 w-full bg-white text-sm" onFocus={(e) => e.currentTarget.select()} />
            <p className="mt-1 text-xs text-muted">{t('linkValidUntil')}: {fmtDate(share.expires, lang)}</p>
            <div className="mt-2 flex gap-2"><button className="btn !min-h-[38px] flex-1 !px-3 text-sm" onClick={copyShare}>{t('copyLink')}</button>
              <button className="btn-quiet !min-h-[38px] !px-3 text-sm" onClick={stopShare}>{t('linkOff')}</button></div>
          </div>
        )}
        <button className="btn-quiet w-full gap-2" onClick={() => setEditing(true)}><Icon name="edit" size={18} />{t('editValues')}</button>
        {(report as any).fileMime !== 'demo/none' && <button className="btn-quiet w-full gap-2" onClick={() => openFile(`/reports/${id}/file`).catch((e) => toast(e.message, 'error'))}><Icon name="file" size={18} />{t('showOriginal')}</button>}
        </div>

        </aside>
        <div>
      <div className="no-print mb-3 flex flex-wrap gap-2" role="group" aria-label="Filter">
        {([['all', 'filterAll', report.results.length], ['attention', 'filterAttention', flagged.length], ['normal', 'normal', counts.normal]] as const).map(([k, label, n]) => (
          <button key={k} className="chip" aria-pressed={filter === k} onClick={() => setFilter(k)}>{t(label)} · {n}</button>
        ))}
      </div>

      <section className="panel">
        {shown.length === 0 ? <p className="text-muted">{t('allGood')}</p> : <ul>{shown.map((r) => <ResultRow key={r.id} r={r} />)}</ul>}
      </section>

        </div>
      </div>

      {deleteControl}
    </Shell>
  );
}
