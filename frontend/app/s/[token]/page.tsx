'use client';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import Icon, { Logo } from '@/components/Icon';
import { api, openFile } from '@/lib/api';

interface Shared {
  patient: { name: string; sex: string | null; birthDate: string | null };
  reportDate: string | null; labName: string | null; expiresAt: string;
  nextStep: { urgency: string; urgency_text: string; specialist: string | null } | null;
  warnings: { text: string }[] | null;
  results: { code: string; name: string; value: number; unit: string; rangeLow: number | null; rangeHigh: number | null; status: string; reason: string }[];
}

const COLOR: Record<string, string> = { low: 'text-bad', high: 'text-bad', critical: 'text-crit', borderline: 'text-warn', normal: 'text-ok' };
const LABEL: Record<string, string> = { low: 'LOW', high: 'HIGH', critical: 'CRITICAL', borderline: 'Borderline', normal: 'Normal' };
const age = (b: string | null) => (b ? `${Math.floor((Date.now() - new Date(b).getTime()) / (365.25 * 86400_000))} years` : 'Not given');
const range = (lo: number | null, hi: number | null) => (lo != null && hi != null ? `${lo} – ${hi}` : hi != null ? `< ${hi}` : lo != null ? `> ${lo}` : '–');

/** Public, read-only page a doctor opens from a link the patient shared. */
export default function SharedPage() {
  const { token } = useParams<{ token: string }>();
  const [d, setD] = useState<Shared | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => { api<Shared>(`/shared/${token}`).then(setD).catch((e) => setErr(e.message)); }, [token]);

  if (err) return (
    <main className="mx-auto max-w-md px-5 py-20 text-center">
      <Logo size={40} /><h1 className="mt-4 text-2xl">Link not available</h1><p className="mt-2 text-muted">{err}</p>
    </main>
  );
  if (!d) return <main className="mx-auto max-w-4xl px-5 py-10"><div className="skeleton h-10 w-60" /><div className="skeleton mt-6 h-64 w-full" /></main>;

  const flagged = d.results.filter((r) => r.status !== 'normal');
  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5"><Logo size={34} /><div><div className="text-xl font-semibold">MediLens</div><div className="text-sm text-muted">Lab report summary shared by the patient</div></div></div>
        <div className="no-print flex gap-2">
          <button className="btn-quiet gap-2" onClick={() => window.print()}><Icon name="print" size={18} />Print</button>
          <button className="btn gap-2" onClick={() => openFile(`/shared/${token}/summary.pdf`, 'medilens-summary.pdf')}><Icon name="download" size={18} />Download PDF</button>
        </div>
      </header>

      <section className="panel mt-6 grid gap-4 sm:grid-cols-4">
        {[['Patient', d.patient.name], ['Sex', d.patient.sex ? d.patient.sex[0].toUpperCase() + d.patient.sex.slice(1) : 'Not given'], ['Age', age(d.patient.birthDate)],
          ['Report date', `${d.reportDate ?? 'Not given'}${d.labName ? ' · ' + d.labName : ''}`]].map(([l, v]) => (
          <div key={l}><div className="text-xs uppercase tracking-wide text-muted">{l}</div><div className="font-semibold">{v}</div></div>
        ))}
      </section>

      <p className="mt-5 text-lg font-semibold">
        {d.results.length} tests reviewed:{' '}
        <span className={flagged.length ? 'text-bad' : 'text-ok'}>{flagged.length ? `${flagged.length} outside the reference range` : 'all within the reference range'}</span>
      </p>

      {(d.warnings ?? []).map((w, i) => (
        <div key={i} className="mt-3 flex gap-3 rounded-lg border border-warn/30 border-l-4 border-l-warn bg-warn-tint px-4 py-3 text-ink">
          <Icon name="alert" className="mt-0.5 shrink-0 text-warn" /><span>{w.text}</span>
        </div>
      ))}

      <section className="panel mt-4 overflow-x-auto p-0 sm:p-0">
        <table className="w-full min-w-[34rem] text-left">
          <thead className="bg-wash text-xs uppercase tracking-wide text-muted">
            <tr><th className="px-4 py-2.5">Test</th><th className="px-4 py-2.5 text-right">Result</th><th className="px-4 py-2.5">Unit</th><th className="px-4 py-2.5">Reference</th><th className="px-4 py-2.5">Status</th></tr>
          </thead>
          <tbody>
            {d.results.map((r) => (
              <tr key={r.code} className={`border-t border-line ${['low', 'high', 'critical'].includes(r.status) ? 'bg-bad-tint/50' : r.status === 'borderline' ? 'bg-warn-tint/60' : ''}`}>
                <td className="px-4 py-2.5"><div className={r.status !== 'normal' ? 'font-semibold' : ''}>{r.name}</div>
                  {r.status !== 'normal' && <div className="text-sm text-muted">{r.reason.replace(/your report/g, 'the report').replace(/your age and sex/g, 'the patient’s age and sex')}</div>}</td>
                <td className={`px-4 py-2.5 text-right font-semibold tabular-nums ${COLOR[r.status]}`}>{r.value}</td>
                <td className="px-4 py-2.5 text-muted">{r.unit}</td>
                <td className="whitespace-nowrap px-4 py-2.5 tabular-nums">{range(r.rangeLow, r.rangeHigh)}</td>
                <td className={`px-4 py-2.5 font-semibold ${COLOR[r.status]}`}>{LABEL[r.status]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {d.nextStep?.specialist && (
        <section className="panel mt-4 bg-brand-tint/40">
          <div className="text-xs uppercase tracking-wide text-muted">Suggested next step</div>
          <div className="font-semibold">{d.nextStep.specialist} · {d.nextStep.urgency_text}</div>
        </section>
      )}

      <p className="mt-8 border-t border-line pt-4 text-sm text-muted">
        Generated automatically from a laboratory report uploaded by the patient; the values were confirmed by the patient. It is not a diagnosis and does not
        replace clinical judgement. Please verify against the original laboratory report. This link works until {new Date(d.expiresAt).toLocaleDateString()}.
      </p>
    </main>
  );
}
