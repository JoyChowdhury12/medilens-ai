'use client';
import { CartesianGrid, Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useT } from '@/lib/i18n';
import { fmtDate } from '@/lib/format';
import { Trend } from '@/lib/types';
import { useChartColors } from '@/lib/theme';

export default function TrendChart({ trend }: { trend: Trend }) {
  const { t, lang } = useT();
  const c = useChartColors();
  const COLOR: Record<string, string> = { normal: c.ok, borderline: c.warn, low: c.bad, high: c.bad, critical: c.crit };
  const last = trend.points[trend.points.length - 1];
  const low = last.rangeLow, high = last.rangeHigh;
  const vals = trend.points.map((p) => p.value);
  const lo = Math.min(...vals, low ?? Infinity), hi = Math.max(...vals, high ?? -Infinity);
  const pad = (hi - lo || 1) * 0.2;
  const data = trend.points.map((p) => ({ ...p, label: fmtDate(p.date, lang) }));

  return (
    <div>
      <div className="h-64 w-full" role="img" aria-label={`${trend.name} chart`}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 10, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={c.line} vertical={false} />
            {(low != null || high != null) && (
              <ReferenceArea y1={low ?? Math.max(0, lo - pad)} y2={high ?? hi + pad} fill={c.okTint} fillOpacity={0.9} stroke={c.ok} strokeOpacity={0.25} />
            )}
            <XAxis dataKey="label" tick={{ fontSize: 12, fill: c.muted }} />
            <YAxis domain={[Math.max(0, lo - pad), hi + pad]} tick={{ fontSize: 12, fill: c.muted }} width={44} tickFormatter={(v) => `${Math.round(v * 10) / 10}`} />
            <Tooltip contentStyle={{ background: c.surface, border: `1px solid ${c.line}`, color: c.ink }} formatter={(v: any) => [`${v} ${trend.unit}`, trend.name]} />
            <Line type="monotone" dataKey="value" stroke={c.ink} strokeWidth={2} isAnimationActive={false}
              dot={(p: any) => <circle key={p.index} cx={p.cx} cy={p.cy} r={5} fill={COLOR[p.payload.status]} stroke={c.surface} strokeWidth={1.5} />} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-1 text-sm text-muted">
        <span className="inline-block h-2.5 w-4 align-middle bg-ok-tint ring-1 ring-ok/40" /> {t('normalRange')} · {trend.unit}
      </p>
    </div>
  );
}
