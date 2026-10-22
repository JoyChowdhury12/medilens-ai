'use client';
import { FormEvent, useState } from 'react';
import Avatar from '@/components/Avatar';
import Icon from '@/components/Icon';
import Shell from '@/components/Shell';
import { useConfirm } from '@/components/ConfirmDialog';
import { useToast } from '@/components/Toast';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { Profile } from '@/lib/types';

const RELATIONS = ['self', 'mother', 'father', 'spouse', 'son', 'daughter', 'brother', 'sister', 'other'];
const blank = { name: '', relation: 'mother', sex: '', birthDate: '' };

export default function FamilyPage() {
  const { t } = useT();
  const { profiles, reloadProfiles } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [form, setForm] = useState(blank);
  const [editId, setEditId] = useState<string | null>(null);
  const [err, setErr] = useState('');

  const edit = (p: Profile) => { setEditId(p.id); setForm({ name: p.name, relation: p.relation, sex: p.sex ?? '', birthDate: p.birthDate ?? '' }); window.scrollTo(0, 0); };
  const reset = () => { setEditId(null); setForm(blank); setErr(''); };

  async function submit(e: FormEvent) {
    e.preventDefault(); setErr('');
    const body: any = { name: form.name, relation: form.relation };
    if (form.sex) body.sex = form.sex;
    if (form.birthDate) body.birthDate = form.birthDate;
    try {
      if (editId) await api(`/profiles/${editId}`, { method: 'PATCH', body });
      else await api('/profiles', { body });
      await reloadProfiles(); reset(); toast(t('toastSaved'));
    } catch (x: any) { setErr(x.message || t('genericError')); }
  }
  async function del(p: Profile) {
    if (!(await confirm({ title: t('delMemberTitle'), message: t('sureDeleteMember'), confirmLabel: t('yesDelete'), danger: true }))) return;
    await api(`/profiles/${p.id}`, { method: 'DELETE' }); await reloadProfiles(); toast(t('toastDeleted'));
  }

  return (
    <Shell>
      <h1 className="mb-4">{t('familyTitle')}</h1>
      <div className="grid items-start gap-5 lg:grid-cols-2">
      <ul className="panel">
        {profiles.map((p) => (
          <li key={p.id} className="border-t border-line py-3 first:border-0 first:pt-0 last:pb-0">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3"><Avatar name={p.name} size={40} /><div><div className="font-medium">{p.name}</div>
                <div className="text-sm text-muted">{t(`rel_${p.relation}`) === `rel_${p.relation}` ? p.relation : t(`rel_${p.relation}`)}{p.sex ? ` · ${t(p.sex)}` : ''}</div></div></div>
              <div className="flex gap-4 text-sm">
                <button className="link" onClick={() => edit(p)}>{t('edit')}</button>
                {p.relation !== 'self' && <button className="text-bad underline underline-offset-2" onClick={() => del(p)}>{t('deleteMember')}</button>}
              </div>
            </div>
          </li>
        ))}
      </ul>

      <form onSubmit={submit} className="panel grid gap-4 sm:grid-cols-2 lg:sticky lg:top-6">
        <h2 className="sm:col-span-2">{editId ? t('edit') : t('addMember')}</h2>
        <div><label htmlFor="n">{t('name')}</label><input id="n" className="w-full" required maxLength={80} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
        <div><label htmlFor="r">{t('relation')}</label>
          <select id="r" className="w-full" value={form.relation} onChange={(e) => setForm({ ...form, relation: e.target.value })}>
            {RELATIONS.map((r) => <option key={r} value={r}>{t(`rel_${r}`)}</option>)}
          </select></div>
        <div><label htmlFor="s">{t('sex')}</label>
          <select id="s" className="w-full" value={form.sex} onChange={(e) => setForm({ ...form, sex: e.target.value })}>
            <option value="">{t('unspecified')}</option><option value="male">{t('male')}</option><option value="female">{t('female')}</option>
          </select><p className="mt-1 text-sm text-muted">{t('sexHint')}</p></div>
        <div><label htmlFor="b">{t('birthDate')}</label><input id="b" type="date" className="w-full" value={form.birthDate} onChange={(e) => setForm({ ...form, birthDate: e.target.value })} /></div>
        {err && <p role="alert" className="text-bad sm:col-span-2">{err}</p>}
        <div className="flex gap-3 sm:col-span-2">
          <button className="btn gap-2"><Icon name={editId ? 'check' : 'plus'} size={18} />{editId ? t('save') : t('add')}</button>
          {editId && <button type="button" className="btn-quiet" onClick={reset}>{t('cancel')}</button>}
        </div>
      </form>
      </div>
    </Shell>
  );
}
