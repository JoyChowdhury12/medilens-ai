'use client';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import Icon from '@/components/Icon';
import Shell from '@/components/Shell';
import { useToast } from '@/components/Toast';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fmtDate, today } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { Reminder } from '@/lib/types';

export default function RemindersPage() {
  const { t, lang } = useT();
  const { current } = useAuth();
  const toast = useToast();
  const [list, setList] = useState<Reminder[] | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [title, setTitle] = useState('');
  const [due, setDue] = useState(today());

  const load = useCallback(() => {
    if (current) api<Reminder[]>(`/reminders?profileId=${current.id}`).then(setList);
  }, [current]);
  useEffect(() => { setList(null); load(); }, [load]);

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!current) return;
    try { await api('/reminders', { body: { profileId: current.id, title, dueDate: due } }); setTitle(''); toast(t('toastReminder')); load(); }
    catch (x: any) { toast(x.message, 'error'); }
  }
  const toggle = async (r: Reminder) => { await api(`/reminders/${r.id}`, { method: 'PATCH', body: { done: !r.done } }); load(); };
  const del = async (r: Reminder) => { await api(`/reminders/${r.id}`, { method: 'DELETE' }); toast(t('toastDeleted')); load(); };

  const shown = (list ?? []).filter((r) => showDone || !r.done);
  return (
    <Shell>
      <h1 className="mb-1">{t('remindersTitle')}</h1>
      <p className="mb-5 text-muted">{current?.name}</p>

      <div className="grid items-start gap-5 lg:grid-cols-[360px_1fr]">
      <form onSubmit={add} className="panel grid gap-3 lg:sticky lg:top-6">
        <div><label htmlFor="rt">{t('reminderText')}</label><input id="rt" className="w-full" required minLength={2} maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} /></div>
        <div><label htmlFor="rd">{t('dueDate')}</label><input id="rd" type="date" className="w-full" required value={due} onChange={(e) => setDue(e.target.value)} /></div>
        <button className="btn gap-2"><Icon name="plus" size={18} />{t('add')}</button>
      </form>

      <div>
      <section className="panel">
        {list === null && <div className="skeleton h-16 w-full" />}
        {list && shown.length === 0 && <p className="text-muted">{t('noUpcoming')}</p>}
        <ul>
          {shown.map((r) => {
            const late = !r.done && r.dueDate < today();
            return (
              <li key={r.id} className="flex items-start gap-3 border-t border-line py-3 first:border-0">
                <input type="checkbox" className="mt-1 h-5 w-5 min-h-0" checked={r.done} onChange={() => toggle(r)} aria-label={t('done')} />
                <div className="flex-1">
                  <div className={r.done ? 'text-muted line-through' : ''}>{r.title}</div>
                  <div className={`text-sm ${late ? 'font-medium text-bad' : 'text-muted'}`}>{fmtDate(r.dueDate, lang)}{late ? ` · ${t('overdue')}` : ''}</div>
                </div>
                <button className="rounded p-2 text-muted hover:bg-wash hover:text-bad" onClick={() => del(r)} aria-label={t('remove')}><Icon name="trash" size={18} /></button>
              </li>
            );
          })}
        </ul>
      </section>
      <label className="mt-4 flex items-center gap-2 text-base font-normal text-ink">
        <input type="checkbox" className="h-5 w-5 min-h-0" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> {t('showDone')}
      </label>
      </div>
      </div>
    </Shell>
  );
}
