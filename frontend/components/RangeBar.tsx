import { Status } from '@/lib/types';

const MARK: Record<Status, string> = {
  normal: '#2b7a4b', borderline: '#a86a00', low: '#b42318', high: '#b42318', critical: '#7a0e0e',
};

/**
 * Shows where a value sits against the normal range.
 * The green band is the normal range; the dark tick is the patient's value.
 */
export default function RangeBar({ value, low, high, status }: {
  value: number; low: number | null; high: number | null; status: Status;
}) {
  if (low == null && high == null) return null;
  const lo = low ?? 0;
  const hi = high ?? Math.max(lo * 1.5, value * 1.2, 1);
  const span = Math.max(hi - lo, Math.abs(hi) * 0.1, 0.0001);
  const min = Math.max(0, Math.min(lo - span * 0.6, value - span * 0.1));
  const max = Math.max(hi + span * 0.6, value + span * 0.1);
  const pos = (x: number) => Math.min(100, Math.max(0, ((x - min) / (max - min)) * 100));
  const bandL = low == null ? 0 : pos(lo);
  const bandR = high == null ? 100 : pos(hi);
  const label = `${value}, normal range ${low ?? ''}${low != null && high != null ? ' to ' : ''}${high ?? ''}`;

  return (
    <div className="relative mt-3 h-6" role="img" aria-label={label}>
      <div className="absolute inset-x-0 top-[10px] h-1 rounded bg-line" />
      <div className="absolute top-2 h-2 rounded bg-ok-tint ring-1 ring-ok/40" style={{ left: `${bandL}%`, width: `${bandR - bandL}%` }} />
      <div className="absolute top-0 h-6 w-[3px] -translate-x-1/2 rounded" style={{ left: `${pos(value)}%`, background: MARK[status] }} />
    </div>
  );
}
