'use client';
import { useEffect, useState } from 'react';
import { api, fileUrl } from '@/lib/api';
import { today } from '@/lib/format';
import { useT } from '@/lib/i18n';
import LoadingPanel, { recordDuration } from './LoadingPanel';
import { DraftTest, Report } from '@/lib/types';

type Row = DraftTest & { key: number };

/** Step 2: the person checks the values the AI read before anything is explained. */
export default function ConfirmForm({ report, rows: initial, onDone }: {
  report: Report; rows: DraftTest[]; onDone: (r: Report) => void;
}) {
  const { t } = useT();
  const [rows, setRows] = useState<Row[]>(initial.map((r, i) => ({ ...r, key: i })));
  const [date, setDate] = useState(report.reportDate ?? today());
  const [lab, setLab] = useState(report.labName ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [img, setImg] = useState<string | null>(null);
  const [showImg, setShowImg] = useState(false);

  useEffect(() => {
    if (!showImg || img || report.id === undefined) return;
    fileUrl(`/reports/${report.id}/file`).then(setImg).catch(() => {});
  }, [showImg, img, report.id]);

  const set = (k: number, patch: Partial<DraftTest>) => setRows(rows.map((r) => (r.key === k ? { ...r, ...patch } : r)));
  const num = (s: string) => (s.trim() === '' || isNaN(Number(s)) ? null : Number(s));

  const problems = (report.quality?.problems ?? []).map((p) => (/blur/i.test(p) ? t('blurry') : /dark/i.test(p) ? t('dark') : p));

  async function submit() {
    setBusy(true); setErr('');
    const started = Date.now();
    try {
      const r = await api<Report>(`/reports/${report.id}/confirm`, {
        body: {
          reportDate: date, ...(lab ? { labName: lab } : {}),
          tests: rows.map((x) => ({
            code: x.code, value: Number(x.value),
            ...(x.printed_low != null ? { printedLow: x.printed_low } : {}),
            ...(x.printed_high != null ? { printedHigh: x.printed_high } : {}),
          })),
        },
      });
      recordDuration('confirm', (Date.now() - started) / 1000);
      onDone(r);
    } catch (e: any) { setErr(e.message || t('genericError')); setBusy(false); }
  }

  const empty = rows.length === 0;
  return (
    <div className="panel">
      <h1>{empty ? t('noTests') : t('confirmTitle')}</h1>
      {problems.map((p) => <p key={p} className="mt-2 rounded bg-warn-tint px-3 py-2 text-warn">{p}</p>)}
      {!empty && <p className="mt-2 text-muted">{t('confirmHint')}</p>}

      <button className="link mt-3 text-base" onClick={() => setShowImg(!showImg)}>{t('showOriginal')}</button>
      {showImg && (img
        ? (/* eslint-disable-next-line @next/next/no-img-element */ <img src={img} alt="" className="mt-2 max-h-[60vh] w-full rounded border border-line object-contain" />)
        : <p className="mt-2 text-muted">{t('loading')}</p>)}

      <ul className="mt-4">
        {rows.map((r) => (
          <li key={r.key} className={`border-b border-line py-4 ${r.needs_check ? 'bg-warn-tint/60 -mx-3 px-3' : ''}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-medium">{r.name}</div>
                {r.needs_check && <div className="text-sm font-medium text-warn">{t('checkThis')}</div>}
                {r.source_line && <div className="text-sm text-muted">{t('readAs')}: “{r.source_line}”</div>}
              </div>
              <button className="shrink-0 whitespace-nowrap text-sm text-bad underline underline-offset-2" onClick={() => setRows(rows.filter((x) => x.key !== r.key))}>{t('remove')}</button>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-3">
              <div><label htmlFor={`v${r.key}`}>{t('value')} ({r.unit})</label>
                <input id={`v${r.key}`} inputMode="decimal" className="w-full" value={r.value ?? ''}
                  onChange={(e) => set(r.key, { value: e.target.value as any })} /></div>
              <div><label htmlFor={`l${r.key}`}>{t('rangeLow')}</label>
                <input id={`l${r.key}`} inputMode="decimal" className="w-full" value={r.printed_low ?? ''}
                  onChange={(e) => set(r.key, { printed_low: num(e.target.value) })} /></div>
              <div><label htmlFor={`h${r.key}`}>{t('rangeHigh')}</label>
                <input id={`h${r.key}`} inputMode="decimal" className="w-full" value={r.printed_high ?? ''}
                  onChange={(e) => set(r.key, { printed_high: num(e.target.value) })} /></div>
            </div>
          </li>
        ))}
      </ul>

      {!empty && (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div><label htmlFor="date">{t('reportDate')}</label><input id="date" type="date" className="w-full" value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
              {report.draft?.meta?.report_date && date === report.draft.meta.report_date && <p className="mt-1 text-xs text-muted">{t('fromReport')}</p>}</div>
            <div><label htmlFor="lab">{t('labName')}</label><input id="lab" className="w-full" value={lab} onChange={(e) => setLab(e.target.value)} maxLength={120} />
              {report.draft?.meta?.lab_name && lab === report.draft.meta.lab_name && <p className="mt-1 text-xs text-muted">{t('fromReport')}</p>}</div>
          </div>
          {err && <p role="alert" className="mt-4 text-bad">{err}</p>}
          {busy ? <LoadingPanel kind="confirm" hint={4 + rows.length * 1.5} /> : (
            <button className="btn mt-6 w-full sm:w-auto" disabled={rows.some((r) => r.value === null || String(r.value) === '' || isNaN(Number(r.value)))} onClick={submit}>
              {t('confirmBtn')}
            </button>
          )}
        </>
      )}
    </div>
  );
}
