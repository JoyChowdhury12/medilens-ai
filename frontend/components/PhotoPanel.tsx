'use client';
import { useEffect, useRef, useState } from 'react';
import { useT } from '@/lib/i18n';
import Icon from './Icon';

export type Spot = {
  key: number; name: string; value: string; unit: string; low: string; high: string;
  box?: number[] | null; valueBox?: number[] | null; needsCheck?: boolean; agree?: number; found?: number;
};

const ZOOMS = [1, 1.5, 2, 3];

/**
 * "Where we read it": the report photo with a box on every value the AI read. The chosen value is outlined,
 * the rest of the page is dimmed, and a zoomed strip shows exactly what was read from that line.
 * Positions are fractions of the image (0-1), so they work at any size and zoom.
 */
export default function PhotoPanel({ src, spots, selected, onSelect }: {
  src: string; spots: Spot[]; selected: number | null; onSelect: (key: number) => void;
}) {
  const { t } = useT();
  const view = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [showAll, setShowAll] = useState(true);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const sel = spots.find((s) => s.key === selected && s.box) ?? null;

  // bring the chosen line into view (and zoom in a little the first time)
  useEffect(() => {
    if (!sel?.box || !view.current) return;
    const z = zoom < 1.5 ? 1.5 : zoom;
    if (z !== zoom) setZoom(z);
    requestAnimationFrame(() => {
      const v = view.current!;
      const W = v.clientWidth * z;
      const H = size ? (W * size.h) / size.w : W * 1.4;
      const [x0, y0, x1, y1] = sel.box!;
      // line up the start of the row (its test name) with the left edge, so the name and the value are both visible
      v.scrollTo({ left: x0 * W - 24, top: ((y0 + y1) / 2) * H - v.clientHeight / 3, behavior: 'smooth' });
    });
  }, [selected]); // eslint-disable-line react-hooks/exhaustive-deps

  const pct = (b: number[]) => ({ left: `${b[0] * 100}%`, top: `${b[1] * 100}%`, width: `${(b[2] - b[0]) * 100}%`, height: `${(b[3] - b[1]) * 100}%` });
  const pad = (b: number[], px = 0.006, py = 0.004) => [Math.max(0, b[0] - px), Math.max(0, b[1] - py), Math.min(1, b[2] + px), Math.min(1, b[3] + py)];

  // the zoomed strip: the chosen line cut out of the photo with CSS
  const strip = sel?.box && size ? (() => {
    const [x0, y0, x1, y1] = pad(sel.box!, 0.01, 0.006);
    const bw = x1 - x0, bh = y1 - y0;
    return {
      backgroundImage: `url(${src})`, backgroundSize: `${100 / bw}% auto`,
      backgroundPosition: `${(x0 / (1 - bw || 1)) * 100}% ${(y0 / (1 - bh || 1)) * 100}%`,
      aspectRatio: `${(bw * size.w) / (bh * size.h)}`,
    };
  })() : null;

  const agreeText = !sel ? '' : (sel.found ?? 0) <= 1 ? t('readOnce')
    : sel.agree === sel.found ? t('readsAgree').replace('{n}', String(sel.found)) : t('readsDisagree');

  return (
    <section className="rounded-xl border border-line bg-white p-3 sm:p-4" aria-label={t('photoTitle')}>
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base">{t('photoTitle')}</h2>
        <div className="flex items-center gap-1.5">
          <button className="zoom-btn" onClick={() => setZoom(ZOOMS[Math.max(0, ZOOMS.indexOf(zoom) - 1)] ?? 1)} aria-label={t('zoomOut')} disabled={zoom <= 1}>−</button>
          <button className="zoom-btn" onClick={() => setZoom(ZOOMS[Math.min(ZOOMS.length - 1, ZOOMS.indexOf(zoom) + 1)] ?? 1.5)} aria-label={t('zoomIn')} disabled={zoom >= 3}>+</button>
          <button className="zoom-btn px-2.5" onClick={() => setZoom(1)}>{t('fit')}</button>
          <button className={`zoom-btn px-2.5 ${showAll ? 'border-brand text-brand' : ''}`} onClick={() => setShowAll(!showAll)} aria-pressed={showAll}>
            {showAll && <Icon name="check" size={14} />}{t('allBoxes')}
          </button>
        </div>
      </div>

      <div ref={view} className="relative h-[46vh] overflow-auto rounded-lg border border-line bg-wash lg:h-[58vh]">
        <div className="relative transition-[width] duration-300" style={{ width: `${zoom * 100}%` }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="" className="block w-full select-none" draggable={false}
            onLoad={(e) => setSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })} />

          {showAll && spots.filter((s) => s.box && s.key !== selected).map((s) => {
            const b = pad(s.valueBox ?? s.box!, 0.004, 0.003);
            return (
              <button key={s.key} onClick={() => { setHover(null); onSelect(s.key); }} onMouseEnter={() => setHover(s.key)} onMouseLeave={() => setHover(null)}
                title={`${s.name} · ${s.value} ${s.unit}`} aria-label={`${s.name} ${s.value}`}
                className={`spot ${s.needsCheck ? 'spot-check' : ''}`} style={pct(b)}>
                {hover === s.key && <span className="spot-tip">{s.name} · {s.value} {s.unit}</span>}
              </button>
            );
          })}

          {sel?.box && (
            <div className="spot-sel" style={pct(pad(sel.box))}>
              <span className="spot-tag">{sel.name} · {sel.value} {sel.unit}</span>
            </div>
          )}
        </div>
      </div>

      {sel ? (
        <div className="fade-in mt-3 rounded-lg border border-line bg-wash/60 p-3" key={sel.key}>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t('zoomedTitle')}</p>
          {strip && <div className="mt-2 w-full rounded-md border border-line bg-white bg-no-repeat" style={strip} />}
          <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-[1.5fr_1fr_1fr_1.3fr]">
            {[[t('testName'), sel.name], [t('value'), sel.value], [t('unit'), sel.unit], [t('range'), `${sel.low || '–'} – ${sel.high || '–'}`]].map(([k, v]) => (
              <div key={k} className="rounded-md border border-line bg-white px-2.5 py-1.5"><div className="text-xs text-muted">{k}</div><div className="break-words font-semibold leading-snug">{v}</div></div>
            ))}
          </div>
          <p className={`mt-2 flex items-center gap-1.5 text-sm font-medium ${sel.needsCheck || (sel.agree ?? 0) < (sel.found ?? 0) ? 'text-warn' : 'text-ok'}`}>
            <Icon name={sel.needsCheck || (sel.agree ?? 0) < (sel.found ?? 0) ? 'alert' : 'check'} size={16} />
            {sel.needsCheck ? t('pleaseCompare') : agreeText}
          </p>
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted">{t('photoHint')}</p>
      )}
    </section>
  );
}
