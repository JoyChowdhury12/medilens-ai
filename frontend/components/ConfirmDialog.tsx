'use client';
import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useT } from '@/lib/i18n';
import Icon from './Icon';

export interface ConfirmOpts { title: string; message?: string; confirmLabel: string; danger?: boolean; icon?: string }
type Ask = (o: ConfirmOpts) => Promise<boolean>;
const Ctx = createContext<Ask>(async () => false);
export const useConfirm = () => useContext(Ctx);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const { t } = useT();
  const [open, setOpen] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  const ask = useCallback<Ask>((o) => new Promise((resolve) => setOpen({ ...o, resolve })), []);
  const close = (v: boolean) => { open?.resolve(v); setOpen(null); };

  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { open.resolve(false); setOpen(null); } };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <Ctx.Provider value={ask}>
      {children}
      {open && (
        <div className="no-print fixed inset-0 z-[60] flex items-end justify-center bg-ink/40 p-4 sm:items-center" onMouseDown={(e) => { if (e.target === e.currentTarget) close(false); }}>
          <div role="alertdialog" aria-modal="true" aria-labelledby="cd-title" aria-describedby="cd-text"
            className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <div className={`mx-auto flex h-12 w-12 items-center justify-center rounded-full ${open.danger ? 'bg-bad-tint text-bad' : 'bg-brand-tint text-brand'}`}>
              <Icon name={open.icon ?? (open.danger ? 'trash' : 'logout')} size={24} />
            </div>
            <h2 id="cd-title" className="mt-4 text-center text-xl">{open.title}</h2>
            {open.message && <p id="cd-text" className="mt-2 text-center text-muted">{open.message}</p>}
            <div className="mt-6 grid grid-cols-2 gap-3">
              <button ref={cancelRef} className="btn-quiet" onClick={() => close(false)}>{t('cancel')}</button>
              <button className={`btn ${open.danger ? '!bg-bad hover:!opacity-90' : ''}`} onClick={() => close(true)}>{open.confirmLabel}</button>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}
