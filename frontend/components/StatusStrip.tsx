'use client';
import { useT } from '@/lib/i18n';
import { useChartColors } from '@/lib/theme';

/** One bar showing how many tests are normal, borderline or outside the range. */
export default function StatusStrip({ normal, borderline, abnormal }: { normal: number; borderline: number; abnormal: number }) {
  const { t } = useT();
  const c = useChartColors();
  const total = normal + borderline + abnormal || 1;
  const seg = (n: number, color: string) => (n ? <div style={{ width: `${(n / total) * 100}%`, background: color }} /> : null);
  return (
    <div>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-line" role="img"
        aria-label={`${t('normal')} ${normal}, ${t('borderline')} ${borderline}, ${abnormal}`}>
        {seg(normal, c.ok)}{seg(borderline, c.amber)}{seg(abnormal, c.bad)}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
        <span><b className="text-ok">{normal}</b> <span className="text-muted">{t('normal')}</span></span>
        <span><b className="text-warn">{borderline}</b> <span className="text-muted">{t('borderline')}</span></span>
        <span><b className="text-bad">{abnormal}</b> <span className="text-muted">{t('filterAttention')}</span></span>
      </div>
    </div>
  );
}
