'use client';
import { useEffect, useRef, useState } from 'react';
import { Status } from '@/lib/types';
import { useChartColors } from '@/lib/theme';
import { useT } from '@/lib/i18n';

/**
 * A three-zone gauge: Low | Normal | High, with the person's value as a pin that slides into place.
 * The numbers at the edges of the green zone are the normal limits, so no extra sentence is needed.
 */
export default function RangeBar({ value, low, high, status }: {
  value: number; low: number | null; high: number | null; status: Status;
}) {
  const { t } = useT();
  const c = useChartColors();
  const box = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  // Slide the pin in when the gauge scrolls into view (once).
  useEffect(() => {
    const el = box.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setShown(true); return; }
    const io = new IntersectionObserver((e) => { if (e[0].isIntersecting) { setShown(true); io.disconnect(); } }, { threshold: 0.4 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  if (low == null && high == null) return null;
  const MARK: Record<Status, string> = { normal: c.ok, borderline: c.warn, low: c.bad, high: c.bad, critical: c.crit };
  const lo = low ?? 0;
  const hi = high ?? Math.max(lo * 1.5, value * 1.2, 1);
  const span = Math.max(hi - lo, Math.abs(hi) * 0.1, 0.0001);
  const min = low == null ? 0 : Math.max(0, Math.min(lo - span * 0.7, value - span * 0.1));
  const max = high == null ? Math.max(hi, value * 1.1) : Math.max(hi + span * 0.7, value + span * 0.1);
  const pos = (x: number) => Math.min(100, Math.max(0, ((x - min) / (max - min)) * 100));
  const bandL = low == null ? 0 : pos(lo);
  const bandR = high == null ? 100 : pos(hi);
  const at = pos(value);
  const color = MARK[status];
  const abnormal = status !== 'normal';
  const ariaLabel = `${value}, normal range ${low ?? ''}${low != null && high != null ? ' to ' : ''}${high ?? ''}`;
  // keep the pin and edge numbers inside the box
  const shift = (p: number) => (p < 7 ? '0%' : p > 93 ? '-100%' : '-50%');
  const lowW = bandL, normW = bandR - bandL, highW = 100 - bandR;
  // a zone's word is hidden when the pin sits on top of it
  const clear = (centre: number) => Math.abs(at - centre) > 11;

  return (
    <div ref={box} className="relative mt-2 select-none pb-6 pt-9" role="img" aria-label={ariaLabel}>
      {/* the zones */}
      <div className="relative flex h-5 overflow-hidden rounded-full ring-1 ring-line">
        {lowW > 0.5 && <div className="flex items-center justify-center bg-bad-tint text-[11px] font-medium text-bad" style={{ width: `${lowW}%` }}>{lowW >= 16 && clear(lowW / 2) ? t('low') : ''}</div>}
        <div className="flex items-center justify-center bg-ok-tint text-[11px] font-medium text-ok" style={{ width: `${normW}%` }}>{normW >= 20 && clear(bandL + normW / 2) ? t('normal') : ''}</div>
        {highW > 0.5 && <div className="flex items-center justify-center bg-bad-tint text-[11px] font-medium text-bad" style={{ width: `${highW}%` }}>{highW >= 16 && clear(bandR + highW / 2) ? t('high') : ''}</div>}
      </div>

      {/* normal limits */}
      {low != null && <span className="absolute bottom-0 text-xs tabular-nums text-muted" style={{ left: `${bandL}%`, transform: `translateX(${shift(bandL)})` }}>{low}</span>}
      {high != null && <span className="absolute bottom-0 text-xs tabular-nums text-muted" style={{ left: `${bandR}%`, transform: `translateX(${shift(bandR)})` }}>{high}</span>}

      {/* the value pin: slides in from the left, and pulses when the value is outside normal */}
      <div className="absolute top-0 h-full" style={{ left: shown ? `${at}%` : '0%', transition: 'left 1s cubic-bezier(.2,.8,.2,1)' }} aria-hidden="true">
        <div className="absolute top-0 -translate-x-1/2" style={{ transform: `translateX(${shift(at)})` }}>
          <div className="whitespace-nowrap rounded-md px-2 py-0.5 text-sm font-semibold tabular-nums shadow" style={{ background: color, color: c.surface, opacity: shown ? 1 : 0, transition: 'opacity .5s .3s' }}>{value}</div>
        </div>
        <div className="absolute top-[26px] h-7 w-[3px] -translate-x-1/2 rounded" style={{ background: color }} />
        <div className="absolute top-[35px] h-3.5 w-3.5 -translate-x-1/2 rounded-full border-2" style={{ background: c.surface, borderColor: color }}>
          {abnormal && <span className="absolute inset-[-5px] animate-ping rounded-full opacity-40" style={{ background: color }} />}
        </div>
      </div>
    </div>
  );
}
