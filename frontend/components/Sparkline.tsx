/** Tiny line chart with the normal range shaded behind it. */
export default function Sparkline({ values, low, high, color = '#0e6e8c', w = 140, h = 44 }:
  { values: number[]; low: number | null; high: number | null; color?: string; w?: number; h?: number }) {
  const all = [...values, ...(low != null ? [low] : []), ...(high != null ? [high] : [])];
  const min = Math.min(...all), max = Math.max(...all), span = max - min || 1;
  const pad = 5;
  const x = (i: number) => pad + (values.length === 1 ? (w - 2 * pad) / 2 : (i * (w - 2 * pad)) / (values.length - 1));
  const y = (v: number) => h - pad - ((v - min) / span) * (h - 2 * pad);
  const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const bandTop = high != null ? y(high) : pad, bandBot = low != null ? y(low) : h - pad;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Trend: ${values.join(', ')}`}>
      {(low != null || high != null) && <rect x={0} y={Math.min(bandTop, bandBot)} width={w} height={Math.abs(bandBot - bandTop)} fill="#2b7a4b" opacity={0.12} rx={3} />}
      <polyline points={pts} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {values.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r={i === values.length - 1 ? 3.5 : 2} fill={color} />)}
    </svg>
  );
}
