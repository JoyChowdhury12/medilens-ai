'use client';
import { FormEvent, ReactNode, useEffect, useRef, useState } from 'react';
import Avatar from '@/components/Avatar';
import Icon from '@/components/Icon';
import Shell, { LangToggle } from '@/components/Shell';
import { useToast } from '@/components/Toast';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useConfirm } from '@/components/ConfirmDialog';
import { fmtDate } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { HistoryItem, Reminder } from '@/lib/types';

/** Shrink a chosen picture to a 256px square JPEG so it stays small (about 15 KB). */
function shrink(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const S = 256, side = Math.min(img.width, img.height);
      const c = document.createElement('canvas'); c.width = c.height = S;
      c.getContext('2d')!.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, S, S);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bad image')); };
    img.src = url;
  });
}

const BLOOD = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

function Section({ icon, title, children }: { icon: string; title: string; children: ReactNode }) {
  return (
    <section className="panel p-5 sm:p-6">
      <h2 className="mb-4 flex items-center gap-2 text-xl"><Icon name={icon} size={20} className="text-brand" />{title}</h2>
      {children}
    </section>
  );
}

function AccountBody() {
  const { t, lang } = useT();
  const { user, setUser, signOut, profiles, reloadProfiles } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const logout = async () => {
    if (await confirm({ title: t('logoutTitle'), message: t('logoutText'), confirmLabel: t('logoutYes'), icon: 'logout' })) signOut();
  };
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(user?.name ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const me = profiles.find((p) => p.relation === 'self') ?? null;
  const [sex, setSex] = useState(me?.sex ?? '');
  const [birth, setBirth] = useState(me?.birthDate ?? '');
  const [blood, setBlood] = useState(user?.bloodGroup ?? '');
  const [city, setCity] = useState(user?.city ?? '');
  const [emName, setEmName] = useState(user?.emergencyName ?? '');
  const [emPhone, setEmPhone] = useState(user?.emergencyPhone ?? '');
  const [stats, setStats] = useState<{ reports: number; reminders: number } | null>(null);
  const [savingP, setSavingP] = useState(false);

  useEffect(() => { setSex(me?.sex ?? ''); setBirth(me?.birthDate ?? ''); }, [me?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    (async () => {
      try {
        const per = await Promise.all(profiles.map(async (p) => ({
          h: await api<HistoryItem[]>(`/profiles/${p.id}/reports`),
          r: await api<Reminder[]>(`/reminders?profileId=${p.id}`),
        })));
        setStats({
          reports: per.reduce((n, x) => n + x.h.filter((r) => r.status === 'CONFIRMED').length, 0),
          reminders: per.reduce((n, x) => n + x.r.filter((r) => !r.done).length, 0),
        });
      } catch { /* numbers are optional */ }
    })();
  }, [profiles]);
  const [pw, setPw] = useState({ cur: '', next: '', again: '' });
  const [pwErr, setPwErr] = useState('');
  const [savingPw, setSavingPw] = useState(false);
  const [askDel, setAskDel] = useState(false);
  const [delPw, setDelPw] = useState('');
  const [delErr, setDelErr] = useState('');

  if (!user) return null;

  async function saveProfile(e: FormEvent) {
    e.preventDefault(); setSavingP(true);
    try {
      setUser(await api('/auth/me', { method: 'PATCH', body: { name, phone, bloodGroup: blood, city, emergencyName: emName, emergencyPhone: emPhone } }));
      if (me) { // sex and birth date belong to your own family profile, which sets the normal ranges
        const body: any = {};
        if (sex) body.sex = sex;
        if (birth) body.birthDate = birth;
        if (Object.keys(body).length) await api(`/profiles/${me.id}`, { method: 'PATCH', body });
      }
      await reloadProfiles();
      toast(t('accSaved'));
    } catch (x: any) { toast(x.message, 'error'); }
    setSavingP(false);
  }

  async function pickPhoto(f?: File) {
    if (!f) return;
    try {
      setUser(await api('/auth/me', { method: 'PATCH', body: { avatar: await shrink(f) } }));
      toast(t('accSaved'));
    } catch (x: any) { toast(x.message === 'bad image' ? t('accPhotoBad') : x.message, 'error'); }
    if (fileRef.current) fileRef.current.value = '';
  }
  async function removePhoto() {
    try { setUser(await api('/auth/me', { method: 'PATCH', body: { avatar: null } })); toast(t('accSaved')); }
    catch (x: any) { toast(x.message, 'error'); }
  }

  async function changePw(e: FormEvent) {
    e.preventDefault(); setPwErr('');
    if (pw.next !== pw.again) return setPwErr(t('accPwMismatch'));
    setSavingPw(true);
    try {
      const r = await api('/auth/password', { body: { currentPassword: user!.hasPassword ? pw.cur : undefined, newPassword: pw.next } });
      setUser(r.user); setPw({ cur: '', next: '', again: '' });
      toast(user!.hasPassword ? t('accPwChanged') : t('accPwSet'));
    } catch (x: any) { setPwErr(x.message); }
    setSavingPw(false);
  }

  async function deleteAccount() {
    setDelErr('');
    try { await api('/auth/me', { method: 'DELETE', body: { password: delPw } }); signOut(); }
    catch (x: any) { setDelErr(x.message); }
  }

  return (
    <>
      <h1 className="text-3xl">{t('accTitle')}</h1>
      <p className="mt-1 text-muted">{t('accIntro')}</p>

      <div className="mt-6 grid items-start gap-5 lg:grid-cols-[320px_1fr]">
        {/* Profile card */}
        <aside className="panel text-center lg:sticky lg:top-6">
          <div className="relative mx-auto w-fit">
            <Avatar name={user.name} src={user.avatar} size={112} />
            <button type="button" onClick={() => fileRef.current?.click()} aria-label={t('accChangePhoto')}
              className="absolute -bottom-1 -right-1 flex h-10 w-10 items-center justify-center rounded-full border-2 border-white bg-brand text-white shadow hover:bg-brand-dark">
              <Icon name="camera" size={18} />
            </button>
          </div>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" aria-label={t('accChangePhoto')}
            onChange={(e) => pickPhoto(e.target.files?.[0])} />
          <h2 className="mt-4 text-2xl">{user.name}</h2>
          <p className="break-all text-muted">{user.email}</p>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {user.google && <span className="chip">Google</span>}
            {user.hasPassword && <span className="chip">{t('accEmailPw')}</span>}
          </div>
          {user.avatar && <button type="button" className="link mt-3 text-sm" onClick={removePhoto}>{t('accRemovePhoto')}</button>}
          <dl className="mt-5 grid grid-cols-3 gap-2 border-t border-line pt-5">
            {[[t('accStatFamily'), profiles.length], [t('accStatReports'), stats?.reports], [t('accStatReminders'), stats?.reminders]].map(([l, n]) => (
              <div key={l as string}><dd className="text-2xl font-semibold tabular-nums">{n ?? '–'}</dd><dt className="text-xs text-muted">{l}</dt></div>
            ))}
          </dl>
          <p className="mt-5 text-sm text-muted">{t('accMember')} {fmtDate(user.createdAt, lang)}</p>
          <div className="mt-4 flex justify-center"><LangToggle /></div>
          <button onClick={logout} className="btn-quiet mt-3 w-full gap-2"><Icon name="logout" size={18} />{t('logout')}</button>
        </aside>

        <div className="space-y-5">
          <form onSubmit={saveProfile} className="space-y-5">
            <Section icon="user" title={t('accDetails')}>
              <div className="grid gap-4 sm:grid-cols-2">
                <div><label htmlFor="acc-name">{t('yourName')}</label>
                  <input id="acc-name" className="w-full" required minLength={2} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></div>
                <div><label htmlFor="acc-email">{t('email')}</label>
                  <input id="acc-email" className="w-full bg-wash" value={user.email} readOnly />
                  <p className="mt-1 text-sm text-muted">{t('accEmailFixed')}</p></div>
                <div><label htmlFor="acc-phone">{t('accPhone')}</label>
                  <input id="acc-phone" type="tel" className="w-full" maxLength={30} value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" /></div>
                <div><label htmlFor="acc-city">{t('accCity')}</label>
                  <input id="acc-city" className="w-full" maxLength={80} value={city} onChange={(e) => setCity(e.target.value)} autoComplete="address-level2" /></div>
              </div>
            </Section>

            <Section icon="shield" title={t('accHealth')}>
              <p className="-mt-2 mb-4 text-sm text-muted">{t('accHealthHint')}</p>
              <div className="grid gap-4 sm:grid-cols-3">
                <div><label htmlFor="acc-sex">{t('sex')}</label>
                  <select id="acc-sex" className="w-full" value={sex} onChange={(e) => setSex(e.target.value)}>
                    <option value="">{t('unspecified')}</option><option value="male">{t('male')}</option><option value="female">{t('female')}</option>
                  </select></div>
                <div><label htmlFor="acc-birth">{t('birthDate')}</label>
                  <input id="acc-birth" type="date" className="w-full" max={new Date().toISOString().slice(0, 10)} value={birth} onChange={(e) => setBirth(e.target.value)} /></div>
                <div><label htmlFor="acc-blood">{t('accBlood')}</label>
                  <select id="acc-blood" className="w-full" value={blood} onChange={(e) => setBlood(e.target.value)}>
                    <option value="">{t('accSelectNone')}</option>{BLOOD.map((b) => <option key={b} value={b}>{b}</option>)}
                  </select></div>
              </div>
            </Section>

            <Section icon="bell" title={t('accContact')}>
              <div className="grid gap-4 sm:grid-cols-2">
                <div><label htmlFor="acc-emn">{t('accEmName')}</label>
                  <input id="acc-emn" className="w-full" maxLength={80} value={emName} onChange={(e) => setEmName(e.target.value)} /></div>
                <div><label htmlFor="acc-emp">{t('accEmPhone')}</label>
                  <input id="acc-emp" type="tel" className="w-full" maxLength={30} value={emPhone} onChange={(e) => setEmPhone(e.target.value)} /></div>
              </div>
            </Section>
            <button className="btn" disabled={savingP}>{savingP ? t('working') : t('save')}</button>
          </form>

          <Section icon="lock" title={t('accSecurity')}>
            {!user.hasPassword && <p className="mb-4 text-muted">{t('accGoogleOnly')}</p>}
            <form onSubmit={changePw} className="grid gap-4 sm:grid-cols-2">
              {user.hasPassword && (
                <div className="sm:col-span-2"><label htmlFor="pw-cur">{t('accCurrentPw')}</label>
                  <input id="pw-cur" type="password" className="w-full sm:max-w-sm" required value={pw.cur} onChange={(e) => setPw({ ...pw, cur: e.target.value })} autoComplete="current-password" /></div>
              )}
              <div><label htmlFor="pw-new">{t('accNewPw')}</label>
                <input id="pw-new" type="password" className="w-full" required minLength={8} value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} autoComplete="new-password" />
                <p className="mt-1 text-sm text-muted">{t('accSecurityHint')}</p></div>
              <div><label htmlFor="pw-again">{t('accConfirmPw')}</label>
                <input id="pw-again" type="password" className="w-full" required minLength={8} value={pw.again} onChange={(e) => setPw({ ...pw, again: e.target.value })} autoComplete="new-password" /></div>
              {pwErr && <p role="alert" className="rounded bg-bad-tint px-3 py-2 text-bad sm:col-span-2">{pwErr}</p>}
              <div className="sm:col-span-2"><button className="btn" disabled={savingPw}>{savingPw ? t('working') : user.hasPassword ? t('accChangePw') : t('accSetPw')}</button></div>
            </form>
          </Section>

          <section className="rounded-xl border border-bad/30 bg-white p-5 sm:p-6">
            <h2 className="mb-2 flex items-center gap-2 text-xl text-bad"><Icon name="trash" size={20} />{t('accDanger')}</h2>
            <p className="text-muted">{t('accDangerText')}</p>
            {!askDel ? (
              <button className="btn-quiet mt-4 !border-bad/40 !text-bad" onClick={() => setAskDel(true)}>{t('accDeleteBtn')}</button>
            ) : (
              <div className="mt-4 max-w-md space-y-3">
                {user.hasPassword && (
                  <div><label htmlFor="del-pw">{t('password')}</label>
                    <input id="del-pw" type="password" className="w-full" value={delPw} onChange={(e) => setDelPw(e.target.value)} autoComplete="current-password" /></div>
                )}
                {delErr && <p role="alert" className="rounded bg-bad-tint px-3 py-2 text-bad">{delErr}</p>}
                <div className="flex gap-2">
                  <button className="btn !bg-bad" onClick={deleteAccount}>{t('accDeleteSure')}</button>
                  <button className="btn-quiet" onClick={() => { setAskDel(false); setDelPw(''); setDelErr(''); }}>{t('cancel2')}</button>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

export default function AccountPage() {
  return <Shell><AccountBody /></Shell>; // Shell renders its children only once the user is loaded
}
